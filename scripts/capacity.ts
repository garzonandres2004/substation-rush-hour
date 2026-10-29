// Capacity unlocked: how many MW of new, always on load (like a data center) this substation can
// take over the backtest days, scored on actual demand, with and without storage.
// Run before npm run engine (the engine copies capacity.json into report.json).
// Two limits: "moving" (P95 of the trailing 30 days, recomputed daily, as elsewhere on the page)
// and "fixed" (one rating for all days: P95 of the 30 days before the first backtest day).
// Linear scan in 0.25 MW steps; the reported value is the last step before the first failure.
// Four ways to run the Station: our everyday planner ("aware"); capacity mode, which on days the day ahead
// forecast plus the largest recent miss puts at risk stays full until the risk has passed and discharges
// only what the meter shows over the limit (other days run the everyday planner); the five line rule as
// written (recharge at night to half); and the same rule recharging to full, so the comparison is fair to
// a rule built for new load.
import fs from 'node:fs';
import { marginFromMisses, peakShaver, runReplan } from '../src/engine/execute.js';
import type { Asset } from '../src/engine/types.js';
import { p, all, backtestDates, days, actualLoad, aware, misses } from './common.js';

const TOL = 0.1; // MWh over the limit per day still counted as zero (planning grid rounding)
const STEP = 0.25;
const cases = backtestDates
  .map(d => ({ d, day: days.get(d)!, act: actualLoad(days.get(d)!) }))
  .filter(c => c.day && c.act.every(x => x !== undefined))
  .map(c => {
    const prev = misses.get(
      [...misses.keys()]
        .filter(x => x < c.d)
        .sort()
        .at(-1) ?? '',
    );
    return { ...c, act: c.act as number[], prevMiss: prev ? prev[prev.length - 1] : 0 };
  });

// Fixed rating: P95 of actual substation load in the 30 days before the first backtest day.
const first = cases[0].day;
const k = first.loadMW[0] / first.demandHat[0];
const t0 = Date.parse(first.t[0]);
const hist = all
  .filter(h => h.demand !== undefined && Date.parse(h.t) < t0 && Date.parse(h.t) >= t0 - 30 * 864e5)
  .map(h => h.demand! * k)
  .sort((a, b) => a - b);
const FIXED = hist[Math.floor(0.95 * hist.length)];

const over = (load: number[], cap: number, ch?: number[], di?: number[]) =>
  load.reduce((s, l, i) => s + Math.max(0, l + (ch ? ch[i] - di![i] : 0) - cap), 0);
type Mode = 'none' | 'aware' | 'capacity' | 'shaver' | 'shaverFull';
// Capacity mode switches on only on days the forecast plus the largest miss of the last 14 days puts at
// risk; then the plan fills the battery and keeps it full until the last hour at risk, and energy leaves
// only to shave what the meter shows over the limit (exact shaving). Other days run the everyday planner.
function capacityArgs(
  mode: Mode,
  c: (typeof cases)[number],
  x: number,
  cap: number,
  a: Asset,
): [number[] | undefined, boolean] {
  if (mode !== 'capacity') return [undefined, false];
  const recent = [...misses.keys()]
    .filter(k => k < c.d)
    .sort()
    .slice(-14)
    .flatMap(k => misses.get(k)!);
  const m = marginFromMisses(recent, 1); // the largest miss of the last 14 days
  const need = c.day.loadMW.map(l => Math.max(0, l + x + m - cap));
  const last = need.reduce((acc, v, i) => (v > 0 ? i : acc), -1);
  if (last < 0) return [undefined, false];
  return [need.map((_, t) => (t < last ? a.energyMWh * a.socMaxFrac : a.energyMWh * a.socMinFrac)), true];
}
function worstDay(x: number, mode: Mode, a: Asset, fixed: boolean): number {
  let worst = 0;
  for (const c of cases) {
    const cap = fixed ? FIXED : c.day.capMW;
    const act = c.act.map(l => l + x);
    let o: number;
    if (mode === 'none') o = over(act, cap);
    else if (mode === 'shaver' || mode === 'shaverFull') {
      const s = peakShaver(
        a,
        act,
        c.day.hourLocal,
        cap,
        undefined,
        mode === 'shaverFull' ? a.energyMWh * a.socMaxFrac : undefined,
      );
      o = over(act, cap, s.charge, s.discharge);
    } else {
      const s = runReplan(
        a,
        {
          forecastLoad: c.day.loadMW.map(l => l + x),
          cap,
          margin: 0,
          ...aware(c.day),
          penalty: p.overloadPenalty,
        },
        act,
        true,
        c.prevMiss,
        undefined,
        undefined,
        ...capacityArgs(mode, c, x, cap, a),
      );
      o = over(act, cap, s.charge, s.discharge);
    }
    worst = Math.max(worst, o);
    if (o > TOL) return o;
  }
  return worst;
}
// Days over the limit (beyond the tolerance) at one size: shows when a single day sets the result.
function failDays(x: number, mode: Mode, a: Asset, fixed: boolean): string[] {
  const out: string[] = [];
  for (const c of cases) {
    const save = cases.slice();
    cases.length = 0;
    cases.push(c);
    if (worstDay(x, mode, a, fixed) > TOL) out.push(c.d);
    cases.length = 0;
    cases.push(...save);
  }
  return out;
}
function scan(mode: Mode, a: Asset, fixed: boolean) {
  let x = 0,
    last = -1,
    resid = 0;
  for (; x <= 30; x += STEP) {
    const w = worstDay(x, mode, a, fixed);
    if (w > TOL) break;
    last = x;
    resid = w;
  }
  return { mw: Math.max(0, last), worstDayResidualMWh: +resid.toFixed(3) };
}
const sizes: [string, number, number][] = [
  ['5 MW, 4 h', 5, 20],
  ['10 MW, 2 h', 10, 20],
  ['10 MW, 4 h', 10, 40],
  ['10 MW, 8 h', 10, 80],
  ['20 MW, 4 h', 20, 80],
];
const out: any = { days: cases.length, toleranceMWh: TOL, stepMW: STEP, fixedLimitMW: FIXED, limits: {} };
for (const fixed of [false, true]) {
  const key = fixed ? 'fixed' : 'moving';
  const none = scan('none', p.asset, fixed);
  const st: any[] = [];
  for (const [label, mw, mwh] of sizes) {
    const a = { ...p.asset, powerMW: mw, energyMWh: mwh };
    const t = Date.now();
    const aware = scan('aware', a, fixed),
      capacity = scan('capacity', a, fixed),
      shaver = scan('shaver', a, fixed),
      shaverFull = scan('shaverFull', a, fixed);
    st.push({
      label,
      powerMW: mw,
      energyMWh: mwh,
      awareMW: aware.mw,
      awareResidualMWh: aware.worstDayResidualMWh,
      capacityModeMW: capacity.mw,
      capacityModeResidualMWh: capacity.worstDayResidualMWh,
      shaverMW: shaver.mw,
      shaverFullMW: shaverFull.mw,
      // our planner at the simple rule's size: which days, if any, go over
      awareDaysOverAtShaverMW: shaver.mw > aware.mw ? failDays(shaver.mw, 'aware', a, fixed) : [],
    });
    console.error(
      key,
      label,
      aware.mw,
      capacity.mw,
      shaver.mw,
      shaverFull.mw,
      `${((Date.now() - t) / 1000).toFixed(0)} s`,
    );
  }
  out.limits[key] = { withoutStorageMW: none.mw, stations: st };
}
fs.writeFileSync('public/data/capacity.json', `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify(out));
