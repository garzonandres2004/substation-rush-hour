import type { Hour, DayInputs, Params } from './types.js';
import { localDate, localHour } from './time.js';
import { fitSolar, windHat, fitDemand } from './forecast.js';

function pct(x: number, hist: number[]): number {
  if (!hist.length) return 0.5;
  let c = 0;
  for (const v of hist) if (v <= x) c++;
  return c / hist.length;
}

function ramp(netLoad: number[], i: number): number {
  const a = netLoad[Math.max(0, i - 1)];
  const b = netLoad[Math.min(netLoad.length - 1, i + 1)];
  return Math.max(0, b - a);
}

export function hoursOfLocalDate(all: Hour[], date: string): Hour[] {
  return all.filter(h => localDate(h.t) === date);
}

export function buildDay(all: Hour[], date: string, p: Params, tempShiftC = 0): DayInputs | null {
  const day = hoursOfLocalDate(all, date);
  if (day.length !== 24) return null;
  const dayStart = day[0].t;
  const hist = all.filter(h => h.t < dayStart);
  const histRecent = hist.filter(h => Date.parse(h.t) >= Date.parse(dayStart) - p.historyDays * 864e5);

  const solar = fitSolar(hist);
  const dm = fitDemand(hist);

  const lmp: number[] = [],
    mcc: number[] = [],
    mce: number[] = [];
  for (const h of day) {
    if (h.lmp === undefined || h.temp === undefined || h.rad === undefined) return null;
    lmp.push(h.lmp);
    mcc.push(h.mcc ?? 0);
    mce.push(h.mce ?? 0);
  }
  const hourLocal = day.map(h => localHour(h.t));
  const demandHat = day.map((h, i) => dm.predict(date, hourLocal[i], h.temp! + tempShiftC));
  const solarHat = day.map(h => solar.predict(h.rad!, h.cloud ?? 0));
  const wHat = hourLocal.map(hr => windHat(hist, hr));
  const netLoadHat = demandHat.map((d, i) => d - solarHat[i] - wHat[i]);

  const histD = histRecent.filter(h => h.demand !== undefined);
  const histNet: number[] = [];
  const histNetSeries = histRecent
    .filter(h => h.demand !== undefined && h.solar !== undefined && h.wind !== undefined)
    .map(h => h.demand! - h.solar! - h.wind!);
  histNet.push(...histNetSeries);
  const histRamp = histNetSeries.map((_, i) => ramp(histNetSeries, i));
  const histLmp = histRecent.filter(h => h.lmp !== undefined).map(h => h.lmp!);

  const comps = {
    demand: demandHat.map(x =>
      pct(
        x,
        histD.map(h => h.demand!),
      ),
    ),
    netLoad: netLoadHat.map(x => pct(x, histNet)),
    ramp: netLoadHat.map((_, i) => pct(ramp(netLoadHat, i), histRamp)),
    price: lmp.map(x => pct(x, histLmp)),
  };
  const maxHistDemand = Math.max(...hist.filter(h => h.demand !== undefined).map(h => h.demand!));
  const scale = p.substationPeakMW / maxHistDemand;
  const loadMW = demandHat.map(d => d * scale);
  const histLoads = histD.map(h => h.demand! * scale).sort((a, b) => a - b);
  const capMW = histLoads[Math.min(histLoads.length - 1, Math.floor(p.capacityPercentile * histLoads.length))];
  const w = p.stressWeights;
  const stress = lmp.map(
    (_, i) =>
      w.demand * comps.demand[i] + w.netLoad * comps.netLoad[i] + w.ramp * comps.ramp[i] + w.price * comps.price[i],
  );

  return {
    date,
    hourLocal,
    t: day.map(h => h.t),
    lmp,
    mcc,
    mce,
    demandHat,
    solarHat,
    windHat: wHat,
    netLoadHat,
    loadMW,
    capMW,
    stress,
    comps,
    actual: { demand: day.map(h => h.demand), eiaFcst: day.map(h => h.demandEiaFcst) },
  };
}
