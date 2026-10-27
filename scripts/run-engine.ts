import fs from 'node:fs';
import { loadHours, dataQuality } from '../src/engine/merge.js';
import { PARAMS, ASSUMPTIONS } from '../src/engine/params.js';
import { buildDay } from '../src/engine/stress.js';
import { dispatch, naiveSchedule, zeroSchedule } from '../src/engine/dispatch.js';
import { score, loadAfter } from '../src/engine/score.js';
import { localDate } from '../src/engine/time.js';
import { fitSolar } from '../src/engine/forecast.js';
import { intensity, intensityHat, co2DeltaT } from '../src/engine/carbon.js';
import type { Hour } from '../src/engine/types.js';

const p = PARAMS;
const all = loadHours();
const quality = dataQuality(all);

const dates = [...new Set(all.filter(h => h.lmp !== undefined).map(h => localDate(h.t)))].sort();
const fullDates = dates.filter(d => all.filter(h => localDate(h.t) === d && h.lmp !== undefined).length === 24);
const tomorrow = fullDates.at(-1)!;
const firstBacktest = fullDates[8];
const backtestDates = fullDates.filter(d => d >= firstBacktest && d < tomorrow);

function strategies(day: NonNullable<ReturnType<typeof buildDay>>, co2Hat: number[]) {
  const limit = { load: day.loadMW, cap: day.capMW, penalty: p.overloadPenalty };
  const stressAware = dispatch(day.lmp.map((x, i) => x + p.stressPremium * day.stress[i]), p.asset, limit);
  const priceOnly = dispatch(day.lmp, p.asset);
  // Stays clean: same exact dispatcher, but the signal is forecast grid CO2 (kg per MWh) instead of price.
  // The substation limit is kept as a hard rule with a large penalty in the same units.
  const clean = dispatch(co2Hat, p.asset, { ...limit, penalty: p.cleanOverloadPenalty });
  const naive = naiveSchedule(p.asset, day.hourLocal);
  const none = zeroSchedule(p.asset, 24);
  return { stressAware, priceOnly, clean, naive, none };
}
const co2HatFor = (day: NonNullable<ReturnType<typeof buildDay>>) => {
  const hist = all.filter(h => h.t < day.t[0]);
  return day.hourLocal.map(hr => intensityHat(hist, hr));
};

interface DayRow { co2?: Record<string, number>; date: string; overB: number; overA: Record<string, number>; net: Record<string, number>; relieved: Record<string, number>; peakRed: Record<string, number>; congestedHours: number; checksOk: boolean; demandMapeOurs?: number; demandMapeEia?: number; schedulesDiffer: number }
const rows: DayRow[] = [];
let mapeOursSum = 0, mapeEiaSum = 0, mapeN = 0, mapeEiaN = 0;
for (const d of backtestDates) {
  const day = buildDay(all, d, p);
  if (!day) continue;
  const s = strategies(day, co2HatFor(day));
  const sc = {
    stressAware: score(day, s.stressAware, p),
    priceOnly: score(day, s.priceOnly, p),
    clean: score(day, s.clean, p),
    naive: score(day, s.naive, p),
    none: score(day, s.none, p),
  };
  let diff = 0;
  for (let t = 0; t < 24; t++) {
    const a = s.stressAware.discharge[t] - s.stressAware.charge[t];
    const b = s.priceOnly.discharge[t] - s.priceOnly.charge[t];
    if (Math.abs(a - b) > 0.5) diff++;
  }
  let dm = 0, dn = 0, em = 0, en = 0;
  day.actual!.demand.forEach((act, i) => {
    if (act === undefined) return;
    dm += Math.abs(day.demandHat[i] - act) / act; dn++;
    const f = day.actual!.eiaFcst[i];
    if (f !== undefined) { em += Math.abs(f - act) / act; en++; }
  });
  if (dn) { mapeOursSum += dm; mapeN += dn; }
  if (en) { mapeEiaSum += em; mapeEiaN += en; }
  const keys = Object.keys(sc) as (keyof typeof sc)[];
  const actInt = day.t.map(t => { const h = all.find(x => x.t === t); return h ? intensity(h) : undefined; });
  const co2 = actInt.every(x => x !== undefined)
    ? Object.fromEntries(keys.map(k => [k, co2DeltaT(actInt as number[], s[k].charge, s[k].discharge)]))
    : undefined;
  rows.push({
    co2,
    date: d,
    overB: sc.none.overloadBeforeMWh,
    overA: Object.fromEntries(keys.map(k => [k, sc[k].overloadAfterMWh])),
    net: Object.fromEntries(keys.map(k => [k, sc[k].netValue])),
    relieved: Object.fromEntries(keys.map(k => [k, sc[k].congestedEnergyRelievedMWh])),
    peakRed: Object.fromEntries(keys.map(k => [k, sc[k].peakReductionMW])),
    congestedHours: sc.none.congestedHours,
    checksOk: keys.every(k => Object.values(sc[k].checks).every(Boolean)),
    schedulesDiffer: diff,
  });
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const summary = {
  days: rows.length,
  firstDay: rows[0]?.date,
  lastDay: rows.at(-1)?.date,
  meanNetValuePerDay: Object.fromEntries(['stressAware', 'priceOnly', 'clean', 'naive'].map(k => [k, mean(rows.map(r => r.net[k]))])),
  meanCongestedEnergyRelievedMWh: Object.fromEntries(['stressAware', 'priceOnly', 'clean', 'naive'].map(k => [k, mean(rows.map(r => r.relieved[k]))])),
  meanPeakReductionMW: Object.fromEntries(['stressAware', 'priceOnly', 'clean', 'naive'].map(k => [k, mean(rows.map(r => r.peakRed[k]))])),
  meanOverloadBeforeMWh: mean(rows.map(r => r.overB)),
  meanOverloadAfterMWh: Object.fromEntries(['stressAware', 'priceOnly', 'clean', 'naive'].map(k => [k, mean(rows.map(r => r.overA[k]))])),
  daysWithOverload: rows.filter(r => r.overB > 0).length,
  daysPriceOnlyCausesOverload: rows.filter(r => r.overA.priceOnly > 1e-6).length,
  daysStressAwareCausesOverload: rows.filter(r => r.overA.stressAware > 1e-6).length,
  daysCleanCausesOverload: rows.filter(r => r.overA.clean > 1e-6).length,
  meanCongestedHoursPerDay: mean(rows.map(r => r.congestedHours)),
  meanHoursStressAwareDiffersFromPriceOnly: mean(rows.map(r => r.schedulesDiffer)),
  allConstraintChecksPass: rows.every(r => r.checksOk),
  carbonDays: rows.filter(r => r.co2).length,
  meanCo2TPerDay: Object.fromEntries(['stressAware', 'priceOnly', 'clean', 'naive'].map(k => [k, mean(rows.filter(r => r.co2).map(r => r.co2![k]))])),
  demandForecastMapePct: { ours: (100 * mapeOursSum) / mapeN, eiaDayAhead: (100 * mapeEiaSum) / mapeEiaN },
};

const tDay = buildDay(all, tomorrow, p)!;

function pack(day: NonNullable<ReturnType<typeof buildDay>>, capFactor = 1) {
  const d = capFactor === 1 ? day : { ...day, capMW: day.capMW * capFactor };
  const co2Hat = co2HatFor(d);
  const st = strategies(d, co2Hat);
  const sc = {
    stressAware: score(d, st.stressAware, p),
    priceOnly: score(d, st.priceOnly, p),
    clean: score(d, st.clean, p),
    naive: score(d, st.naive, p),
    none: score(d, st.none, p),
  };
  for (const k of Object.keys(sc) as (keyof typeof sc)[]) (sc[k] as any).co2T = co2DeltaT(co2Hat, st[k].charge, st[k].discharge);
  const la = loadAfter(d, st.stressAware);
  const lp = loadAfter(d, st.priceOnly);
  const lc = loadAfter(d, st.clean);
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
      aware: { charge: st.stressAware.charge[i], discharge: st.stressAware.discharge[i], soc: st.stressAware.soc[i], loadAfter: la[i] },
      priceOnly: { charge: st.priceOnly.charge[i], discharge: st.priceOnly.discharge[i], soc: st.priceOnly.soc[i], loadAfter: lp[i] },
      clean: { charge: st.clean.charge[i], discharge: st.clean.discharge[i], soc: st.clean.soc[i], loadAfter: lc[i] },
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
  params: p,
  assumptions: ASSUMPTIONS,
  dataQuality: quality,
  solarModel: { a: solar.a, b: solar.b },
  scenarios: { normal, derate },
  backtest: { summary, days: rows },
};
fs.mkdirSync('public/data', { recursive: true });
fs.writeFileSync('public/data/report.json', JSON.stringify(report));
console.log(JSON.stringify({ date: tomorrow, summary, normal: normal.scorecards.stressAware, derate: derate.scorecards.stressAware }, null, 1));
