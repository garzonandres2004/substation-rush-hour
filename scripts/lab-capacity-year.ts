// Lab: capacity unlocked over a full year, the interconnection question.
// The substation is rated exactly for its own annual peak (100 MW = the year's highest hour), so it
// has no room for new always on load without storage. How much can it take with a Station, planned
// every night on the weather forecast issued the day before, and graded on real demand?
// Per day we find the largest new load that day survives (bisection in 0.25 MW steps), then verify
// the year wide answer on every day. Run after lab-year.ts (reuses data/lab-raw).
// Writes public/data/lab-capacity-year.json.
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { marginFromMisses, peakShaver, runReplan } from '../src/engine/execute.js';
import { loadHours } from '../src/engine/merge.js';
import { PARAMS as p } from '../src/engine/params.js';
import { buildDay } from '../src/engine/stress.js';
import { localDate } from '../src/engine/time.js';
import type { Asset, DayInputs, Hour, Params } from '../src/engine/types.js';

const RAW = 'data/lab-raw';
const gz = (f: string) => JSON.parse(gunzipSync(fs.readFileSync(`lab-data/${f}.json.gz`)).toString());
const issuedRaw = gz('weather_issued').hourly;
const key = (s: string) => `${s.slice(0, 13)}:00:00Z`;
const issued = new Map<string, { temp: number; rad: number; cloud: number }>();
issuedRaw.time.forEach((t: string, i: number) => {
  const v = [
    issuedRaw.temperature_2m_previous_day1[i],
    issuedRaw.shortwave_radiation_previous_day1[i],
    issuedRaw.cloud_cover_previous_day1[i],
  ];
  if (v.every((x: number | null) => x !== null)) issued.set(key(t), { temp: v[0], rad: v[1], cloud: v[2] });
});
const all = loadHours(RAW);
const NO_PRICE: Params = { ...p, stressWeights: { demand: 0.4, netLoad: 0.4, ramp: 0.2, price: 0 } };
const firstDemand = Date.parse(all.find(h => h.demand !== undefined)!.t);
const dates = [...new Set(all.map(h => localDate(h.t)))].sort();

// One fixed scale for the whole year: 100 MW is the year's highest demand hour.
const maxDemand = Math.max(...all.filter(h => h.demand !== undefined).map(h => h.demand!));
const K = p.substationPeakMW / maxDemand;
const RATING = p.substationPeakMW;

interface Case {
  date: string;
  priced: boolean;
  fc: number[];
  act: number[];
  signal: number[];
  noCharge: boolean[]; // forecast jam hours: the everyday planner never charges in them
  hourLocal: number[];
  prevMiss: number;
  margin: number; // largest forecast miss of the last 14 days, for capacity mode
}
const cases: Case[] = [];
let prevMiss = 0;
for (const d of dates) {
  if (Date.parse(`${d}T12:00:00Z`) - firstDemand < 30 * 864e5) continue;
  const dayHours = all.filter(h => localDate(h.t) === d);
  if (dayHours.length !== 24 || dayHours.some(h => !issued.has(h.t) || h.demand === undefined)) continue;
  const priced = dayHours.every(h => h.lmp !== undefined);
  const swapped: Hour[] = dayHours.map(h => ({ ...h, ...issued.get(h.t)!, lmp: priced ? h.lmp : 0 }));
  const day: DayInputs | null = buildDay(
    [...all.filter(h => h.t < dayHours[0].t), ...swapped],
    d,
    priced ? p : NO_PRICE,
  );
  if (!day) continue;
  const fc = day.demandHat.map(x => x * K);
  const act = dayHours.map(h => h.demand! * K);
  const prem = p.stressPremium;
  cases.push({
    date: d,
    priced,
    fc,
    act,
    signal: day.lmp.map((x, i) => x + prem * day.stress[i]),
    noCharge: day.stress.map(s => s >= p.congestedThreshold),
    hourLocal: day.hourLocal,
    prevMiss,
    margin: marginFromMisses(
      cases.slice(-14).flatMap(c => c.act.map((v, h) => v - c.fc[h])),
      1,
    ),
  });
  prevMiss = act[23] - fc[23];
}
console.error(`${cases.length} days`);

const TOL = 0.1;
const over = (load: number[], ch?: number[], di?: number[]) =>
  load.reduce((s, l, i) => s + Math.max(0, l + (ch ? ch[i] - di![i] : 0) - RATING), 0);
type Mode = 'none' | 'ours' | 'capacity' | 'rule' | 'ruleFull';
function ok(c: Case, x: number, mode: Mode, a: Asset) {
  const act = c.act.map(l => l + x);
  if (mode === 'none') return over(act) <= TOL;
  if (mode === 'rule' || mode === 'ruleFull') {
    const s = peakShaver(
      a,
      act,
      c.hourLocal,
      RATING,
      undefined,
      mode === 'ruleFull' ? a.energyMWh * a.socMaxFrac : undefined,
    );
    return over(act, s.charge, s.discharge) <= TOL;
  }
  // Capacity mode (see capacity.ts): on days the forecast plus the largest recent miss shows risk, stay
  // full until the risk has passed and shave exactly; other days run the everyday planner.
  let floor: number[] | undefined;
  if (mode === 'capacity') {
    const need = c.fc.map(l => Math.max(0, l + x + c.margin - RATING));
    const last = need.reduce((acc, v, t) => (v > 0 ? t : acc), -1);
    if (last >= 0) floor = need.map((_, t) => (t < last ? a.energyMWh * a.socMaxFrac : a.energyMWh * a.socMinFrac));
  }
  const s = runReplan(
    a,
    {
      forecastLoad: c.fc.map(l => l + x),
      cap: RATING,
      margin: 0,
      signal: c.signal,
      noCharge: c.noCharge,
      penalty: p.overloadPenalty,
    },
    act,
    true,
    c.prevMiss,
    undefined,
    undefined,
    floor,
    floor !== undefined,
  );
  return over(act, s.charge, s.discharge) <= TOL;
}
function dayMax(c: Case, mode: Mode, a: Asset, hi = 24) {
  if (!ok(c, 0, mode, a)) return 0;
  let lo = 0,
    top = hi;
  while (top - lo > 0.25 + 1e-9) {
    const mid = Math.round((lo + top) / 2 / 0.25) * 0.25;
    if (ok(c, mid, mode, a)) lo = mid;
    else top = mid;
  }
  return lo;
}
function yearCapacity(mode: Mode, a: Asset) {
  const per = cases.map(c => ({ date: c.date, mw: dayMax(c, mode, a) }));
  let x = Math.min(...per.map(r => r.mw));
  // Verify on every day (the per day answer assumes a day that survives x survives less).
  while (x > 0 && !cases.every(c => ok(c, x, mode, a))) x -= 0.25;
  const sorted = [...per].sort((u, v) => u.mw - v.mw);
  const season = (m: string[]) => Math.min(...per.filter(r => m.includes(r.date.slice(5, 7))).map(r => r.mw));
  return {
    mw: x,
    bindingDays: sorted.slice(0, 5),
    winterMW: season(['12', '01', '02']),
    springMW: season(['03', '04', '05']),
    summerMW: season(['06', '07', '08']),
    autumnMW: season(['09', '10', '11']),
    medianDayMW: sorted[Math.floor(sorted.length / 2)].mw,
  };
}
const t0 = Date.now();
const out: Record<string, unknown> = {
  generatedAt: new Date().toISOString(),
  days: cases.length,
  first: cases[0].date,
  last: cases.at(-1)!.date,
  pricedDays: cases.filter(c => c.priced).length,
  ratingMW: RATING,
  peakDay: cases.reduce((b, c) => (Math.max(...c.act) > Math.max(...b.act) ? c : b)).date,
  withoutStorage: yearCapacity('none', p.asset),
};
console.error('none', Date.now() - t0);
const sizes: [string, number, number][] = [
  ['10 MW, 2 h', 10, 20],
  ['10 MW, 4 h', 10, 40],
  ['10 MW, 8 h', 10, 80],
];
out.stations = sizes.map(([label, mw, mwh]) => {
  const a = { ...p.asset, powerMW: mw, energyMWh: mwh };
  const r = {
    label,
    ours: yearCapacity('ours', a),
    capacityMode: yearCapacity('capacity', a),
    rule: yearCapacity('rule', a),
    ruleFull: yearCapacity('ruleFull', a),
  };
  console.error(
    label,
    r.ours.mw,
    r.capacityMode.mw,
    r.rule.mw,
    r.ruleFull.mw,
    `${((Date.now() - t0) / 1000).toFixed(0)} s`,
  );
  return r;
});
fs.writeFileSync('public/data/lab-capacity-year.json', `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify(out, null, 1));
