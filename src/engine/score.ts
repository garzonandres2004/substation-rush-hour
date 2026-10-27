import type { DayInputs, Params, Schedule, Scorecard } from './types.js';

function wavg(x: number[], w: number[]): number {
  const sw = w.reduce((a, b) => a + b, 0);
  return sw > 1e-9 ? x.reduce((a, v, i) => a + v * w[i], 0) / sw : 0;
}

export function score(day: DayInputs, s: Schedule, p: Params): Scorecard {
  const a = p.asset;
  const eta = Math.sqrt(a.roundTripEff);
  const T = day.lmp.length;
  let market = 0,
    thr = 0;
  for (let t = 0; t < T; t++) {
    market += day.lmp[t] * (s.discharge[t] - s.charge[t]);
    thr += s.charge[t] + s.discharge[t];
  }
  const cycle = thr * a.cycleCostPerMWh;
  const load = day.loadMW;
  const after = load.map((l, t) => l + s.charge[t] - s.discharge[t]);
  const cong = day.stress.map(x => x >= p.congestedThreshold);
  let relieved = 0;
  cong.forEach((c, t) => {
    if (c) relieved += s.discharge[t] - s.charge[t];
  });
  const ovB = load.map(l => Math.max(0, l - day.capMW));
  const ovA = after.map(l => Math.max(0, l - day.capMW));
  const peakBefore = Math.max(...load),
    peakAfter = Math.max(...after);
  const usable = a.energyMWh * (a.socMaxFrac - a.socMinFrac);
  const startSoc = a.energyMWh * a.startSocFrac;
  const checks = {
    socWithinBounds: s.soc.every(x => x >= a.energyMWh * a.socMinFrac - 1e-6 && x <= a.energyMWh * a.socMaxFrac + 1e-6),
    powerWithinLimit: s.charge.every(x => x <= a.powerMW + 1e-6) && s.discharge.every(x => x <= a.powerMW + 1e-6),
    noSimultaneous: s.charge.every((c, t) => !(c > 1e-9 && s.discharge[t] > 1e-9)),
    energyBalances:
      Math.abs(
        startSoc +
          s.charge.reduce((p2, c) => p2 + eta * c, 0) -
          s.discharge.reduce((p2, d) => p2 + d / eta, 0) -
          s.soc[T - 1],
      ) < 1e-6,
    endsAtStartSoc: Math.abs(s.soc[T - 1] - startSoc) < 0.2 || s.soc[T - 1] >= startSoc - 1e-6,
  };
  return {
    marketValue: market,
    cycleCost: cycle,
    netValue: market - cycle,
    congestedHours: cong.filter(Boolean).length,
    congestedEnergyRelievedMWh: relieved,
    peakBeforeMW: peakBefore,
    peakAfterMW: peakAfter,
    peakReductionMW: peakBefore - peakAfter,
    overloadBeforeMWh: ovB.reduce((x, y) => x + y, 0),
    overloadAfterMWh: ovA.reduce((x, y) => x + y, 0),
    overloadHoursBefore: ovB.filter(x => x > 1e-6).length,
    overloadHoursAfter: ovA.filter(x => x > 1e-6).length,
    avgStressWhenCharging: wavg(day.stress, s.charge),
    avgStressWhenDischarging: wavg(day.stress, s.discharge),
    throughputMWh: thr,
    equivalentCycles: s.discharge.reduce((p2, d) => p2 + d, 0) / usable,
    checks,
  };
}

export function loadAfter(day: DayInputs, s: Schedule): number[] {
  return day.loadMW.map((l, t) => l + s.charge[t] - s.discharge[t]);
}
