import fs from 'node:fs';
import type { Hour } from './types.js';

const key = (s: string) => `${s.slice(0, 13)}:00:00Z`;

export function loadHours(dir = 'data/raw', lmpNode = 'TH_PACE_GEN-APND'): Hour[] {
  const m = new Map<string, Hour>();
  const get = (t: string) => {
    let h = m.get(t);
    if (!h) {
      h = { t };
      m.set(t, h);
    }
    return h;
  };
  const read = (f: string) => JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'));

  for (const r of read('eia_demand.json')) get(key(r.period)).demand = Number(r.value);
  for (const r of read('eia_demand_forecast.json')) get(key(r.period)).demandEiaFcst = Number(r.value);
  for (const r of read('eia_fuel.json')) {
    const h = get(key(r.period));
    if (r.fueltype === 'SUN') h.solar = Number(r.value);
    if (r.fueltype === 'WND') h.wind = Number(r.value);
    if (r.fueltype === 'COL') h.coal = Number(r.value);
    if (r.fueltype === 'NG') h.gas = Number(r.value);
    h.genTotal = (h.genTotal ?? 0) + Math.max(0, Number(r.value));
  }
  const w = read('weather.json').hourly;
  w.time.forEach((tm: string, i: number) => {
    const h = get(key(tm));
    h.temp = w.temperature_2m[i];
    h.rad = w.shortwave_radiation[i];
    h.cloud = w.cloud_cover[i];
  });
  for (const r of read(`lmp_${lmpNode}.json`)) {
    const h = get(key(r.start));
    if (r.type === 'LMP') h.lmp = r.value;
    if (r.type === 'MCC') h.mcc = r.value;
    if (r.type === 'MCE') h.mce = r.value;
  }
  return [...m.values()].sort((a, b) => a.t.localeCompare(b.t));
}

export function dataQuality(hours: Hour[]) {
  const withDemand = hours.filter(h => h.demand !== undefined);
  const withLmp = hours.filter(h => h.lmp !== undefined);
  const gaps = (arr: Hour[]) => {
    let maxGap = 0;
    for (let i = 1; i < arr.length; i++) {
      const g = (Date.parse(arr[i].t) - Date.parse(arr[i - 1].t)) / 36e5;
      if (g > maxGap) maxGap = g;
    }
    return maxGap;
  };
  return {
    demandHours: withDemand.length,
    demandFirst: withDemand[0]?.t,
    demandLast: withDemand.at(-1)?.t,
    demandMaxGapHours: gaps(withDemand),
    priceHours: withLmp.length,
    priceFirst: withLmp[0]?.t,
    priceLast: withLmp.at(-1)?.t,
    priceMaxGapHours: gaps(withLmp),
  };
}
