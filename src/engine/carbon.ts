import type { Hour } from './types.js';
import { localDate, localHour } from './time.js';

// EIA 2023 US utility scale rates: coal 2.31 lb/kWh, natural gas 0.96 lb/kWh
// (https://www.eia.gov/tools/faqs/faq.php?id=74). 1 lb/kWh = 453.592 kg/MWh.
// Hydro, wind, solar and "other" are counted as zero. Imports are ignored.
export const KG_PER_MWH = { coal: 2.31 * 453.592, gas: 0.96 * 453.592 };

export function intensity(h: Hour): number | undefined {
  if (h.coal === undefined || h.gas === undefined || !h.genTotal) return undefined;
  return (h.coal * KG_PER_MWH.coal + h.gas * KG_PER_MWH.gas) / h.genTotal;
}

// Estimated intensity for one local hour: mean of the same hour over the last `days` days with data.
export function intensityHat(hist: Hour[], hourLoc: number, days = 7): number {
  const byDate = new Map<string, number>();
  for (const h of hist) {
    const x = intensity(h);
    if (x === undefined || localHour(h.t) !== hourLoc) continue;
    byDate.set(localDate(h.t), x);
  }
  const xs = [...byDate.keys()].sort().slice(-days).map(d => byDate.get(d)!);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

// Tonnes of CO2 the schedule adds to the grid (negative means it avoids emissions).
// Charging draws grid energy at that hour's intensity, discharging displaces it.
export function co2DeltaT(kgPerMWh: number[], charge: number[], discharge: number[]): number {
  return kgPerMWh.reduce((s, k, t) => s + k * (charge[t] - discharge[t]), 0) / 1000;
}
