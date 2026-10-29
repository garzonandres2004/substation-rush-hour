import { KG_PER_MWH } from './carbon.js';
import { localDate, localHour } from './time.js';
import type { Hour } from './types.js';

// Marginal CO2: how much the grid's emissions change when load changes by 1 MWh at a given hour of the
// day, which is what a battery actually moves. Average intensity (carbon.ts) says how clean the mix is;
// the marginal rate says which plants ramp to follow a change. Method as in DETOUR (Juan Lizarazo, MIT,
// src/detour/core/signals/emissions.helper.ts): an ordinary least squares slope of the hour to hour change
// in fossil emissions against the hour to hour change in fossil generation (his default) or in demand, one
// fit per local hour. Here the fit uses only the trailing days before the planned day, so it is a forecast,
// not hindsight. On PACE data the demand fit is mostly noise (imports and hydro follow demand hour to hour),
// while the fossil fit is steady: when fossil output moves, coal moves most of it.

const emissionsKg = (h: Hour) =>
  h.coal === undefined || h.gas === undefined ? undefined : h.coal * KG_PER_MWH.coal + h.gas * KG_PER_MWH.gas;

export interface MarginalFit {
  kgPerMWh: number[]; // by local hour 0 to 23
  samples: number[];
}

// A slope outside 0 to the coal rate is noise from a thin fit, so it is clipped to that range; an hour
// with fewer than MIN_SAMPLES pairs falls back to the fit over all hours.
const MIN_SAMPLES = 10;
export function marginalFit(hist: Hour[], days = 60, method: 'fossil' | 'demand' = 'fossil'): MarginalFit {
  const dates = [...new Set(hist.map(h => localDate(h.t)))].sort().slice(-days);
  const keep = new Set(dates);
  const hs = hist.filter(h => keep.has(localDate(h.t))).sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const xs: number[][] = Array.from({ length: 24 }, () => []);
  const ys: number[][] = Array.from({ length: 24 }, () => []);
  for (let i = 1; i < hs.length; i++) {
    const a = hs[i - 1],
      b = hs[i];
    if (Date.parse(b.t) - Date.parse(a.t) !== 3_600_000) continue;
    const ea = emissionsKg(a),
      eb = emissionsKg(b);
    if (ea === undefined || eb === undefined || a.demand === undefined || b.demand === undefined) continue;
    const hr = localHour(b.t);
    xs[hr].push(method === 'demand' ? b.demand - a.demand : b.coal! + b.gas! - a.coal! - a.gas!);
    ys[hr].push(eb - ea);
  }
  const slope = (x: number[], y: number[]) => {
    const n = x.length;
    if (n < 2) return Number.NaN;
    const mx = x.reduce((s, v) => s + v, 0) / n,
      my = y.reduce((s, v) => s + v, 0) / n;
    let sxx = 0,
      sxy = 0;
    for (let i = 0; i < n; i++) {
      sxx += (x[i] - mx) ** 2;
      sxy += (x[i] - mx) * (y[i] - my);
    }
    return sxx > 0 ? sxy / sxx : Number.NaN;
  };
  const clip = (v: number) => (Number.isFinite(v) ? Math.min(KG_PER_MWH.coal, Math.max(0, v)) : 0);
  const pooled = slope(xs.flat(), ys.flat());
  const kgPerMWh = xs.map((x, hr) =>
    clip(x.length >= MIN_SAMPLES && Number.isFinite(slope(x, ys[hr])) ? slope(x, ys[hr]) : pooled),
  );
  return { kgPerMWh, samples: xs.map(x => x.length) };
}
