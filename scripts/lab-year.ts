// Lab, long window: the same engine walked forward day by day over every day the open data covers,
// planned on the weather forecast AS IT WAS ISSUED the day before (Open-Meteo previous runs), and
// graded on the demand that really showed up. Nothing is tuned here: weights, premium, jam threshold
// and battery are the main page's, fixed before any test.
// Needs lab-data/*.json.gz from the lab-data workflow. Writes public/data/lab-year.json.
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dispatch } from '../src/engine/dispatch.js';
import { peakShaver, runReplan } from '../src/engine/execute.js';
import { loadHours } from '../src/engine/merge.js';
import { PARAMS as p } from '../src/engine/params.js';
import { score } from '../src/engine/score.js';
import { buildDay } from '../src/engine/stress.js';
import { localDate } from '../src/engine/time.js';
import type { DayInputs, Hour, Params, Schedule } from '../src/engine/types.js';

const RAW = 'data/lab-raw';
fs.mkdirSync(RAW, { recursive: true });
const gz = (f: string) => JSON.parse(gunzipSync(fs.readFileSync(`lab-data/${f}.json.gz`)).toString());
for (const f of ['eia_demand', 'eia_demand_forecast', 'eia_fuel', 'lmp_TH_PACE_GEN-APND'])
  fs.writeFileSync(`${RAW}/${f}.json`, JSON.stringify(gz(f)));
fs.writeFileSync(`${RAW}/weather.json`, JSON.stringify(gz('weather_observed')));
const issuedRaw = gz('weather_issued').hourly;
const key = (s: string) => `${s.slice(0, 13)}:00:00Z`;
const issued = new Map<string, { temp: number; rad: number; cloud: number }>();
issuedRaw.time.forEach((t: string, i: number) => {
  const temp = issuedRaw.temperature_2m_previous_day1[i];
  const rad = issuedRaw.shortwave_radiation_previous_day1[i];
  const cloud = issuedRaw.cloud_cover_previous_day1[i];
  if (temp !== null && rad !== null && cloud !== null) issued.set(key(t), { temp, rad, cloud });
});

const all = loadHours(RAW);
const OBS_DAYS_NEEDED = 30;
const dates = [...new Set(all.map(h => localDate(h.t)))].sort();
const firstDemand = all.find(h => h.demand !== undefined)!.t;
const startOK = (d: string) => Date.parse(`${d}T12:00:00Z`) - Date.parse(firstDemand) > OBS_DAYS_NEEDED * 864e5;

// A day's inputs with the target day's weather replaced by the forecast issued the day before.
// Before day ahead prices exist (PacifiCorp joined CAISO's day ahead market in May 2026), the day is
// planned on grid traffic only: price is set to 0 and the index uses the no price weights the main
// page already tests (40 demand, 40 net load, 20 ramp).
const NO_PRICE: Params = { ...p, stressWeights: { demand: 0.4, netLoad: 0.4, ramp: 0.2, price: 0 } };
function dayIssued(d: string): { day: DayInputs; priced: boolean } | null {
  const dayHours = all.filter(h => localDate(h.t) === d);
  if (dayHours.length !== 24 || dayHours.some(h => !issued.has(h.t))) return null;
  const priced = dayHours.every(h => h.lmp !== undefined);
  const swapped: Hour[] = dayHours.map(h => ({ ...h, ...issued.get(h.t)!, lmp: priced ? h.lmp : 0 }));
  const hist = all.filter(h => h.t < dayHours[0].t);
  const day = buildDay([...hist, ...swapped], d, priced ? p : NO_PRICE);
  return day ? { day, priced } : null;
}

const DESIGN_FROM = '2026-09-26'; // the main page's first backtest day: the design window starts here
const A = p.asset;
const eta = Math.sqrt(A.roundTripEff);
const START_E = A.energyMWh * A.startSocFrac;
const NAMES = ['ours', 'planOnce', 'replanNoGuard', 'priceWithGuard', 'priceOnly', 'fiveLineRule'] as const;
type Name = (typeof NAMES)[number];
// Each plan carries its battery charge from one day into the next (days are chained).
const carry: Record<Name, number> = Object.fromEntries(NAMES.map(n => [n, START_E])) as Record<Name, number>;
const physicalOk = (s: Schedule, start: number) => {
  let e = start;
  for (let t = 0; t < s.soc.length; t++) {
    if (s.charge[t] > A.powerMW + 1e-6 || s.discharge[t] > A.powerMW + 1e-6) return false;
    if (s.charge[t] > 1e-9 && s.discharge[t] > 1e-9) return false;
    e += s.charge[t] * eta - s.discharge[t] / eta;
    if (Math.abs(e - s.soc[t]) > 1e-6) return false;
    if (s.soc[t] < A.energyMWh * A.socMinFrac - 1e-6 || s.soc[t] > A.energyMWh * A.socMaxFrac + 1e-6) return false;
  }
  return true;
};
const rows: Record<string, unknown>[] = [];
let prevMiss = 0;
const t0 = Date.now();
for (const d of dates) {
  if (!startOK(d)) continue;
  const got = dayIssued(d);
  if (!got) continue;
  const { day, priced } = got;
  const actRaw = day.actual!.demand;
  if (actRaw.some(x => x === undefined)) continue;
  const k = day.loadMW[0] / day.demandHat[0];
  const act = actRaw.map(x => x! * k);
  const base = { forecastLoad: day.loadMW, cap: day.capMW, penalty: p.overloadPenalty, margin: 0 };
  const prem = priced ? p.stressPremium : NO_PRICE.stressPremium;
  const signal = day.lmp.map((x, i) => x + prem * day.stress[i]);
  const noCharge = day.stress.map(s => s >= p.congestedThreshold); // the everyday planner never charges in a jam
  const runs: Partial<Record<Name, Schedule>> = {
    ours: runReplan(A, { ...base, signal, noCharge }, act, true, prevMiss, carry.ours),
    planOnce: dispatch(
      signal,
      A,
      { load: day.loadMW, cap: day.capMW, penalty: p.overloadPenalty, noCharge },
      0.25,
      carry.planOnce,
    ),
    replanNoGuard: runReplan(A, { ...base, signal, noCharge }, act, false, prevMiss, carry.replanNoGuard),
    fiveLineRule: peakShaver(A, act, day.hourLocal, day.capMW, carry.fiveLineRule),
  };
  if (priced) {
    runs.priceWithGuard = runReplan(A, { ...base, signal: day.lmp }, act, true, prevMiss, carry.priceWithGuard);
    runs.priceOnly = dispatch(day.lmp, A, undefined, 0.25, carry.priceOnly);
  }
  const real = { ...day, loadMW: act };
  const sc = Object.fromEntries(Object.entries(runs).map(([n, s]) => [n, score(real, s!, p)]));
  const none = score(real, { charge: Array(24).fill(0), discharge: Array(24).fill(0), soc: Array(24).fill(0) }, p);
  const mape = (f: (number | undefined)[]) => {
    const pairs = f.map((x, i) => [x, actRaw[i]!] as const).filter(([x]) => x !== undefined && x! > 0);
    return pairs.length ? pairs.reduce((s, [x, a]) => s + Math.abs(x! - a) / a, 0) / pairs.length : null;
  };
  const physical = Object.entries(runs).every(([n, s]) => physicalOk(s!, carry[n as Name]));
  const startCharge = { ...carry };
  for (const [n, s] of Object.entries(runs)) carry[n as Name] = s!.soc[23];
  rows.push({
    date: d,
    month: d.slice(0, 7),
    priced,
    designWindow: d >= DESIGN_FROM,
    capMW: day.capMW,
    peakMW: Math.max(...act),
    jamHours: day.stress.filter(x => x >= p.congestedThreshold).length,
    overBeforeMWh: none.overloadBeforeMWh,
    mapeOursIssued: mape(day.demandHat),
    mapeEia: mape(day.actual!.eiaFcst),
    maxMissMW: Math.max(...act.map((x, i) => x - day.loadMW[i])),
    guardHours: (runs.ours as Schedule & { guardHours: number }).guardHours,
    oursStartMWh: startCharge.ours,
    oursEndMWh: carry.ours,
    over: Object.fromEntries(Object.entries(sc).map(([n, s]) => [n, s.overloadAfterMWh])),
    relief: Object.fromEntries(Object.entries(sc).map(([n, s]) => [n, s.congestedEnergyRelievedMWh])),
    value: priced ? Object.fromEntries(Object.entries(sc).map(([n, s]) => [n, s.netValue])) : null,
    physical,
  });
  prevMiss = act[23] - day.loadMW[23];
}
console.error(`${rows.length} days in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

// ---------- summaries ----------
const TOL = 0.1;
type R = {
  date: string;
  month: string;
  priced: boolean;
  designWindow: boolean;
  jamHours: number;
  overBeforeMWh: number;
  mapeOursIssued: number | null;
  mapeEia: number | null;
  maxMissMW: number;
  guardHours: number;
  oursEndMWh: number;
  over: Record<string, number>;
  relief: Record<string, number>;
  value: Record<string, number> | null;
  physical: boolean;
};
const rs = rows as unknown as R[];
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const summarize = (xs: R[]) => {
  const subOver = xs.filter(r => r.overBeforeMWh > TOL);
  return {
    days: xs.length,
    first: xs[0]?.date,
    last: xs.at(-1)?.date,
    priced: xs.every(r => r.priced),
    substationOverDays: subOver.length,
    substationOverMWh: xs.reduce((a, r) => a + r.overBeforeMWh, 0),
    meanJamHours: mean(xs.map(r => r.jamHours)),
    mapePct: {
      oursIssuedWeather: 100 * mean(xs.filter(r => r.mapeOursIssued !== null).map(r => r.mapeOursIssued!)),
      eiaDayAhead: 100 * mean(xs.filter(r => r.mapeEia !== null).map(r => r.mapeEia!)),
    },
    maxMissMW: Math.max(...xs.map(r => r.maxMissMW)),
    guardHoursPerDay: mean(xs.map(r => r.guardHours)),
    daysOursEndedBelowHalf: xs.filter(r => r.oursEndMWh < START_E - 0.5).length,
    physicalChecksPass: xs.every(r => r.physical),
    byStrategy: Object.fromEntries(
      NAMES.filter(n => xs.every(r => r.over[n] !== undefined)).map(n => [
        n,
        {
          daysMadeWorse: xs.filter(r => r.over[n] > r.overBeforeMWh + TOL).length,
          addedOverMWh: xs.reduce((a, r) => a + Math.max(0, r.over[n] - r.overBeforeMWh), 0),
          daysOver: xs.filter(r => r.over[n] > TOL).length,
          substationDaysFullyCovered: subOver.filter(r => r.over[n] <= TOL).length,
          totalOverMWh: xs.reduce((a, r) => a + r.over[n], 0),
          jamReliefMWh: mean(xs.map(r => r.relief[n])),
          valuePerDay: xs.every(r => r.value) ? mean(xs.map(r => r.value![n])) : null,
        },
      ]),
    ),
  };
};
const months = [...new Set(rs.map(r => r.month))];
const out = {
  generatedAt: new Date().toISOString(),
  method:
    'Walk forward, one day at a time, battery charge carried from day to day. Each day is planned the night before from data available then, on the weather forecast issued the day before, and graded on real demand. Main page settings, nothing tuned.',
  priced: summarize(rs.filter(r => r.priced)),
  trafficOnly: summarize(rs.filter(r => !r.priced)),
  pricedBeforeDesignWindow: summarize(rs.filter(r => r.priced && !r.designWindow)),
  byMonth: months.map(m => ({ month: m, ...summarize(rs.filter(r => r.month === m)) })),
  days: rows,
};
fs.writeFileSync('public/data/lab-year.json', `${JSON.stringify(out)}\n`);
const brief = (s: ReturnType<typeof summarize>) => ({
  ...s,
  byStrategy: Object.fromEntries(
    Object.entries(s.byStrategy).map(([n, v]) => [
      n,
      `worse ${v.daysMadeWorse} (+${v.addedOverMWh.toFixed(0)} MWh), covered ${v.substationDaysFullyCovered}/${s.substationOverDays}, over ${v.totalOverMWh.toFixed(0)} MWh, relief ${v.jamReliefMWh.toFixed(1)}, value ${v.valuePerDay?.toFixed(0)}`,
    ]),
  ),
});
console.log(
  JSON.stringify(
    {
      priced: brief(out.priced),
      trafficOnly: brief(out.trafficOnly),
      months: out.byMonth.map(m => [
        m.month,
        m.days,
        m.substationOverDays,
        m.byStrategy.ours?.daysMadeWorse,
        m.byStrategy.ours?.substationDaysFullyCovered,
        Math.round(m.mapePct.oursIssuedWeather * 10) / 10,
        Math.round(m.mapePct.eiaDayAhead * 10) / 10,
      ]),
    },
    null,
    1,
  ),
);
