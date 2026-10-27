import type { Asset, Schedule } from './types.js';
import { dispatch } from './dispatch.js';

// The planning margin: how far real load ran above our forecast in the recent past.
// q-th quantile of hourly misses (actual minus forecast, MW), never below zero.
export function marginFromMisses(misses: number[], q = 0.9): number {
  if (!misses.length) return 0;
  const s = [...misses].sort((a, b) => a - b);
  return Math.max(0, s[Math.min(s.length - 1, Math.floor(q * s.length))]);
}

export interface Run { signal: number[]; forecastLoad: number[]; cap: number; penalty: number; margin: number }

// Day ahead plan: solved once, the night before, on forecast load plus the margin.
export function planAhead(a: Asset, r: Run): Schedule {
  return dispatch(r.signal, a, { load: r.forecastLoad.map(x => x + r.margin), cap: r.cap, penalty: r.penalty });
}

// Hourly replanning (model predictive control). At each hour the battery sees that hour's
// measured load, never later hours. Future hours still use forecast plus margin. It takes the
// first action of the new plan, then moves on. End of day target is unchanged.
export function runWithReplan(a: Asset, r: Run, actualLoad: number[]): Schedule {
  const T = r.signal.length;
  let soc = a.energyMWh * a.startSocFrac;
  const charge: number[] = [], discharge: number[] = [], socs: number[] = [];
  for (let t = 0; t < T; t++) {
    const load = [actualLoad[t], ...r.forecastLoad.slice(t + 1).map(x => x + r.margin)];
    const s = dispatch(r.signal.slice(t), a, { load, cap: r.cap, penalty: r.penalty }, 0.25, soc);
    charge.push(s.charge[0]); discharge.push(s.discharge[0]); socs.push(s.soc[0]);
    soc = s.soc[0];
  }
  return { charge, discharge, soc: socs };
}
