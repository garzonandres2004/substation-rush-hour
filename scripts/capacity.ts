// Capacity unlocked: how many MW of new, always on load (like a data center) this substation can
// take with zero overloads (run before npm run engine; the engine copies capacity.json into report.json)
// take with zero overloads over the backtest days, scored on actual demand, with and without storage.
import fs from 'node:fs';
import { runWithReplan } from '../src/engine/execute.js';
import type { Asset } from '../src/engine/types.js';
import { p, backtestDates, days, actualLoad, marginFor, awareSignal } from './common.js';

const TOL = 0.1; // MWh per day
const cases = backtestDates.map(d => ({ d, day: days.get(d)!, act: actualLoad(days.get(d)!) }))
  .filter(c => c.day && c.act.every(x => x !== undefined)).map(c => ({ ...c, act: c.act as number[], margin: marginFor(c.d) }));

const over = (load: number[], cap: number, ch?: number[], di?: number[]) =>
  load.reduce((s, l, i) => s + Math.max(0, l + (ch ? ch[i] - di![i] : 0) - cap), 0);

function okWithout(x: number) { return cases.every(c => over(c.act.map(l => l + x), c.day.capMW) <= TOL); }
function okWith(x: number, a: Asset, useMargin: boolean) {
  for (const c of cases) {
    const s = runWithReplan(a, { forecastLoad: c.day.loadMW.map(l => l + x), cap: c.day.capMW, margin: useMargin ? c.margin : 0, signal: awareSignal(c.day), penalty: p.overloadPenalty }, c.act.map(l => l + x));
    if (over(c.act.map(l => l + x), c.day.capMW, s.charge, s.discharge) > TOL) return false;
  }
  return true;
}
function search(ok: (x: number) => boolean, hi = 30, step = 0.25) {
  let lo = 0, h = hi;
  if (!ok(0)) return 0;
  while (h - lo > step) { const m = (lo + h) / 2; if (ok(m)) lo = m; else h = m; }
  return Math.floor(lo / step) * step;
}
const base = search(okWithout);
const sizes: [string, number, number][] = [['5 MW, 4 h', 5, 20], ['10 MW, 2 h', 10, 20], ['10 MW, 4 h', 10, 40], ['10 MW, 8 h', 10, 80], ['20 MW, 4 h', 20, 80]];
const which = process.argv[2] ?? 'all';
const out: any = { days: cases.length, toleranceMWh: TOL, withoutStorageMW: base, stations: [] as any[] };
for (const [label, mw, mwh] of sizes) {
  if (which !== 'all' && label !== which) continue;
  const a = { ...p.asset, powerMW: mw, energyMWh: mwh };
  const t0 = Date.now();
  const replan = search(x => okWith(x, a, false));
  const replanMargin = search(x => okWith(x, a, true));
  out.stations.push({ label, powerMW: mw, energyMWh: mwh, replanMW: replan, replanMarginMW: replanMargin });
  console.error(label, replan, replanMargin, `${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
fs.writeFileSync('public/data/capacity.json', JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify(out));
