import fs from 'node:fs';
import { ASSUMPTIONS } from '../src/engine/params.js';
import { dispatch, naiveSchedule, zeroSchedule } from '../src/engine/dispatch.js';
import { score, loadAfter } from '../src/engine/score.js';
import { fitSolar } from '../src/engine/forecast.js';
import { intensity, co2DeltaT } from '../src/engine/carbon.js';
import { planAhead, runWithReplan } from '../src/engine/execute.js';
import type { DayInputs, Schedule } from '../src/engine/types.js';
import { p, all, quality, byT, tomorrow, backtestDates, days, actualLoad, MARGIN_DAYS, marginFor, misses, co2HatFor, awareSignal } from './common.js';

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

const KEYS = ['stressAware', 'priceOnly', 'clean', 'naive', 'awareV1', 'awareMarginOnly', 'awareReplanMargin'] as const;
interface DayRow {
  date: string; margin: number; overB: number; overA: Record<string, number>; net: Record<string, number>;
  relieved: Record<string, number>; peakRed: Record<string, number>; co2?: Record<string, number>;
  congestedHours: number; checksOk: boolean;
}
const rows: DayRow[] = [];
let mapeOursSum = 0, mapeEiaSum = 0, mapeN = 0, mapeEiaN = 0;
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
  const run: Record<string, Schedule> = {
    stressAware: runWithReplan(p.asset, { forecastLoad: day.loadMW, cap: day.capMW, margin: 0, signal: awareSignal(day), penalty: p.overloadPenalty }, act),
    priceOnly: plan.priceOnly,
    clean: runWithReplan(p.asset, { forecastLoad: day.loadMW, cap: day.capMW, margin: 0, signal: co2Hat, penalty: p.cleanOverloadPenalty }, act),
    naive: plan.naive,
    none: plan.none,
    awareV1: dispatch(awareSignal(day), p.asset, { load: day.loadMW, cap: day.capMW, penalty: p.overloadPenalty }),
    // Ablation: which part of the fix matters.
    // A safety margin (90th percentile of the last 14 days of forecast misses), tested and not used.
    awareMarginOnly: planAhead(p.asset, { forecastLoad: day.loadMW, cap: day.capMW, margin, signal: awareSignal(day), penalty: p.overloadPenalty }),
    awareReplanMargin: runWithReplan(p.asset, { forecastLoad: day.loadMW, cap: day.capMW, margin, signal: awareSignal(day), penalty: p.overloadPenalty }, act),
  };
  const real = { ...day, loadMW: act };
  const sc = Object.fromEntries(Object.entries(run).map(([k, s]) => [k, score(real, s, p)]));
  let dm = 0, dn = 0, em = 0, en = 0;
  day.actual!.demand.forEach((a, i) => {
    dm += Math.abs(day.demandHat[i] - a!) / a!; dn++;
    const f = day.actual!.eiaFcst[i];
    if (f !== undefined) { em += Math.abs(f - a!) / a!; en++; }
  });
  mapeOursSum += dm; mapeN += dn; mapeEiaSum += em; mapeEiaN += en;
  const actInt = day.t.map(t => { const h = byT.get(t); return h ? intensity(h) : undefined; });
  const co2 = actInt.every(x => x !== undefined)
    ? Object.fromEntries(KEYS.map(k => [k, co2DeltaT(actInt as number[], run[k].charge, run[k].discharge)]))
    : undefined;
  rows.push({
    date: d, margin, co2,
    overB: sc.none.overloadBeforeMWh,
    overA: Object.fromEntries(KEYS.map(k => [k, sc[k].overloadAfterMWh])),
    net: Object.fromEntries(KEYS.map(k => [k, sc[k].netValue])),
    relieved: Object.fromEntries(KEYS.map(k => [k, sc[k].congestedEnergyRelievedMWh])),
    peakRed: Object.fromEntries(KEYS.map(k => [k, sc[k].peakReductionMW])),
    congestedHours: sc.none.congestedHours,
    checksOk: Object.values(sc).every(c => Object.values(c.checks).every(Boolean)),
  });
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const per = (f: (r: DayRow, k: string) => number, rs = rows) => Object.fromEntries(KEYS.map(k => [k, mean(rs.map(r => f(r, k)))]));
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
  meanCo2TPerDay: per((r, k) => r.co2![k], rows.filter(r => r.co2)),
  demandForecastMapePct: { ours: (100 * mapeOursSum) / mapeN, eiaDayAhead: (100 * mapeEiaSum) / mapeEiaN },
};

const tDay = days.get(tomorrow)!;
const tMargin = marginFor(tomorrow);

function pack(day: DayInputs, capFactor = 1) {
  const d = capFactor === 1 ? day : { ...day, capMW: day.capMW * capFactor };
  const co2Hat = co2HatFor(d);
  const st = plans(d, co2Hat, 0);
  const sc = Object.fromEntries(Object.entries(st).map(([k, s]) => [k, { ...score(d, s, p), co2T: co2DeltaT(co2Hat, s.charge, s.discharge) }]));
  const la = loadAfter(d, st.stressAware), lp = loadAfter(d, st.priceOnly), lc = loadAfter(d, st.clean);
  const slot = (s: Schedule, l: number[], i: number) => ({ charge: s.charge[i], discharge: s.discharge[i], soc: s.soc[i], loadAfter: l[i] });
  return {
    capMW: d.capMW,
    scorecards: sc,
    hours: d.hourLocal.map((hr, i) => ({
      hourLocal: hr, t: d.t[i], lmp: d.lmp[i], mcc: d.mcc[i], mce: d.mce[i],
      demandHat: d.demandHat[i], solarHat: d.solarHat[i], windHat: d.windHat[i], netLoadHat: d.netLoadHat[i],
      stress: d.stress[i], co2: co2Hat[i],
      comps: { demand: d.comps.demand[i], netLoad: d.comps.netLoad[i], ramp: d.comps.ramp[i], price: d.comps.price[i] },
      congested: d.stress[i] >= p.congestedThreshold,
      loadBefore: d.loadMW[i],
      aware: slot(st.stressAware, la, i), priceOnly: slot(st.priceOnly, lp, i), clean: slot(st.clean, lc, i),
    })),
  };
}

const normal = pack(tDay);
const derate = { description: 'A transformer is out and substation capacity drops 10 percent', capacityFactor: 0.9, ...pack(tDay, 0.9) };
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
};
fs.mkdirSync('public/data', { recursive: true });
fs.writeFileSync('public/data/report.json', JSON.stringify(report));
console.log(JSON.stringify({ date: tomorrow, tMargin, summary }, null, 1));
