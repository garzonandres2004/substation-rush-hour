import type { Hour } from './types.js';
import { localDate, localHour, isWeekend } from './time.js';

export interface SolarModel {
  a: number;
  b: number;
  predict: (rad: number, cloud: number) => number;
}

export function fitSolar(hist: Hour[]): SolarModel {
  let s11 = 0,
    s12 = 0,
    s22 = 0,
    y1 = 0,
    y2 = 0;
  for (const h of hist) {
    if (h.solar === undefined || h.rad === undefined || h.cloud === undefined) continue;
    const x1 = h.rad,
      x2 = (h.rad * h.cloud) / 100;
    s11 += x1 * x1;
    s12 += x1 * x2;
    s22 += x2 * x2;
    y1 += x1 * h.solar;
    y2 += x2 * h.solar;
  }
  const det = s11 * s22 - s12 * s12;
  const a = det === 0 ? 0 : (y1 * s22 - y2 * s12) / det;
  const b = det === 0 ? 0 : (s11 * y2 - s12 * y1) / det;
  return { a, b, predict: (rad, cloud) => Math.max(0, a * rad + b * ((rad * cloud) / 100)) };
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((p, c) => p + c, 0) / xs.length : 0;
}

export function windHat(hist: Hour[], hourLoc: number, days = 7): number {
  const byDate = new Map<string, number>();
  for (const h of hist) {
    if (h.wind === undefined || localHour(h.t) !== hourLoc) continue;
    byDate.set(localDate(h.t), h.wind);
  }
  const dates = [...byDate.keys()].sort().slice(-days);
  return avg(dates.map(d => byDate.get(d)!));
}

export interface DemandModel {
  beta: number;
  predict: (date: string, hourLoc: number, temp: number) => number;
}

export function fitDemand(hist: Hour[], lookbackDays = 21): DemandModel {
  const rows = hist.filter(h => h.demand !== undefined && h.temp !== undefined);
  const dates = [...new Set(rows.map(h => localDate(h.t)))].sort().slice(-lookbackDays);
  const keep = new Set(dates);
  const recent = rows.filter(h => keep.has(localDate(h.t)));
  const cell = (weekend: boolean, hr: number) =>
    recent.filter(h => isWeekend(localDate(h.t)) === weekend && localHour(h.t) === hr);
  const base = new Map<string, { d: number; t: number }>();
  for (const wk of [false, true])
    for (let hr = 0; hr < 24; hr++) {
      const c = cell(wk, hr);
      base.set(`${wk}-${hr}`, { d: avg(c.map(h => h.demand!)), t: avg(c.map(h => h.temp!)) });
    }
  let sxy = 0,
    sxx = 0;
  for (const h of recent) {
    const b = base.get(`${isWeekend(localDate(h.t))}-${localHour(h.t)}`)!;
    const dx = h.temp! - b.t;
    sxy += dx * (h.demand! - b.d);
    sxx += dx * dx;
  }
  const beta = sxx === 0 ? 0 : sxy / sxx;
  return {
    beta,
    predict: (date, hourLoc, temp) => {
      const b = base.get(`${isWeekend(date)}-${hourLoc}`)!;
      return b.d + beta * (temp - b.t);
    },
  };
}
