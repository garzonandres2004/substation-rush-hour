// Lab: did we tune it to win? The full year walk forward (lab-year.ts) rerun under many settings,
// one changed at a time from the main page's defaults: the traffic index weights, the stress premium,
// the Station's size and its wear cost. Each run is the same walk forward: planned every night on
// the weather forecast as issued, battery charge carried day to day, graded on real demand.
// Jam relief is always measured on the DEFAULT index's jam hours (a fixed referee), so a setting
// cannot win by redefining what a jam is. The jam threshold itself is swept as a measurement check.
// Usage: tsx scripts/lab-sweep.ts            (all settings, one process)
//        tsx scripts/lab-sweep.ts 0/2         (half of them; then --merge)
//        tsx scripts/lab-sweep.ts --merge 2   (merge parts into public/data/lab-sweep.json)
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { runReplan } from '../src/engine/execute.js';
import { dispatch } from '../src/engine/dispatch.js';
import { loadHours } from '../src/engine/merge.js';
import { PARAMS as P } from '../src/engine/params.js';
import { buildDay } from '../src/engine/stress.js';
import { localDate } from '../src/engine/time.js';
import type { Asset, DayInputs, Hour, Params } from '../src/engine/types.js';

const PART_DIR = 'data/lab-raw/sweep';
const arg = process.argv[2];

type Weights = Params['stressWeights'];
interface Setting {
  id: string;
  group: 'default' | 'weights' | 'premium' | 'station' | 'wear';
  label: string;
  weights: Weights;
  premium: number;
  asset: Asset;
}
const W0 = P.stressWeights;
const A0 = P.asset;
const S = (
  id: string,
  group: Setting['group'],
  label: string,
  o: Partial<Pick<Setting, 'weights' | 'premium'>> & { asset?: Partial<Asset> },
): Setting => ({
  id,
  group,
  label,
  weights: o.weights ?? W0,
  premium: o.premium ?? P.stressPremium,
  asset: { ...A0, ...o.asset },
});
const SETTINGS: Setting[] = [
  S('default', 'default', 'Main page settings (30 / 30 / 20 / 20, premium $20, 10 MW 4 h)', {}),
  S('w-equal', 'weights', 'Equal weights 25 / 25 / 25 / 25', {
    weights: { demand: 0.25, netLoad: 0.25, ramp: 0.25, price: 0.25 },
  }),
  S('w-demand', 'weights', 'Demand heavy 50 / 20 / 10 / 20', {
    weights: { demand: 0.5, netLoad: 0.2, ramp: 0.1, price: 0.2 },
  }),
  S('w-net', 'weights', 'Net load heavy 20 / 50 / 10 / 20', {
    weights: { demand: 0.2, netLoad: 0.5, ramp: 0.1, price: 0.2 },
  }),
  S('w-ramp', 'weights', 'Ramp heavy 20 / 20 / 40 / 20', {
    weights: { demand: 0.2, netLoad: 0.2, ramp: 0.4, price: 0.2 },
  }),
  S('w-price', 'weights', 'Price heavy 20 / 20 / 10 / 50', {
    weights: { demand: 0.2, netLoad: 0.2, ramp: 0.1, price: 0.5 },
  }),
  S('p-0', 'premium', 'Stress premium $0 (price only signal, same guard)', { premium: 0 }),
  S('p-5', 'premium', 'Stress premium $5', { premium: 5 }),
  S('p-10', 'premium', 'Stress premium $10', { premium: 10 }),
  S('p-40', 'premium', 'Stress premium $40', { premium: 40 }),
  S('p-80', 'premium', 'Stress premium $80', { premium: 80 }),
  S('a-5x4', 'station', '5 MW, 4 h Station', { asset: { powerMW: 5, energyMWh: 20 } }),
  S('a-10x2', 'station', '10 MW, 2 h Station', { asset: { powerMW: 10, energyMWh: 20 } }),
  S('a-10x8', 'station', '10 MW, 8 h Station', { asset: { powerMW: 10, energyMWh: 80 } }),
  S('a-20x4', 'station', '20 MW, 4 h Station', { asset: { powerMW: 20, energyMWh: 80 } }),
  S('c-0', 'wear', 'Wear cost $0 per MWh', { asset: { cycleCostPerMWh: 0 } }),
  S('c-10', 'wear', 'Wear cost $10 per MWh', { asset: { cycleCostPerMWh: 10 } }),
];

if (arg === '--merge') {
  const n = Number(process.argv[3] ?? 2);
  const parts = Array.from({ length: n }, (_, k) => JSON.parse(fs.readFileSync(`${PART_DIR}/part-${k}.json`, 'utf8')));
  const out = {
    ...parts[0],
    settings: parts.flatMap(x => x.settings),
    thresholds: parts.find(x => x.thresholds)?.thresholds,
  };
  out.settings.sort((a: { order: number }, b: { order: number }) => a.order - b.order);
  fs.writeFileSync('public/data/lab-sweep.json', `${JSON.stringify(out, null, 1)}\n`);
  console.log(`merged ${out.settings.length} settings`);
  process.exit(0);
}
const [part, parts] = arg ? arg.split('/').map(Number) : [0, 1];
const mine = SETTINGS.map((s, order) => ({ ...s, order })).filter((_, i) => i % parts === part);

// ---------- data, exactly as lab-year.ts ----------
const RAW = 'data/lab-raw';
fs.mkdirSync(PART_DIR, { recursive: true });
const gz = (f: string) => JSON.parse(gunzipSync(fs.readFileSync(`lab-data/${f}.json.gz`)).toString());
for (const f of ['eia_demand', 'eia_demand_forecast', 'eia_fuel', 'lmp_TH_PACE_GEN-APND'])
  fs.writeFileSync(`${RAW}/${f}.json`, JSON.stringify(gz(f)));
fs.writeFileSync(`${RAW}/weather.json`, JSON.stringify(gz('weather_observed')));
const issuedRaw = gz('weather_issued').hourly;
const key = (s: string) => `${s.slice(0, 13)}:00:00Z`;
const issued = new Map<string, { temp: number; rad: number; cloud: number }>();
issuedRaw.time.forEach((t: string, i: number) => {
  const v = [
    issuedRaw.temperature_2m_previous_day1[i],
    issuedRaw.shortwave_radiation_previous_day1[i],
    issuedRaw.cloud_cover_previous_day1[i],
  ];
  if (v.every((x: number | null) => x !== null)) issued.set(key(t), { temp: v[0], rad: v[1], cloud: v[2] });
});
const all = loadHours(RAW);
const dates = [...new Set(all.map(h => localDate(h.t)))].sort();
const firstDemand = Date.parse(all.find(h => h.demand !== undefined)!.t);
const startOK = (d: string) => Date.parse(`${d}T12:00:00Z`) - firstDemand > 30 * 864e5;

interface DayCase {
  date: string;
  priced: boolean;
  day: DayInputs;
  act: number[];
  refJam: boolean[][]; // default index jam hours, per referee threshold
  overBefore: number;
}
const THRESHOLDS = [0.55, 0.6, 0.65, 0.7, 0.75];
const REF = THRESHOLDS.indexOf(P.congestedThreshold);

// Build every day under one set of index weights (no price days use the no price weights).
const daysFor = new Map<string, DayCase[]>();
function buildDays(w: Weights): DayCase[] {
  const k0 = JSON.stringify(w);
  const hit = daysFor.get(k0);
  if (hit) return hit;
  const pp: Params = { ...P, stressWeights: w };
  const np: Params = { ...P, stressWeights: { demand: 0.4, netLoad: 0.4, ramp: 0.2, price: 0 } };
  const out: DayCase[] = [];
  for (const d of dates) {
    if (!startOK(d)) continue;
    const dayHours = all.filter(h => localDate(h.t) === d);
    if (dayHours.length !== 24 || dayHours.some(h => !issued.has(h.t))) continue;
    const priced = dayHours.every(h => h.lmp !== undefined);
    const swapped: Hour[] = dayHours.map(h => ({ ...h, ...issued.get(h.t)!, lmp: priced ? h.lmp : 0 }));
    const day = buildDay([...all.filter(h => h.t < dayHours[0].t), ...swapped], d, priced ? pp : np);
    if (!day || day.actual!.demand.some(x => x === undefined)) continue;
    const k = day.loadMW[0] / day.demandHat[0];
    const act = day.actual!.demand.map(x => x! * k);
    out.push({
      date: d,
      priced,
      day,
      act,
      refJam: [],
      overBefore: act.reduce((s, l) => s + Math.max(0, l - day.capMW), 0),
    });
  }
  daysFor.set(k0, out);
  return out;
}
const t0 = Date.now();
const ref = buildDays(W0);
for (const c of ref) c.refJam = THRESHOLDS.map(th => c.day.stress.map(x => x >= th));
const refByDate = new Map(ref.map(c => [c.date, c]));
console.error(`part ${part}/${parts}: ${ref.length} days built in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

// ---------- one walk forward ----------
type Mode = 'ours' | 'priceGuard' | 'priceOnly';
interface DayOut {
  over: number;
  relief: number[]; // per referee threshold
  value: number;
}
function walk(days: DayCase[], s: Setting, mode: Mode): Map<string, DayOut> {
  const a = s.asset;
  let carry = a.energyMWh * a.startSocFrac;
  let prevMiss = 0;
  const res = new Map<string, DayOut>();
  for (const c of days) {
    const { day, act } = c;
    if (mode !== 'ours' && !c.priced) {
      prevMiss = act[23] - day.loadMW[23];
      continue;
    }
    const base = { forecastLoad: day.loadMW, cap: day.capMW, penalty: P.overloadPenalty, margin: 0 };
    const signal = mode === 'ours' ? day.lmp.map((x, i) => x + s.premium * day.stress[i]) : day.lmp;
    const sch =
      mode === 'priceOnly'
        ? dispatch(day.lmp, a, undefined, 0.25, carry)
        : runReplan(a, { ...base, signal }, act, true, prevMiss, carry);
    carry = sch.soc[23];
    prevMiss = act[23] - day.loadMW[23];
    const r = refByDate.get(c.date)!;
    let over = 0;
    let value = 0;
    for (let t = 0; t < 24; t++) {
      over += Math.max(0, act[t] + sch.charge[t] - sch.discharge[t] - day.capMW);
      value += day.lmp[t] * (sch.discharge[t] - sch.charge[t]) - a.cycleCostPerMWh * (sch.charge[t] + sch.discharge[t]);
    }
    const relief = r.refJam.map(j => j.reduce((sum, on, t) => sum + (on ? sch.discharge[t] - sch.charge[t] : 0), 0));
    res.set(c.date, { over, relief, value });
  }
  return res;
}

// ---------- run my settings ----------
const TOL = 0.1;
const mean = (xs: number[]) => xs.reduce((u, v) => u + v, 0) / (xs.length || 1);
const priceCache = new Map<string, { guard: Map<string, DayOut>; only: Map<string, DayOut> }>();
const results = mine.map(s => {
  const t1 = Date.now();
  const days = buildDays(s.weights);
  const ours = walk(days, s, 'ours');
  const ak = JSON.stringify(s.asset);
  if (!priceCache.has(ak)) priceCache.set(ak, { guard: walk(ref, s, 'priceGuard'), only: walk(ref, s, 'priceOnly') });
  const pr = priceCache.get(ak)!;
  const all2 = ref.filter(c => ours.has(c.date));
  const priced = all2.filter(c => c.priced);
  const subOver = all2.filter(c => c.overBefore > TOL);
  const worse = (m: Map<string, DayOut>, xs: DayCase[]) =>
    xs.filter(c => m.get(c.date)!.over > c.overBefore + TOL).length;
  const row = {
    id: s.id,
    order: (s as Setting & { order: number }).order,
    group: s.group,
    label: s.label,
    days: all2.length,
    pricedDays: priced.length,
    oursDaysMadeWorse: worse(ours, all2),
    substationOverDays: subOver.length,
    oursFullyCovered: subOver.filter(c => ours.get(c.date)!.over <= TOL).length,
    priceOnlyDaysMadeWorse: worse(pr.only, priced),
    priceGuardDaysMadeWorse: worse(pr.guard, priced),
    jamReliefPerDay: {
      ours: mean(priced.map(c => ours.get(c.date)!.relief[REF])),
      priceGuard: mean(priced.map(c => pr.guard.get(c.date)!.relief[REF])),
    },
    valuePerDay: {
      ours: mean(priced.map(c => ours.get(c.date)!.value)),
      priceGuard: mean(priced.map(c => pr.guard.get(c.date)!.value)),
    },
    oursJamReliefTrafficOnlyDays: mean(all2.filter(c => !c.priced).map(c => ours.get(c.date)!.relief[REF])),
    thresholds:
      s.id === 'default'
        ? THRESHOLDS.map((th, i) => ({
            threshold: th,
            ours: mean(priced.map(c => ours.get(c.date)!.relief[i])),
            priceGuard: mean(priced.map(c => pr.guard.get(c.date)!.relief[i])),
          }))
        : undefined,
  };
  console.error(
    `${s.id}: worse ${row.oursDaysMadeWorse}, relief ${row.jamReliefPerDay.ours.toFixed(1)} vs ${row.jamReliefPerDay.priceGuard.toFixed(1)}, value ${row.valuePerDay.ours.toFixed(0)} vs ${row.valuePerDay.priceGuard.toFixed(0)} (${((Date.now() - t1) / 1000).toFixed(0)} s)`,
  );
  return row;
});
const out = {
  generatedAt: new Date().toISOString(),
  method:
    'Full year walk forward (lab-year.ts) rerun once per setting, one setting changed at a time from the main page defaults. Planned every night on the weather forecast as issued, battery charge carried day to day, graded on real demand. Jam relief is measured on the default index jam hours (index 65 and up) for every setting; the threshold row varies that referee only.',
  first: ref[0].date,
  last: ref.at(-1)!.date,
  settings: results,
  thresholds: results.find(r => r.thresholds)?.thresholds,
};
if (parts === 1) fs.writeFileSync('public/data/lab-sweep.json', `${JSON.stringify(out, null, 1)}\n`);
else fs.writeFileSync(`${PART_DIR}/part-${part}.json`, JSON.stringify(out));
console.error(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
