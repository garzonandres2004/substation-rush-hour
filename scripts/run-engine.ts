import fs from 'node:fs';
import { ASSUMPTIONS } from '../src/engine/params.js';
import { dispatch, naiveSchedule, zeroSchedule } from '../src/engine/dispatch.js';
import { score, loadAfter } from '../src/engine/score.js';
import { fitSolar } from '../src/engine/forecast.js';
import { intensity, co2DeltaT } from '../src/engine/carbon.js';
import { planAhead, runReplan, peakShaver } from '../src/engine/execute.js';
import type { DayInputs, Schedule } from '../src/engine/types.js';
import {
  p,
  all,
  quality,
  byT,
  tomorrow,
  backtestDates,
  days,
  actualLoad,
  MARGIN_DAYS,
  marginFor,
  misses,
  co2HatFor,
  awareSignal,
} from './common.js';

// Day ahead plans on forecast load (plus an optional margin, used only in the ablation).
function plans(day: DayInputs, co2Hat: number[], margin: number) {
  const base = { forecastLoad: day.loadMW, cap: day.capMW, margin };
  return {
    stressAware: planAhead(p.asset, { ...base, signal: awareSignal(day), penalty: p.overloadPenalty }),
    priceOnly: dispatch(day.lmp, p.asset),
    clean: planAhead(p.asset, { ...base, signal: co2Hat, penalty: p.cleanOverloadPenalty }),
    naive: naiveSchedule(p.asset, day.hourLocal),
    none: zeroSchedule(p.asset, 24),
  };
}

const KEYS = [
  'stressAware',
  'priceOnly',
  'clean',
  'naive',
  'awareV1',
  'awareReplan',
  'awareReplanMargin',
  'priceLimit',
  'peakShaver',
  'hindsight',
] as const;
interface DayRow {
  date: string;
  margin: number;
  overB: number;
  overA: Record<string, number>;
  net: Record<string, number>;
  relieved: Record<string, number>;
  peakRed: Record<string, number>;
  co2?: Record<string, number>;
  congestedHours: number;
  checksOk: boolean;
  guardHours: number;
  maxMissMW: number;
  jamHours: number[];
}
const rows: DayRow[] = [];
// Robustness checks for the judges' questions: does the result depend on our own forecast, on the
// $20 stress premium, or on the traffic index weights? Jam hours are always the page's own definition.
const PREMIUMS = [0, 5, 10, 20, 40];
const WEIGHTS: { name: string; w: { demand: number; netLoad: number; ramp: number; price: number } }[] = [
  { name: 'ours', w: p.stressWeights },
  { name: 'equal', w: { demand: 0.25, netLoad: 0.25, ramp: 0.25, price: 0.25 } },
  { name: 'demand heavy', w: { demand: 0.5, netLoad: 0.2, ramp: 0.1, price: 0.2 } },
  { name: 'no price', w: { demand: 0.4, netLoad: 0.4, ramp: 0.2, price: 0 } },
];
type Sc = ReturnType<typeof score>;
const robust = {
  eia: { v1: [] as Sc[], replan: [] as Sc[], guard: [] as Sc[] },
  premium: Object.fromEntries(PREMIUMS.map(x => [x, [] as Sc[]])) as Record<number, Sc[]>,
  weights: Object.fromEntries(WEIGHTS.map(x => [x.name, [] as Sc[]])) as Record<string, Sc[]>,
};
let mapeOursSum = 0,
  mapeEiaSum = 0,
  mapeN = 0,
  mapeEiaN = 0;
for (const d of backtestDates) {
  const day = days.get(d);
  if (!day) continue;
  const actRaw = actualLoad(day);
  if (actRaw.some(x => x === undefined)) continue;
  const act = actRaw as number[];
  const margin = marginFor(d);
  const co2Hat = co2HatFor(day);
  const plan = plans(day, co2Hat, 0);
  // What actually runs: price only, fixed and the first version follow their plan blindly.
  // Stays out of traffic and Stays clean replan every hour with the load measured that hour.
  const prev = misses.get(
    [...misses.keys()]
      .filter(x => x < d)
      .sort()
      .at(-1) ?? '',
  );
  const prevMiss = prev ? prev[prev.length - 1] : 0;
  const base = { forecastLoad: day.loadMW, cap: day.capMW, penalty: p.overloadPenalty };
  // What actually runs, graded on the demand that showed up:
  // awareV1      plan once the night before, never adjust
  // awareReplan  replan every hour using only the forecast and last hour's miss
  // awareReplanMargin  same, plus a safety margin from the last 14 days of misses
  // stressAware  replan every hour plus a real time guard that reacts to the meter (main)
  // priceLimit   same layers as main but no traffic index (price plus the limit only)
  // peakShaver   five line rule: discharge whatever is over the limit, recharge at night
  const mainRun = runReplan(p.asset, { ...base, margin: 0, signal: awareSignal(day) }, act, true, prevMiss);
  const run: Record<string, Schedule> = {
    stressAware: mainRun,
    priceOnly: plan.priceOnly,
    clean: runReplan(
      p.asset,
      { ...base, margin: 0, signal: co2Hat, penalty: p.cleanOverloadPenalty },
      act,
      true,
      prevMiss,
    ),
    naive: plan.naive,
    none: plan.none,
    awareV1: planAhead(p.asset, { ...base, margin: 0, signal: awareSignal(day) }),
    awareReplan: runReplan(p.asset, { ...base, margin: 0, signal: awareSignal(day) }, act, false, prevMiss),
    awareReplanMargin: runReplan(p.asset, { ...base, margin, signal: awareSignal(day) }, act, false, prevMiss),
    priceLimit: runReplan(p.asset, { ...base, margin: 0, signal: day.lmp }, act, true, prevMiss),
    peakShaver: peakShaver(p.asset, act, day.hourLocal, day.capMW),
    // Perfect hindsight: the same objective planned once with the real load known in advance. Nothing can
    // do better on this day, so it is the yardstick for how much of the possible value ours captures.
    hindsight: dispatch(awareSignal(day), p.asset, { load: act, cap: day.capMW, penalty: p.overloadPenalty }),
  };

  const real = { ...day, loadMW: act };
  const sc = Object.fromEntries(Object.entries(run).map(([k, s]) => [k, score(real, s, p)]));
  const scoreRun = (s: Schedule) => score(real, s, p);
  const eiaF = day.actual!.eiaFcst;
  if (eiaF.every(x => x !== undefined && x > 0)) {
    // Same plan, but built on EIA's own day ahead demand forecast instead of ours (no observed weather).
    const k = day.loadMW[0] / day.demandHat[0];
    const b2 = {
      forecastLoad: (eiaF as number[]).map(x => x * k),
      cap: day.capMW,
      penalty: p.overloadPenalty,
      margin: 0,
      signal: awareSignal(day),
    };
    robust.eia.v1.push(scoreRun(planAhead(p.asset, b2)));
    robust.eia.replan.push(scoreRun(runReplan(p.asset, b2, act, false, 0)));
    robust.eia.guard.push(scoreRun(runReplan(p.asset, b2, act, true, 0)));
  }
  for (const prem of PREMIUMS) {
    const sig = day.lmp.map((x, i) => x + prem * day.stress[i]);
    robust.premium[prem].push(scoreRun(runReplan(p.asset, { ...base, margin: 0, signal: sig }, act, true, prevMiss)));
  }
  for (const { name, w } of WEIGHTS) {
    const alt = day.lmp.map(
      (_, i) =>
        w.demand * day.comps.demand[i] +
        w.netLoad * day.comps.netLoad[i] +
        w.ramp * day.comps.ramp[i] +
        w.price * day.comps.price[i],
    );
    const sig = day.lmp.map((x, i) => x + p.stressPremium * alt[i]);
    robust.weights[name].push(scoreRun(runReplan(p.asset, { ...base, margin: 0, signal: sig }, act, true, prevMiss)));
  }
  let dm = 0,
    dn = 0,
    em = 0,
    en = 0;
  day.actual!.demand.forEach((a, i) => {
    dm += Math.abs(day.demandHat[i] - a!) / a!;
    dn++;
    const f = day.actual!.eiaFcst[i];
    if (f !== undefined) {
      em += Math.abs(f - a!) / a!;
      en++;
    }
  });
  mapeOursSum += dm;
  mapeN += dn;
  mapeEiaSum += em;
  mapeEiaN += en;
  const actInt = day.t.map(t => {
    const h = byT.get(t);
    return h ? intensity(h) : undefined;
  });
  const co2 = actInt.every(x => x !== undefined)
    ? Object.fromEntries(KEYS.map(k => [k, co2DeltaT(actInt as number[], run[k].charge, run[k].discharge)]))
    : undefined;
  rows.push({
    date: d,
    margin,
    co2,
    overB: sc.none.overloadBeforeMWh,
    overA: Object.fromEntries(KEYS.map(k => [k, sc[k].overloadAfterMWh])),
    net: Object.fromEntries(KEYS.map(k => [k, sc[k].netValue])),
    relieved: Object.fromEntries(KEYS.map(k => [k, sc[k].congestedEnergyRelievedMWh])),
    peakRed: Object.fromEntries(KEYS.map(k => [k, sc[k].peakReductionMW])),
    congestedHours: sc.none.congestedHours,
    checksOk: Object.values(sc).every(c => Object.values(c.checks).every(Boolean)),
    guardHours: mainRun.guardHours,
    maxMissMW: Math.max(...act.map((x, i) => x - day.loadMW[i])),
    jamHours: day.hourLocal.filter((_, i) => day.stress[i] >= p.congestedThreshold),
  });
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const per = (f: (r: DayRow, k: string) => number, rs = rows) =>
  Object.fromEntries(KEYS.map(k => [k, mean(rs.map(r => f(r, k)))]));
const OVER_TOL = 0.1; // MWh per day; smaller amounts are rounding in the 0.25 MWh planning grid
const summary = {
  days: rows.length,
  firstDay: rows[0]?.date,
  lastDay: rows.at(-1)?.date,
  scoredOn: 'actual demand',
  overloadToleranceMWh: OVER_TOL,
  meanMarginMW: mean(rows.map(r => r.margin)),
  maxForecastMissMW: Math.max(...rows.flatMap(r => misses.get(r.date) ?? [])),
  meanNetValuePerDay: per((r, k) => r.net[k]),
  meanCongestedEnergyRelievedMWh: per((r, k) => r.relieved[k]),
  meanPeakReductionMW: per((r, k) => r.peakRed[k]),
  meanOverloadBeforeMWh: mean(rows.map(r => r.overB)),
  meanOverloadAfterMWh: per((r, k) => r.overA[k]),
  daysWithOverload: rows.filter(r => r.overB > OVER_TOL).length,
  daysCausingOverload: Object.fromEntries(KEYS.map(k => [k, rows.filter(r => r.overA[k] > OVER_TOL).length])),
  totalOverloadMWh: Object.fromEntries(KEYS.map(k => [k, rows.reduce((s, r) => s + r.overA[k], 0)])),
  meanCongestedHoursPerDay: mean(rows.map(r => r.congestedHours)),
  allConstraintChecksPass: rows.every(r => r.checksOk),
  carbonDays: rows.filter(r => r.co2).length,
  meanCo2TPerDay: per(
    (r, k) => r.co2![k],
    rows.filter(r => r.co2),
  ),
  // Share of the perfect hindsight plan's value and jam relief that ours gets, summed over the days.
  captureVsHindsight: (() => {
    const sum = (k: string, f: (r: DayRow) => Record<string, number>) => rows.reduce((a, r) => a + f(r)[k], 0);
    const pct = (f: (r: DayRow) => Record<string, number>) =>
      sum('hindsight', f) > 0 ? (100 * sum('stressAware', f)) / sum('hindsight', f) : null;
    return { valuePct: pct(r => r.net), jamReliefPct: pct(r => r.relieved) };
  })(),
  demandForecastMapePct: { ours: (100 * mapeOursSum) / mapeN, eiaDayAhead: (100 * mapeEiaSum) / mapeEiaN },
  robust: (() => {
    const agg = (xs: Sc[]) => ({
      days: xs.length,
      daysOver: xs.filter(x => x.overloadAfterMWh > OVER_TOL).length,
      totalOverMWh: xs.reduce((a, x) => a + x.overloadAfterMWh, 0),
      jamReliefMWh: mean(xs.map(x => x.congestedEnergyRelievedMWh)),
      valuePerDay: mean(xs.map(x => x.netValue)),
    });
    return {
      eiaForecast: { v1: agg(robust.eia.v1), replan: agg(robust.eia.replan), guard: agg(robust.eia.guard) },
      premium: PREMIUMS.map(x => ({ premium: x, ...agg(robust.premium[x]) })),
      weights: WEIGHTS.map(x => ({ name: x.name, w: x.w, ...agg(robust.weights[x.name]) })),
    };
  })(),
};

const tDay = days.get(tomorrow)!;
const tMargin = marginFor(tomorrow);

function pack(day: DayInputs, capFactor = 1) {
  const d = capFactor === 1 ? day : { ...day, capMW: day.capMW * capFactor };
  const co2Hat = co2HatFor(d);
  const st = plans(d, co2Hat, 0);
  const sc = Object.fromEntries(
    Object.entries(st).map(([k, s]) => [k, { ...score(d, s, p), co2T: co2DeltaT(co2Hat, s.charge, s.discharge) }]),
  );
  const la = loadAfter(d, st.stressAware),
    lp = loadAfter(d, st.priceOnly),
    lc = loadAfter(d, st.clean);
  const slot = (s: Schedule, l: number[], i: number) => ({
    charge: s.charge[i],
    discharge: s.discharge[i],
    soc: s.soc[i],
    loadAfter: l[i],
  });
  return {
    capMW: d.capMW,
    scorecards: sc,
    hours: d.hourLocal.map((hr, i) => ({
      hourLocal: hr,
      t: d.t[i],
      lmp: d.lmp[i],
      mcc: d.mcc[i],
      mce: d.mce[i],
      demandHat: d.demandHat[i],
      solarHat: d.solarHat[i],
      windHat: d.windHat[i],
      netLoadHat: d.netLoadHat[i],
      stress: d.stress[i],
      co2: co2Hat[i],
      comps: { demand: d.comps.demand[i], netLoad: d.comps.netLoad[i], ramp: d.comps.ramp[i], price: d.comps.price[i] },
      congested: d.stress[i] >= p.congestedThreshold,
      loadBefore: d.loadMW[i],
      aware: slot(st.stressAware, la, i),
      priceOnly: slot(st.priceOnly, lp, i),
      clean: slot(st.clean, lc, i),
    })),
  };
}

const normal = pack(tDay);
const derate = {
  description:
    'An equipment derate cuts substation capacity 10 percent, for example a cooling failure or a hot day rating',
  capacityFactor: 0.9,
  ...pack(tDay, 0.9),
};
const solar = fitSolar(all.filter(h => h.t < tDay.t[0]));
const report = {
  generatedAt: new Date().toISOString(),
  region: 'PacifiCorp East (Utah), CAISO day ahead hub TH_PACE_GEN-APND',
  date: tomorrow,
  params: { ...p, marginQuantile: 0.9, marginDays: MARGIN_DAYS },
  assumptions: ASSUMPTIONS,
  dataQuality: quality,
  solarModel: { a: solar.a, b: solar.b },
  scenarios: { normal, derate },
  backtest: { summary, days: rows },
  capacity: JSON.parse(fs.readFileSync('public/data/capacity.json', 'utf8')),
  summer: fs.existsSync('public/data/summer.json')
    ? JSON.parse(fs.readFileSync('public/data/summer.json', 'utf8'))
    : null,
};
fs.mkdirSync('public/data', { recursive: true });
fs.writeFileSync('public/data/report.json', JSON.stringify(report));
console.log(JSON.stringify({ date: tomorrow, tMargin, summary }, null, 1));
