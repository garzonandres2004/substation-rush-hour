// Summer capacity test: July and August 2026, the season interconnection studies care about.
// Needs data/raw/summer_demand.json and summer_demand_forecast.json (node scripts/pull-summer.mjs).
// Planning uses EIA's own day ahead demand forecast (a real forecast, no observed weather), and the
// forecast load itself as the traffic signal (no summer prices pulled). Same replanning and real time
// guard as the main page. Same MW scale as the autumn test. Writes public/data/summer.json.
import fs from 'node:fs';
import { marginFromMisses, peakShaver, runReplan } from '../src/engine/execute.js';
import { eiaHourStart, localDate, localHour } from '../src/engine/time.js';
import type { Asset } from '../src/engine/types.js';
import { p, backtestDates, days } from './common.js';

const read = (f: string) => JSON.parse(fs.readFileSync(`data/raw/${f}`, 'utf8')) as { period: string; value: string }[];
const D = new Map(read('summer_demand.json').map(r => [eiaHourStart(r.period), Number(r.value)]));
const F = new Map(read('summer_demand_forecast.json').map(r => [eiaHourStart(r.period), Number(r.value)]));
const first = days.get(backtestDates[0])!;
const k = first.loadMW[0] / first.demandHat[0]; // same MW scale as the autumn test

const byDate = new Map<string, { t: string; d: number; f: number; h: number }[]>();
for (const [t, d] of D) {
  const f = F.get(t);
  if (f === undefined || !(d > 0) || !(f > 0)) continue;
  const date = localDate(t);
  if (date < '2026-07-01' || date > '2026-08-31') continue;
  if (!byDate.has(date)) byDate.set(date, []);
  byDate.get(date)!.push({ t, d: d * k, f: f * k, h: localHour(t) });
}
const cases = [...byDate.entries()]
  .filter(([, hs]) => hs.length === 24)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([date, hs]) => {
    hs.sort((a, b) => a.t.localeCompare(b.t));
    return { date, act: hs.map(x => x.d), fc: hs.map(x => x.f), hour: hs.map(x => x.h) };
  });
const peak = Math.max(...cases.flatMap(c => c.act));
const autumnCap = JSON.parse(fs.readFileSync('public/data/capacity.json', 'utf8'));
const FIXED_AUTUMN: number = autumnCap.fixedLimitMW;
const TOL = 0.1,
  STEP = 0.25;

type Mode = 'none' | 'aware' | 'capacity' | 'shaver' | 'shaverFull';
// Capacity mode (see capacity.ts): hold enough charge for what the forecast plus the margin from the
// last 14 days of misses says will be over the limit later in the day.
function reserveFor(i: number, x: number, cap: number, a: Asset): number[] {
  const c = cases[i];
  const m = marginFromMisses(cases.slice(Math.max(0, i - 14), i).flatMap(d => d.act.map((v, h) => v - d.fc[h])));
  const eta = Math.sqrt(a.roundTripEff);
  const need = c.fc.map(l => Math.max(0, l + x + m - cap));
  return need.map((_, t) => a.energyMWh * a.socMinFrac + need.slice(t + 1).reduce((s, v) => s + v, 0) / eta);
}
const over = (load: number[], cap: number, ch?: number[], di?: number[]) =>
  load.reduce((s, l, i) => s + Math.max(0, l + (ch ? ch[i] - di![i] : 0) - cap), 0);
function runDay(i: number, x: number, a: Asset, cap: number, mode: Mode, prevMiss: number) {
  const c = cases[i];
  const act = c.act.map(l => l + x);
  if (mode === 'none') return { o: over(act, cap), h: act.filter(l => l > cap + 1e-6).length };
  const s =
    mode === 'shaver' || mode === 'shaverFull'
      ? peakShaver(a, act, c.hour, cap, undefined, mode === 'shaverFull' ? a.energyMWh * a.socMaxFrac : undefined)
      : runReplan(
          a,
          { forecastLoad: c.fc.map(l => l + x), cap, margin: 0, signal: c.fc, penalty: p.overloadPenalty },
          act,
          true,
          prevMiss,
          undefined,
          undefined,
          mode === 'capacity' ? reserveFor(i, x, cap, a) : undefined,
        );
  return {
    o: over(act, cap, s.charge, s.discharge),
    h: act.filter((l, i) => l + s.charge[i] - s.discharge[i] > cap + 1e-6).length,
  };
}
function sweep(x: number, a: Asset, cap: number, mode: Mode, stopEarly = true) {
  let worst = 0,
    total = 0,
    daysOver = 0,
    hours = 0;
  cases.forEach((_, i) => {
    if (stopEarly && worst > TOL) return;
    const prev = i ? cases[i - 1] : undefined;
    const prevMiss = prev ? prev.act[23] - prev.fc[23] : 0;
    const r = runDay(i, x, a, cap, mode, prevMiss);
    worst = Math.max(worst, r.o);
    total += r.o;
    hours += r.h;
    if (r.o > TOL) daysOver++;
  });
  return { worst, total, daysOver, hours };
}
function scan(a: Asset, cap: number, mode: Mode) {
  let last = -1;
  for (let x = 0; x <= 30; x += STEP) {
    if (sweep(x, a, cap, mode).worst > TOL) break;
    last = x;
  }
  return Math.max(0, last);
}
const sizes: [string, number, number][] = [
  ['10 MW, 2 h', 10, 20],
  ['10 MW, 4 h', 10, 40],
  ['10 MW, 8 h', 10, 80],
];
const out: any = {
  days: cases.length,
  firstDay: cases[0]?.date,
  lastDay: cases.at(-1)?.date,
  summerPeakMW: peak,
  forecastMapePct:
    (100 * cases.reduce((s, c) => s + c.act.reduce((s2, x, i) => s2 + Math.abs(c.fc[i] - x) / x, 0), 0)) /
    (cases.length * 24),
  ratedForSummerPeak: { capMW: peak, stations: [] as any[] },
  autumnRating: {
    capMW: FIXED_AUTUMN,
    none: sweep(0, p.asset, FIXED_AUTUMN, 'none', false),
    withMain: sweep(0, p.asset, FIXED_AUTUMN, 'aware', false),
  },
};
for (const [label, mw, mwh] of sizes) {
  const a = { ...p.asset, powerMW: mw, energyMWh: mwh };
  const t = Date.now();
  const row = {
    label,
    powerMW: mw,
    energyMWh: mwh,
    awareMW: scan(a, peak, 'aware'),
    capacityModeMW: scan(a, peak, 'capacity'),
    shaverMW: scan(a, peak, 'shaver'),
    shaverFullMW: scan(a, peak, 'shaverFull'),
  };
  out.ratedForSummerPeak.stations.push(row);
  console.error(
    label,
    row.awareMW,
    row.capacityModeMW,
    row.shaverMW,
    row.shaverFullMW,
    `${((Date.now() - t) / 1000).toFixed(0)} s`,
  );
}
fs.writeFileSync('public/data/summer.json', `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify(out, null, 1));
