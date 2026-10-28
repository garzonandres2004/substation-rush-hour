// Lab: the limit itself, over a full year. A transformer's real limit is its winding hot spot
// temperature (IEEE C57.91), so on a cold day it can carry more than its nameplate and on a hot day
// less. The year capacity study (lab-capacity-year.ts) used one fixed rating, the annual peak. Here
// the same year is rerun with an hourly heat based rating from Salt Lake City air temperature.
// Fair comparison: both substations are sized so today's load just fits. Fixed: 100 MW, the year's
// peak hour. Heat: the nameplate at which the tightest hour of the year (load against that hour's
// heat rating) sits exactly at the 110 C hot spot limit. Then: how much new always on load fits.
// The plan sees the rating from the temperature FORECAST issued the day before; the guard and the
// grading use the rating from the temperature that really happened (a substation measures its own).
// Usage: tsx scripts/lab-thermal-year.ts fixed|heat, then --merge. Writes public/data/lab-thermal-year.json.
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { runReplan } from '../src/engine/execute.js';
import { loadHours } from '../src/engine/merge.js';
import { PARAMS as p } from '../src/engine/params.js';
import { buildDay } from '../src/engine/stress.js';
import { ratingPU, simulate, XFMR } from '../src/engine/thermal.js';
import { localDate } from '../src/engine/time.js';
import type { DayInputs, Hour, Params } from '../src/engine/types.js';

const PART_DIR = 'data/lab-raw/thermal';
const arg = process.argv[2];
const KINDS = ['fixed', 'heat'] as const;
type Kind = (typeof KINDS)[number];

if (arg === '--merge') {
  const parts = KINDS.map(k => JSON.parse(fs.readFileSync(`${PART_DIR}/${k}.json`, 'utf8')));
  const out = { ...parts[0].meta, fixed: parts[0].result, heat: parts[1].result };
  fs.writeFileSync('public/data/lab-thermal-year.json', `${JSON.stringify(out, null, 1)}\n`);
  console.log(JSON.stringify({ fixed: out.fixed.summary, heat: out.heat.summary }, null, 1));
  process.exit(0);
}
const kind = arg as Kind;
if (!KINDS.includes(kind)) throw new Error('usage: fixed | heat | --merge');

// ---------- the year cases, as lab-capacity-year.ts, plus temperatures ----------
const RAW = 'data/lab-raw';
fs.mkdirSync(PART_DIR, { recursive: true });
const gz = (f: string) => JSON.parse(gunzipSync(fs.readFileSync(`lab-data/${f}.json.gz`)).toString());
if (!fs.existsSync(`${RAW}/eia_demand.json`)) {
  for (const f of ['eia_demand', 'eia_demand_forecast', 'eia_fuel', 'lmp_TH_PACE_GEN-APND'])
    fs.writeFileSync(`${RAW}/${f}.json`, JSON.stringify(gz(f)));
  fs.writeFileSync(`${RAW}/weather.json`, JSON.stringify(gz('weather_observed')));
}
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
const NO_PRICE: Params = { ...p, stressWeights: { demand: 0.4, netLoad: 0.4, ramp: 0.2, price: 0 } };
const firstDemand = Date.parse(all.find(h => h.demand !== undefined)!.t);
const dates = [...new Set(all.map(h => localDate(h.t)))].sort();
const maxDemand = Math.max(...all.filter(h => h.demand !== undefined).map(h => h.demand!));
const K = p.substationPeakMW / maxDemand;

interface Case {
  date: string;
  fc: number[];
  act: number[];
  signal: number[];
  prevMiss: number;
  tempObs: number[];
  tempIss: number[];
}
const cases: Case[] = [];
let prevMiss = 0;
for (const d of dates) {
  if (Date.parse(`${d}T12:00:00Z`) - firstDemand < 30 * 864e5) continue;
  const dayHours = all.filter(h => localDate(h.t) === d);
  if (dayHours.length !== 24 || dayHours.some(h => !issued.has(h.t) || h.demand === undefined)) continue;
  if (dayHours.some(h => h.temp === undefined)) continue;
  const priced = dayHours.every(h => h.lmp !== undefined);
  const swapped: Hour[] = dayHours.map(h => ({ ...h, ...issued.get(h.t)!, lmp: priced ? h.lmp : 0 }));
  const day: DayInputs | null = buildDay(
    [...all.filter(h => h.t < dayHours[0].t), ...swapped],
    d,
    priced ? p : NO_PRICE,
  );
  if (!day) continue;
  const fc = day.demandHat.map(x => x * K);
  const act = dayHours.map(h => h.demand! * K);
  cases.push({
    date: d,
    fc,
    act,
    signal: day.lmp.map((x, i) => x + p.stressPremium * day.stress[i]),
    prevMiss,
    tempObs: dayHours.map(h => h.temp!),
    tempIss: dayHours.map(h => issued.get(h.t)!.temp),
  });
  prevMiss = act[23] - fc[23];
}

// ---------- the two limits ----------
const pu = new Map<number, number>(); // rating per unit, cached by temperature to 0.1 C
const rpu = (t: number) => {
  const k = Math.round(t * 10);
  if (!pu.has(k)) pu.set(k, ratingPU(k / 10));
  return pu.get(k)!;
};
// Heat nameplate: today's load just touches the hot spot limit at its tightest hour.
let tight = { ratio: 0, date: '', hour: 0, tempC: 0, loadMW: 0 };
for (const c of cases)
  c.act.forEach((l, t) => {
    const r = l / rpu(c.tempObs[t]);
    if (r > tight.ratio) tight = { ratio: r, date: c.date, hour: t, tempC: c.tempObs[t], loadMW: l };
  });
const NAMEPLATE = tight.ratio;
const capFixed = () => p.substationPeakMW;
const capPlan = (c: Case) => (kind === 'fixed' ? capFixed() : c.tempIss.map(t => NAMEPLATE * rpu(t)));
const capReal = (c: Case) => (kind === 'fixed' ? capFixed() : c.tempObs.map(t => NAMEPLATE * rpu(t)));
const at = (cap: number | number[], t: number) => (Array.isArray(cap) ? cap[t] : cap);
console.error(`${kind}: ${cases.length} days, heat nameplate ${NAMEPLATE.toFixed(1)} MW at 30 C`);

// ---------- capacity ----------
const TOL = 0.1;
const A = p.asset;
type Mode = 'none' | 'ours';
function overFor(c: Case, x: number, mode: Mode) {
  const act = c.act.map(l => l + x);
  const real = capReal(c);
  let net = act;
  if (mode === 'ours') {
    const s = runReplan(
      A,
      { forecastLoad: c.fc.map(l => l + x), cap: capPlan(c), margin: 0, signal: c.signal, penalty: p.overloadPenalty },
      act,
      true,
      c.prevMiss,
      undefined,
      real,
    );
    net = act.map((l, t) => l + s.charge[t] - s.discharge[t]);
  }
  return net.reduce((s, l, t) => s + Math.max(0, l - at(real, t)), 0);
}
const ok = (c: Case, x: number, mode: Mode) => overFor(c, x, mode) <= TOL;
function dayMax(c: Case, mode: Mode, hi = 48) {
  if (!ok(c, 0, mode)) return 0;
  let lo = 0;
  let top = hi;
  while (top - lo > 0.25 + 1e-9) {
    const mid = Math.round((lo + top) / 2 / 0.25) * 0.25;
    if (ok(c, mid, mode)) lo = mid;
    else top = mid;
  }
  return lo;
}
const t0 = Date.now();
const result: Record<string, unknown> = {};
const summary: Record<string, unknown> = {};
for (const mode of ['none', 'ours'] as const) {
  const per = cases.map(c => ({ date: c.date, mw: dayMax(c, mode) }));
  let x = Math.min(...per.map(r => r.mw));
  while (x > 0 && !cases.every(c => ok(c, x, mode))) x -= 0.25;
  const months = [...new Set(per.map(r => r.date.slice(0, 7)))].map(m => ({
    month: m,
    mw: Math.min(...per.filter(r => r.date.startsWith(m)).map(r => r.mw)),
  }));
  const sorted = [...per].sort((u, v) => u.mw - v.mw);
  result[mode] = {
    yearMW: x,
    bindingDays: sorted.slice(0, 5),
    months,
    medianDayMW: sorted[Math.floor(sorted.length / 2)].mw,
  };
  summary[mode] = { yearMW: x, binding: sorted.slice(0, 3) };
  console.error(`${kind} ${mode}: ${x} MW (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}

// ---------- the limit itself, and what a fixed rating hides ----------
if (kind === 'heat') {
  const caps = cases.flatMap(c => capReal(c) as number[]);
  const plans = cases.flatMap(c => capPlan(c) as number[]);
  const miss = caps.map((v, i) => plans[i] - v); // positive = the forecast rating was too generous
  const temps = cases.flatMap(c => c.tempObs);
  // Hours where a 100 MW fixed rating (the annual peak) allows more than the heat limit does.
  const optimistic = caps.filter(v => v < p.substationPeakMW).length;
  // Hot spot of today's load (no new load) through the full heat model, with the oil's inertia.
  let maxHs = 0;
  let aging = 0;
  for (const c of cases) {
    const sim = simulate(c.act, c.tempObs, NAMEPLATE);
    maxHs = Math.max(maxHs, sim.maxHotSpotC);
    aging += sim.agingHours;
  }
  result.limit = {
    nameplateMW: NAMEPLATE,
    tightestHour: tight,
    ratingMW: { min: Math.min(...caps), mean: caps.reduce((a, b) => a + b, 0) / caps.length, max: Math.max(...caps) },
    tempC: { min: Math.min(...temps), max: Math.max(...temps) },
    hoursFixedRatingAboveHeatLimit: optimistic,
    hours: caps.length,
    forecastRatingMissMW: { maxTooGenerous: Math.max(...miss), maxTooStrict: -Math.min(...miss) },
    todayLoadMaxHotSpotC: maxHs,
    todayLoadAgingDays: aging / 24,
    puAt: [-10, 0, 10, 20, 23, 30, 35, 40].map(t => ({ tempC: t, pu: ratingPU(t) })),
  };
}
const meta = {
  generatedAt: new Date().toISOString(),
  method:
    'Year capacity case (issued forecasts, graded on real demand). Fixed: 100 MW all year (the annual peak). Heat: hourly rating = nameplate x the per unit load that holds a 110 C hot spot at that hour (IEEE C57.91 steady state, typical ONAF parameters, Salt Lake City air temperature); nameplate set so the tightest hour of the year sits exactly at the limit. The plan sees the rating from the issued temperature forecast; the guard and the grading use the real temperature.',
  days: cases.length,
  first: cases[0].date,
  last: cases.at(-1)!.date,
  transformer: XFMR,
  station: `${A.powerMW} MW, ${A.energyMWh / A.powerMW} h`,
};
fs.writeFileSync(`${PART_DIR}/${kind}.json`, JSON.stringify({ meta, result, summary }));
console.error(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
