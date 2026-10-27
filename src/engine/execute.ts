import type { Asset, Schedule } from './types.js';
import { dispatch } from './dispatch.js';

const STEP = 0.25;

// The planning margin: how far real load ran above our forecast in the recent past.
// q-th quantile of hourly misses (actual minus forecast, MW), never below zero.
export function marginFromMisses(misses: number[], q = 0.9): number {
  if (!misses.length) return 0;
  const s = [...misses].sort((a, b) => a - b);
  return Math.max(0, s[Math.min(s.length - 1, Math.floor(q * s.length))]);
}

export interface Run {
  signal: number[];
  forecastLoad: number[];
  cap: number;
  penalty: number;
  margin: number;
}

// Day ahead plan: solved once, the night before, on forecast load plus the margin.
export function planAhead(a: Asset, r: Run): Schedule {
  return dispatch(r.signal, a, { load: r.forecastLoad.map(x => x + r.margin), cap: r.cap, penalty: r.penalty });
}

// Real time guard. Applied to what the meter shows during the hour: if the planned action would
// push load over the limit, charge less or discharge more, within the power limit and the energy
// actually stored. Never looks ahead. Stored energy is kept on the planning grid (rounded the
// safe way), so the next replan starts from a state the planner can represent.
export function guard(a: Asset, soc: number, charge: number, discharge: number, load: number, cap: number) {
  const eta = Math.sqrt(a.roundTripEff);
  const min = a.energyMWh * a.socMinFrac;
  const net = charge - discharge;
  if (load + net <= cap + 1e-9) return { charge, discharge, soc: soc + charge * eta - discharge / eta, acted: false };
  let want = cap - load; // grid side net we need (negative = discharge)
  want = Math.max(want, -a.powerMW, -(soc - min) * eta);
  let next = soc + (want >= 0 ? want * eta : want / eta);
  next = Math.floor((next + 1e-9) / STEP) * STEP; // round down: a little more discharge, never less
  if (next < min) next = min;
  if ((soc - next) * eta > a.powerMW + 1e-9) next = Math.ceil((soc - a.powerMW / eta) / STEP) * STEP;
  const d = next < soc ? (soc - next) * eta : 0;
  const c = next > soc ? (next - soc) / eta : 0;
  return { charge: c, discharge: d, soc: next, acted: true };
}

// Hourly replanning (model predictive control), causal. Before hour t the battery knows only
// the forecast and how wrong it was in hour t-1, and shifts the rest of the day by that miss.
// With useGuard, the real time guard then reacts to the meter during hour t.
export function runReplan(
  a: Asset,
  r: Run,
  actualLoad: number[],
  useGuard: boolean,
  prevMiss = 0,
): Schedule & { guardHours: number } {
  const T = r.signal.length;
  let soc = a.energyMWh * a.startSocFrac;
  const charge: number[] = [],
    discharge: number[] = [],
    socs: number[] = [];
  let guardHours = 0;
  for (let t = 0; t < T; t++) {
    const miss = t > 0 ? actualLoad[t - 1] - r.forecastLoad[t - 1] : prevMiss;
    const est = r.forecastLoad.slice(t).map(x => x + miss + r.margin);
    const s = dispatch(r.signal.slice(t), a, { load: est, cap: r.cap, penalty: r.penalty }, STEP, soc);
    let c = s.charge[0],
      d = s.discharge[0],
      next = s.soc[0];
    if (useGuard) {
      const g = guard(a, soc, c, d, actualLoad[t], r.cap);
      if (g.acted) {
        c = g.charge;
        d = g.discharge;
        next = g.soc;
        guardHours++;
      }
    }
    charge.push(c);
    discharge.push(d);
    socs.push(next);
    soc = next;
  }
  return { charge, discharge, soc: socs, guardHours };
}

// Simple reactive rule for comparison: discharge whatever is over the limit, recharge at night
// (10 PM to 6 AM) back toward the starting charge when there is headroom. No forecast, no price.
export function peakShaver(a: Asset, actualLoad: number[], hourLocal: number[], cap: number): Schedule {
  const eta = Math.sqrt(a.roundTripEff);
  const start = a.energyMWh * a.startSocFrac,
    min = a.energyMWh * a.socMinFrac;
  let soc = start;
  const charge: number[] = [],
    discharge: number[] = [],
    socs: number[] = [];
  for (let t = 0; t < actualLoad.length; t++) {
    let c = 0,
      d = 0;
    const over = actualLoad[t] - cap;
    if (over > 0) d = Math.min(over, a.powerMW, (soc - min) * eta);
    else if ((hourLocal[t] >= 22 || hourLocal[t] < 6) && soc < start)
      c = Math.min(-over, a.powerMW, (start - soc) / eta);
    soc += c * eta - d / eta;
    charge.push(c);
    discharge.push(d);
    socs.push(soc);
  }
  return { charge, discharge, soc: socs };
}
