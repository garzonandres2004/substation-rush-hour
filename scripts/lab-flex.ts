// Lab: compute that yields to grid traffic (the bounty's Option 2 question, asked inside Option 1).
// The year capacity case (lab-capacity-year.ts): a substation rated for its own annual peak, planned
// every night on issued forecasts, graded on real demand. Firm new load: 0 MW without storage, 7 MW
// with a 10 MW, 4 h Station. Now the new load is an AI data center that agrees to pause part of its
// training when the substation would go over, for a capped share of its yearly energy (the framing
// of Duke's Rethinking Load Growth, 2025: 0.25%, 0.5% and 1% of annual energy).
// For each size of new load we run the plan and count what is still over the rating: that is the
// training the data center pauses. Then: the largest load that fits for each pause budget, how many
// hours a year it pauses, how deep, and how dirty the grid is in those hours.
// Usage: tsx scripts/lab-flex.ts [k/n] then tsx scripts/lab-flex.ts --merge n.
// Writes public/data/lab-flex.json.
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { intensity } from '../src/engine/carbon.js';
import { runReplan } from '../src/engine/execute.js';
import { loadHours } from '../src/engine/merge.js';
import { PARAMS as p } from '../src/engine/params.js';
import { buildDay } from '../src/engine/stress.js';
import { localDate } from '../src/engine/time.js';
import type { Asset, DayInputs, Hour, Params } from '../src/engine/types.js';

const PART_DIR = 'data/lab-raw/flex';
const arg = process.argv[2];
const STEP = 0.5;
const MAX_X = 30;
const GRID = Array.from({ length: MAX_X / STEP + 1 }, (_, i) => i * STEP);
const STATIONS: [string, Asset | null][] = [
  ['No storage', null],
  ['10 MW, 4 h Station', { ...p.asset }],
  ['10 MW, 8 h Station', { ...p.asset, energyMWh: 80 }],
];
const BUDGETS = [0, 0.0025, 0.005, 0.01];
const SHARES = [1, 0.5, 0.3]; // share of the site that can pause in any hour

interface Point {
  x: number;
  pausedMWh: number;
  pausedHours: number;
  maxPauseMW: number;
  pausedKgCO2: number; // grid emissions in the paused MWh, at the hour's intensity
}

if (arg === '--merge') {
  const n = Number(process.argv[3] ?? 2);
  const parts = Array.from({ length: n }, (_, k) => JSON.parse(fs.readFileSync(`${PART_DIR}/part-${k}.json`, 'utf8')));
  const meta = parts[0].meta;
  const curves: Record<string, Point[]> = {};
  for (const [label] of STATIONS)
    curves[label] = parts.flatMap(x => x.curves[label] as Point[]).sort((a: Point, b: Point) => a.x - b.x);
  const hours = meta.days * 24;
  const result = STATIONS.map(([label]) => {
    const c = curves[label];
    // Largest load on the grid whose pauses fit the budget, scanning up from 0 (so a later
    // "lucky" point past a failure is never picked).
    const fit = (ok: (q: Point) => boolean) => {
      let best = 0;
      for (const q of c) {
        if (!ok(q)) break;
        best = q.x;
      }
      return best;
    };
    return {
      label,
      byBudget: BUDGETS.map(b => {
        const okB = (q: Point) => q.pausedMWh <= b * q.x * hours + 1e-9;
        const x = fit(okB);
        const q = c.find(r => r.x === x)!;
        return {
          budgetPct: b * 100,
          mw: x,
          pausedHoursPerYear: (q.pausedHours * 365) / meta.days,
          pausedMWhPerYear: (q.pausedMWh * 365) / meta.days,
          maxPauseShare: x > 0 ? q.maxPauseMW / x : 0,
          pausedKgPerMWh: q.pausedMWh > 0 ? q.pausedKgCO2 / q.pausedMWh : null,
          byShare: SHARES.map(s => ({
            share: s,
            mw: fit(r => okB(r) && r.maxPauseMW <= s * r.x + 1e-9),
          })),
        };
      }),
    };
  });
  const out = { ...meta, budgetsPct: BUDGETS.map(b => b * 100), shares: SHARES, result, curves };
  fs.writeFileSync('public/data/lab-flex.json', `${JSON.stringify(out, null, 1)}\n`);
  console.log(JSON.stringify(result, null, 1));
  process.exit(0);
}
const [part, parts] = arg ? arg.split('/').map(Number) : [0, 1];

// ---------- the year cases, built exactly as in lab-capacity-year.ts ----------
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
const RATING = p.substationPeakMW;

interface Case {
  date: string;
  fc: number[];
  act: number[];
  signal: number[];
  prevMiss: number;
  kg: number[]; // grid intensity per hour, kg CO2 per MWh (coal and gas share of generation)
}
const cases: Case[] = [];
let prevMiss = 0;
for (const d of dates) {
  if (Date.parse(`${d}T12:00:00Z`) - firstDemand < 30 * 864e5) continue;
  const dayHours = all.filter(h => localDate(h.t) === d);
  if (dayHours.length !== 24 || dayHours.some(h => !issued.has(h.t) || h.demand === undefined)) continue;
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
  const kg = dayHours.map(h => intensity(h) ?? Number.NaN);
  cases.push({ date: d, fc, act, signal: day.lmp.map((x, i) => x + p.stressPremium * day.stress[i]), prevMiss, kg });
  prevMiss = act[23] - fc[23];
}
console.error(`part ${part}/${parts}: ${cases.length} days`);

// Year average grid intensity, for comparison with the paused hours.
const kgAll = cases.flatMap(c => c.kg).filter(x => !Number.isNaN(x));
const kgMean = kgAll.reduce((a, b) => a + b, 0) / kgAll.length;

function point(x: number, a: Asset | null): Point {
  const q: Point = { x, pausedMWh: 0, pausedHours: 0, maxPauseMW: 0, pausedKgCO2: 0 };
  for (const c of cases) {
    const act = c.act.map(l => l + x);
    let net = act;
    if (a) {
      const s = runReplan(
        a,
        { forecastLoad: c.fc.map(l => l + x), cap: RATING, margin: 0, signal: c.signal, penalty: p.overloadPenalty },
        act,
        true,
        c.prevMiss,
      );
      net = act.map((l, t) => l + s.charge[t] - s.discharge[t]);
    }
    for (let t = 0; t < 24; t++) {
      // The data center pauses exactly what is over the rating, never more than its own load.
      const over = Math.max(0, net[t] - RATING);
      if (over > 1e-6) {
        const pause = Math.min(over, x);
        q.pausedMWh += pause;
        q.pausedHours++;
        q.maxPauseMW = Math.max(q.maxPauseMW, over); // over > x means pausing all of it is not enough
        if (!Number.isNaN(c.kg[t])) q.pausedKgCO2 += pause * c.kg[t];
      }
    }
  }
  return q;
}

const t0 = Date.now();
const mine = GRID.filter((_, i) => i % parts === part);
const curves: Record<string, Point[]> = {};
for (const [label, a] of STATIONS) {
  curves[label] = mine.map(x => point(x, a));
  console.error(`${label}: ${mine.length} sizes, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
const meta = {
  generatedAt: new Date().toISOString(),
  method:
    'Year capacity case (rating = annual peak, 100 MW), planned every night on issued forecasts, graded on real demand. For each new load size, the plan runs, and whatever is still over the rating is paused by the data center (never more than its own load). Budget = paused MWh as a share of the new load times every hour of the study, as in Duke Rethinking Load Growth (2025).',
  days: cases.length,
  first: cases[0].date,
  last: cases.at(-1)!.date,
  ratingMW: RATING,
  stepMW: STEP,
  gridKgPerMWhMean: kgMean,
};
fs.writeFileSync(`${PART_DIR}/part-${part}.json`, JSON.stringify({ meta, curves }));
console.error(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
