// Shared data loading and helpers for the engine runner and the capacity analysis.
import { loadHours, dataQuality } from '../src/engine/merge.js';
import { PARAMS } from '../src/engine/params.js';
import { buildDay } from '../src/engine/stress.js';
import { localDate } from '../src/engine/time.js';
import { intensityHat } from '../src/engine/carbon.js';
import { marginFromMisses } from '../src/engine/execute.js';
import type { DayInputs } from '../src/engine/types.js';

export const p = PARAMS;
export const all = loadHours();
export const quality = dataQuality(all);
export const byT = new Map(all.map(h => [h.t, h]));

export const dates = [...new Set(all.filter(h => h.lmp !== undefined).map(h => localDate(h.t)))].sort();
export const fullDates = dates.filter(d => all.filter(h => localDate(h.t) === d && h.lmp !== undefined).length === 24);
export const tomorrow = fullDates.at(-1)!;
export const firstBacktest = fullDates[8];
export const backtestDates = fullDates.filter(d => d >= firstBacktest && d < tomorrow);

export const days = new Map<string, DayInputs>();
for (const d of fullDates) { const day = buildDay(all, d, p); if (day) days.set(d, day); }

// Substation load uses the same scale for forecast and actual.
export const actualLoad = (day: DayInputs) => {
  const k = day.loadMW[0] / day.demandHat[0];
  return day.actual!.demand.map(x => (x === undefined ? undefined : x * k));
};
// Forecast misses (actual minus forecast, MW) per day, for the planning margin.
export const misses = new Map<string, number[]>();
for (const [d, day] of days) {
  const act = actualLoad(day);
  if (act.every(x => x !== undefined)) misses.set(d, act.map((x, i) => x! - day.loadMW[i]));
}
export const MARGIN_DAYS = 14;
export const marginFor = (d: string) => marginFromMisses([...misses.keys()].filter(x => x < d).sort().slice(-MARGIN_DAYS).flatMap(x => misses.get(x)!));

export const co2HatFor = (day: DayInputs) => {
  const hist = all.filter(h => h.t < day.t[0]);
  return day.hourLocal.map(hr => intensityHat(hist, hr));
};
export const awareSignal = (day: DayInputs) => day.lmp.map((x, i) => x + p.stressPremium * day.stress[i]);

