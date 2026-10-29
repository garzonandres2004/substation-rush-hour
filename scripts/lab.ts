// The lab: deeper checks on the same 30 real days, kept apart from the main page.
//  1. Confidence: how sure are the headline numbers, given only 30 days?
//  2. Utility events: if the utility calls the Station in the jam, is the energy there?
//  3. Margin versus guard: plan with a bigger safety margin instead of a guard, at any setting.
//  4. Transformer heat: a temperature based limit instead of a fixed MW number.
// Run after npm run engine. Writes public/data/lab.json.
import fs from 'node:fs';
import { marginFromMisses, peakShaver, runReplan } from '../src/engine/execute.js';
import { dispatch } from '../src/engine/dispatch.js';
import { ratingPU, simulate, XFMR } from '../src/engine/thermal.js';
import type { Schedule } from '../src/engine/types.js';
import { actualLoad, all, awareSignal, backtestDates, byT, days, misses, p } from './common.js';

const report = JSON.parse(fs.readFileSync('public/data/report.json', 'utf8'));
const TOL = 0.1;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const quant = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
};
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------- 1. Confidence on the page's own 30 days ----------
type Row = { relieved: Record<string, number>; net: Record<string, number>; overA: Record<string, number> };
const rows: Row[] = report.backtest.days;
const n = rows.length;
const B = 10000;
const r1 = rng(7);
const boot = (f: (rs: Row[]) => number) => {
  const out: number[] = [];
  for (let b = 0; b < B; b++) {
    const rs: Row[] = [];
    for (let i = 0; i < n; i++) rs.push(rows[Math.floor(r1() * n)]);
    out.push(f(rs));
  }
  return { mean: f(rows), lo: quant(out, 0.05), hi: quant(out, 0.95), out };
};
const m = (k: string, field: keyof Row) => (rs: Row[]) => mean(rs.map(r => r[field][k]));
const reliefOurs = boot(m('stressAware', 'relieved'));
const reliefPrice = boot(m('priceLimit', 'relieved'));
const reliefDiff = boot(rs => mean(rs.map(r => r.relieved.stressAware - r.relieved.priceLimit)));
const valueOurs = boot(m('stressAware', 'net'));
const costDiff = boot(rs => mean(rs.map(r => r.net.priceLimit - r.net.stressAware)));
// Wilson score interval for a count out of n; for zero, the exact one sided 95 percent bound.
const z = 1.96;
const wilson = (k: number) => {
  const ph = k / n,
    d = 1 + (z * z) / n,
    c = ph + (z * z) / (2 * n),
    h = z * Math.sqrt((ph * (1 - ph)) / n + (z * z) / (4 * n * n));
  return { days: k, lo: Math.max(0, (c - h) / d), hi: (c + h) / d };
};
const overDays = (k: string) => rows.filter(r => r.overA[k] > TOL).length;
const confidence = {
  days: n,
  resamples: B,
  jamReliefMWh: {
    ours: { mean: reliefOurs.mean, lo: reliefOurs.lo, hi: reliefOurs.hi },
    priceOnlyWithGuard: { mean: reliefPrice.mean, lo: reliefPrice.lo, hi: reliefPrice.hi },
    difference: { mean: reliefDiff.mean, lo: reliefDiff.lo, hi: reliefDiff.hi },
    shareOfResamplesOursAhead: reliefDiff.out.filter(x => x > 0).length / B,
  },
  valuePerDay: { mean: valueOurs.mean, lo: valueOurs.lo, hi: valueOurs.hi },
  costOfIndexPerDay: { mean: costDiff.mean, lo: costDiff.lo, hi: costDiff.hi },
  overloadDayRate: {
    planOnce: wilson(overDays('awareV1')),
    priceOnly: wilson(overDays('priceOnly')),
    oursUpper95: overDays('stressAware') === 0 ? 1 - 0.05 ** (1 / n) : wilson(overDays('stressAware')).hi,
    oursDays: overDays('stressAware'),
  },
};
console.error('confidence done');

// ---------- shared runs on the same days ----------
const cases = backtestDates
  .map(d => ({ d, day: days.get(d)!, act: actualLoad(days.get(d)!) }))
  .filter(c => c.day && c.act.every(x => x !== undefined))
  .map(c => {
    const prev = misses.get(
      [...misses.keys()]
        .filter(x => x < c.d)
        .sort()
        .at(-1) ?? '',
    );
    return { ...c, act: c.act as number[], prevMiss: prev ? prev[prev.length - 1] : 0 };
  });
const A = p.asset;
const eta = Math.sqrt(A.roundTripEff);
const minE = A.energyMWh * A.socMinFrac;
const startE = A.energyMWh * A.startSocFrac;
const base = (c: (typeof cases)[number]) => ({
  forecastLoad: c.day.loadMW,
  cap: c.day.capMW,
  penalty: p.overloadPenalty,
});
const overMWh = (load: number[], cap: number | number[], s?: Schedule) =>
  load.reduce(
    (acc, l, i) => acc + Math.max(0, l + (s ? s.charge[i] - s.discharge[i] : 0) - (Array.isArray(cap) ? cap[i] : cap)),
    0,
  );
const value = (lmp: number[], s: Schedule) =>
  lmp.reduce((acc, x, i) => acc + x * (s.discharge[i] - s.charge[i]), 0) -
  s.charge.concat(s.discharge).reduce((a, b) => a + b, 0) * A.cycleCostPerMWh;
const relief = (stress: number[], s: Schedule) =>
  stress.reduce((acc, x, i) => acc + (x >= p.congestedThreshold ? s.discharge[i] - s.charge[i] : 0), 0);

// ---------- 2. Utility events ----------
// Assumed event: the utility asks for full power for 2 hours starting at the day's busiest traffic
// hour. We measure how much of that the Station could deliver from what it had stored at that moment.
const EVENT_H = 2;
const request = A.powerMW * EVENT_H;
// The busiest traffic hour on the day ahead forecast: known the night before, so the planner can
// hold a reserve for it.
const eventHour = (c: (typeof cases)[number]) => {
  let tPeak = 0;
  c.day.stress.forEach((s, t) => {
    if (s > c.day.stress[tPeak]) tPeak = t;
  });
  return Math.min(tPeak, 24 - EVENT_H);
};
// Reserve: enough stored at the start of the event hour to deliver the full request.
const RESERVE_MWH = minE + request / eta;
const reserveFloor = (c: (typeof cases)[number]) => {
  const f: (number | undefined)[] = Array(24).fill(undefined);
  const t = eventHour(c);
  if (t > 0) f[t - 1] = RESERVE_MWH;
  return f;
};
const strategies: Record<string, (c: (typeof cases)[number]) => Schedule> = {
  ours: c => runReplan(A, { ...base(c), margin: 0, signal: awareSignal(c.day) }, c.act, true, c.prevMiss),
  oursWithReserve: c =>
    runReplan(
      A,
      { ...base(c), margin: 0, signal: awareSignal(c.day) },
      c.act,
      true,
      c.prevMiss,
      undefined,
      undefined,
      reserveFloor(c),
    ),
  priceOnlyWithGuard: c => runReplan(A, { ...base(c), margin: 0, signal: c.day.lmp }, c.act, true, c.prevMiss),
  priceOnly: c => dispatch(c.day.lmp, A),
  fiveLineRule: c => peakShaver(A, c.act, c.day.hourLocal, c.day.capMW),
};
const events: Record<string, { meanReadyPct: number; fullDays: number; worstPct: number }> = {};
const eventDays: { date: string; hour: number; ready: Record<string, number> }[] = [];
const schedules: Record<string, Schedule[]> = {};
for (const [name, f] of Object.entries(strategies)) schedules[name] = cases.map(f);
cases.forEach((c, i) => {
  const tPeak = eventHour(c);
  const ready: Record<string, number> = {};
  for (const name of Object.keys(strategies)) {
    const s = schedules[name][i];
    const stored = tPeak === 0 ? startE : s.soc[tPeak - 1];
    ready[name] = Math.min(request, A.powerMW * EVENT_H, Math.max(0, stored - minE) * eta) / request;
  }
  eventDays.push({ date: c.d, hour: c.day.hourLocal[tPeak], ready });
});
for (const name of Object.keys(strategies)) {
  const xs = eventDays.map(e => e.ready[name]);
  events[name] = {
    meanReadyPct: 100 * mean(xs),
    fullDays: xs.filter(x => x > 0.999).length,
    worstPct: 100 * Math.min(...xs),
  };
}
// What holding the reserve costs on ordinary days: value, jam relief and overload, ours with and without.
const sumOver = (name: string) =>
  cases.map((c, i) => overMWh(c.act, c.day.capMW, schedules[name][i])).filter(x => x > TOL).length;
const reserve = {
  reserveMWh: RESERVE_MWH,
  valuePerDay: Object.fromEntries(
    ['ours', 'oursWithReserve'].map(k => [k, mean(cases.map((c, i) => value(c.day.lmp, schedules[k][i])))]),
  ),
  jamReliefMWh: Object.fromEntries(
    ['ours', 'oursWithReserve'].map(k => [k, mean(cases.map((c, i) => relief(c.day.stress, schedules[k][i])))]),
  ),
  overloadDays: Object.fromEntries(['ours', 'oursWithReserve'].map(k => [k, sumOver(k)])),
};
console.error('events done', JSON.stringify(reserve));

// ---------- 3. Margin versus guard ----------
const QS = [0.5, 0.75, 0.9, 0.95, 0.99];
const marginAt = (d: string, q: number) =>
  marginFromMisses(
    [...misses.keys()]
      .filter(x => x < d)
      .sort()
      .slice(-14)
      .flatMap(x => misses.get(x)!),
    q,
  );
const frontier = [
  ...QS.map(q => ({ label: `margin at the ${Math.round(q * 100)}th percentile of misses`, q, guard: false })),
  { label: 'no margin, real time guard', q: 0, guard: true },
].map(({ label, q, guard }) => {
  const res = cases.map(c => {
    const margin = guard ? 0 : marginAt(c.d, q);
    const s = runReplan(A, { ...base(c), margin, signal: awareSignal(c.day) }, c.act, guard, c.prevMiss);
    return {
      over: overMWh(c.act, c.day.capMW, s),
      value: value(c.day.lmp, s),
      relief: relief(c.day.stress, s),
      margin,
    };
  });
  return {
    label,
    guard,
    meanMarginMW: mean(res.map(r => r.margin)),
    daysOver: res.filter(r => r.over > TOL).length,
    totalOverMWh: res.reduce((a, r) => a + r.over, 0),
    valuePerDay: mean(res.map(r => r.value)),
    jamReliefMWh: mean(res.map(r => r.relief)),
  };
});
console.error('frontier done');

// ---------- 4. Transformer heat ----------
// Nameplate: the same fixed rating the capacity section tests (P95 of the 30 days before the test),
// read as the load that gives a 110 C hot spot at 30 C ambient. Hourly rating = nameplate times the
// per unit load that holds 110 C at that hour's Salt Lake City air temperature (steady state).
const first = cases[0].day;
const k0 = first.loadMW[0] / first.demandHat[0];
const t0 = Date.parse(first.t[0]);
const hist = all
  .filter(h => h.demand !== undefined && Date.parse(h.t) < t0 && Date.parse(h.t) >= t0 - 30 * 864e5)
  .map(h => h.demand! * k0)
  .sort((a, b) => a - b);
const NAMEPLATE = hist[Math.floor(0.95 * hist.length)];
const ambient = (c: (typeof cases)[number]) => c.day.t.map(t => byT.get(t)?.temp ?? XFMR.refAmbientC);
const thermalCap = (c: (typeof cases)[number]) => ambient(c).map(a => NAMEPLATE * ratingPU(a));

type Mode = 'none' | 'aware' | 'shaver';
const runFor = (c: (typeof cases)[number], x: number, mode: Mode, cap: number | number[]): Schedule | undefined => {
  const act = c.act.map(l => l + x);
  if (mode === 'none') return undefined;
  if (mode === 'shaver') return peakShaver(A, act, c.day.hourLocal, cap);
  return runReplan(
    A,
    {
      forecastLoad: c.day.loadMW.map(l => l + x),
      cap,
      margin: 0,
      signal: awareSignal(c.day),
      penalty: p.overloadPenalty,
    },
    act,
    true,
    c.prevMiss,
  );
};
function scan(mode: Mode, thermal: boolean) {
  let last = -1;
  for (let x = 0; x <= 30; x += 0.25) {
    let ok = true;
    for (const c of cases) {
      const cap = thermal ? thermalCap(c) : NAMEPLATE;
      const s = runFor(c, x, mode, cap);
      if (
        overMWh(
          c.act.map(l => l + x),
          cap,
          s,
        ) > TOL
      ) {
        ok = false;
        break;
      }
    }
    if (!ok) break;
    last = x;
  }
  return Math.max(0, last);
}
// Hot spot check of the final profile with the full heat model (with the oil's inertia).
function heat(x: number, mode: Mode, thermal: boolean) {
  let maxHs = 0,
    aging = 0;
  for (const c of cases) {
    const s = runFor(c, x, mode, thermal ? thermalCap(c) : NAMEPLATE);
    const load = c.act.map((l, i) => l + x + (s ? s.charge[i] - s.discharge[i] : 0));
    const sim = simulate(load, ambient(c), NAMEPLATE);
    maxHs = Math.max(maxHs, sim.maxHotSpotC);
    aging += sim.agingHours;
  }
  return { maxHotSpotC: maxHs, agingDays: aging / 24, calendarDays: cases.length };
}
const thermalOut: Record<string, unknown> = { nameplateMW: NAMEPLATE, transformer: XFMR };
const ambs = cases.flatMap(ambient);
const caps = cases.flatMap(thermalCap);
thermalOut.ambientC = { min: Math.min(...ambs), mean: mean(ambs), max: Math.max(...ambs) };
thermalOut.ratingMW = { min: Math.min(...caps), mean: mean(caps), max: Math.max(...caps) };
// Rating when the day is at its busiest hour: what matters for new load.
const busy = cases.map(c => {
  const cap = thermalCap(c);
  let t = 0;
  c.act.forEach((l, i) => {
    if (l - cap[i] > c.act[t] - cap[t]) t = i;
  });
  return cap[t];
});
thermalOut.ratingAtTightestHourMW = { min: Math.min(...busy), mean: mean(busy) };
const results: Record<string, unknown> = {};
for (const thermal of [false, true]) {
  const key = thermal ? 'temperature' : 'fixed';
  const none = scan('none', thermal);
  const aware = scan('aware', thermal);
  const shaver = scan('shaver', thermal);
  results[key] = {
    withoutStorageMW: none,
    stationMW: aware,
    fiveLineRuleMW: shaver,
    heatAtStationMax: heat(aware, 'aware', thermal),
    heatWithoutStorageMax: heat(none, 'none', thermal),
  };
  console.error(key, none, aware, shaver);
}
thermalOut.results = results;

const lab = {
  generatedAt: new Date().toISOString(),
  days: cases.length,
  firstDay: cases[0].d,
  lastDay: cases.at(-1)!.d,
  confidence,
  events: { hours: EVENT_H, requestMWh: request, byStrategy: events, days: eventDays, reserve },
  frontier,
  thermal: thermalOut,
};
fs.writeFileSync('public/data/lab.json', `${JSON.stringify(lab, null, 1)}\n`);
console.log(
  JSON.stringify({ confidence, events, frontier, thermal: { ...thermalOut, transformer: undefined } }, null, 1),
);
