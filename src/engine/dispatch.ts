import type { Asset, Schedule } from './types.js';

export interface Limit { load: number[]; cap: number; penalty: number }

export function dispatch(v: number[], a: Asset, limit?: Limit, step = 0.25): Schedule {
  const eta = Math.sqrt(a.roundTripEff);
  const lo = Math.round((a.energyMWh * a.socMinFrac) / step);
  const hi = Math.round((a.energyMWh * a.socMaxFrac) / step);
  const i0 = Math.round((a.energyMWh * a.startSocFrac) / step) - lo;
  const n = hi - lo + 1;
  const T = v.length;
  const V: Float64Array[] = Array.from({ length: T + 1 }, () => new Float64Array(n).fill(-Infinity));
  const choice: Int32Array[] = Array.from({ length: T }, () => new Int32Array(n).fill(-1));
  V[T][i0] = 0;

  const over = (t: number, c: number, d: number): number =>
    limit ? limit.penalty * Math.max(0, limit.load[t] + c - d - limit.cap) : 0;

  const reward = (t: number, delta: number): number => {
    if (delta >= 0) {
      const c = delta / eta;
      if (c > a.powerMW + 1e-9) return -Infinity;
      return -(v[t] + a.cycleCostPerMWh) * c - over(t, c, 0);
    }
    const d = -delta * eta;
    if (d > a.powerMW + 1e-9) return -Infinity;
    return (v[t] - a.cycleCostPerMWh) * d - over(t, 0, d);
  };

  for (let t = T - 1; t >= 0; t--) {
    for (let i = 0; i < n; i++) {
      let best = -Infinity, bj = -1;
      for (let j = 0; j < n; j++) {
        const nxt = V[t + 1][j];
        if (nxt === -Infinity) continue;
        const r = reward(t, (j - i) * step);
        if (r === -Infinity) continue;
        const val = r + nxt;
        if (val > best) { best = val; bj = j; }
      }
      V[t][i] = best;
      choice[t][i] = bj;
    }
  }

  const charge: number[] = [], discharge: number[] = [], soc: number[] = [];
  let i = i0;
  for (let t = 0; t < T; t++) {
    const j = choice[t][i];
    const delta = (j - i) * step;
    charge.push(delta > 0 ? delta / eta : 0);
    discharge.push(delta < 0 ? -delta * eta : 0);
    soc.push((j + lo) * step);
    i = j;
  }
  return { charge, discharge, soc };
}

export function naiveSchedule(a: Asset, hourLocal: number[]): Schedule {
  const eta = Math.sqrt(a.roundTripEff);
  const chargeHours = new Set([10, 11, 12, 13, 14, 15]);
  const dischargeHours = new Set([18, 19, 20, 21]);
  const nd = dischargeHours.size, nc = chargeHours.size;
  const start = a.energyMWh * a.startSocFrac;
  const stored = Math.min(a.energyMWh * a.socMaxFrac - start, (a.powerMW * nd) / eta, (a.powerMW * nc * eta));
  const c = stored / (eta * nc);
  const d = (stored * eta) / nd;
  let soc = start;
  const charge: number[] = [], discharge: number[] = [], socs: number[] = [];
  for (const hr of hourLocal) {
    const ch = chargeHours.has(hr) ? c : 0;
    const di = dischargeHours.has(hr) ? d : 0;
    soc += eta * ch - di / eta;
    charge.push(ch); discharge.push(di); socs.push(soc);
  }
  return { charge, discharge, soc: socs };
}

export function zeroSchedule(a: Asset, n: number): Schedule {
  const s = a.energyMWh * a.startSocFrac;
  return { charge: Array(n).fill(0), discharge: Array(n).fill(0), soc: Array(n).fill(s) };
}
