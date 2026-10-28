// Lab: inside the hour, second by second, on real AI training power.
// The year capacity study (lab-capacity-year.ts) found that a substation rated exactly for its annual
// peak can take X MW of new always on load with a 10 MW, 4 h Station, planned hour by hour on issued
// forecasts. That plan only sees hourly averages. Here the new load is real GPU training power from
// the MIT Supercloud Dataset at 1 s, each hour rescaled to average exactly X, and we ask what the
// substation sees inside the hour: how many seconds over the rating, and what it takes to cover them.
// Two cases: one synchronized training run filling the whole site (worst case), and 16 independent
// jobs sharing it. Usage: tsx scripts/lab-seconds.ts <traceDir> (from scripts/lab-gpu/gpu-traces.py).
// Writes public/data/lab-seconds.json (aggregates only; the traces are never saved).
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { runReplan } from '../src/engine/execute.js';
import { loadHours } from '../src/engine/merge.js';
import { PARAMS as p } from '../src/engine/params.js';
import { addResult, blockMean, emptyResult, runSteps, type StepResult, swingHours } from '../src/engine/seconds.js';
import { rng } from '../src/engine/station.js';
import { buildDay } from '../src/engine/stress.js';
import { localDate } from '../src/engine/time.js';
import type { DayInputs, Hour, Params } from '../src/engine/types.js';

const TRACES = process.argv[2] ?? '/tmp/gpu-1s';
const S = 3600;

// ---------- the year cases, built exactly as in lab-capacity-year.ts ----------
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
const maxDemand = Math.max(...all.filter(h => h.demand !== undefined).map(h => h.demand!));
const K = p.substationPeakMW / maxDemand;
const RATING = p.substationPeakMW;

interface Case {
  date: string;
  fc: number[];
  act: number[];
  signal: number[];
  prevMiss: number;
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
  cases.push({ date: d, fc, act, signal: day.lmp.map((x, i) => x + p.stressPremium * day.stress[i]), prevMiss });
  prevMiss = act[23] - fc[23];
}

const capYear = JSON.parse(fs.readFileSync('public/data/lab-capacity-year.json', 'utf8'));
const A = p.asset;
const X: number = capYear.stations.find((s: any) => s.label === '10 MW, 4 h').ours.mw;
console.error(`${cases.length} days, new load ${X} MW, rating ${RATING} MW`);

// ---------- real GPU power, 1 s, normalized to each job's peak ----------
const index: { file: string; model: string; gpus: number; seconds: number }[] = JSON.parse(
  fs.readFileSync(`${TRACES}/index.json`, 'utf8'),
);
const jobs = index.map(j => {
  const b = fs.readFileSync(`${TRACES}/${j.file}`);
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
});
// A stream of training power: random jobs from random start points, at most 2 hours from one
// stretch, so a day mixes several jobs as a real site's schedule would.
function stream(seed: number) {
  const r = rng(seed);
  return (n: number) => {
    const out = new Float64Array(n);
    let i = 0;
    while (i < n) {
      const j = jobs[Math.floor(r() * jobs.length)];
      const len = Math.min(n - i, 7200, j.length);
      const o = Math.floor(r() * (j.length - len + 1));
      for (let k = 0; k < len; k++) out[i + k] = j[o + k];
      i += len;
    }
    return out;
  };
}
// Site full power: real jobs average about 90% of their peak (gpu-stats.json), so a site averaging
// X MW over the hour has a full power of X / 0.9. Swings are sized against that.
const gpuStats = JSON.parse(fs.readFileSync('lab-data/gpu-stats.json', 'utf8'));
const MEAN_OF_PEAK: number = gpuStats.acrossJobsMedian.meanOfPeak;
const FLEET = 16;
const sync = stream(42);
const fleet = Array.from({ length: FLEET }, (_, k) => stream(100 + k));

// ---------- runs ----------
const SPIN_MIN = 6;
const SPIN_EFF = 0.9;
const spinOf = (mw: number) => ({ powerMW: mw, energyMWh: (mw * SPIN_MIN) / 60, roundTripEff: SPIN_EFF });
const SIZES = [0.25, 0.5, 1, 1.5, 2, 3, 4];
type Agg = Record<string, StepResult>;
const names = [
  'hourly',
  'hourlyBusy',
  'hourlyMinuteView',
  'battery',
  ...SIZES.flatMap(s => [`station${s}`, `spinAlone${s}`]),
  'station3MinuteView',
];
const fresh = (): Agg => Object.fromEntries(names.map(n => [n, emptyResult()]));
const agg = { sync: fresh(), fleet: fresh() };
const overDays = { sync: [] as { date: string; seconds: number }[], fleet: [] as { date: string; seconds: number }[] };
const shape = {
  sync: { secStep: [] as number[], range: [] as number[] },
  fleet: { secStep: [] as number[], range: [] as number[] },
};

const t0 = Date.now();
for (const c of cases) {
  const act = c.act.map(l => l + X);
  const plan = runReplan(
    A,
    { forecastLoad: c.fc.map(l => l + X), cap: RATING, margin: 0, signal: c.signal, penalty: p.overloadPenalty },
    act,
    true,
    c.prevMiss,
  );
  const startSoc = A.energyMWh * A.startSocFrac;
  const bat = {
    powerMW: A.powerMW,
    floorMWh: A.energyMWh * A.socMinFrac,
    eff: A.roundTripEff,
    minStoredMWh: plan.soc.map((x, t) => Math.min(x, t ? plan.soc[t - 1] : startSoc)),
  };
  const sp = plan.charge.map((ch, t) => ch - plan.discharge[t]);
  const raw = {
    sync: sync(24 * S),
    fleet: (() => {
      const tot = new Float64Array(24 * S);
      for (const f of fleet) {
        const x = f(24 * S);
        for (let i = 0; i < tot.length; i++) tot[i] += x[i] / FLEET;
      }
      return tot;
    })(),
  };
  for (const k of ['sync', 'fleet'] as const) {
    const dc = swingHours(raw[k], S, X, X / MEAN_OF_PEAK);
    // Shape check against the published statistics: second steps and within minute range, as a
    // share of the hour's average new load (sampled every 7th day to keep it light).
    if (cases.indexOf(c) % 7 === 0) {
      for (let i = 1; i < dc.length; i += 13) shape[k].secStep.push(Math.abs(dc[i] - dc[i - 1]) / X);
      for (let m = 0; m < 24 * 60; m += 3) {
        let lo = Infinity,
          hi = -Infinity;
        for (let i = m * 60; i < m * 60 + 60; i++) {
          if (dc[i] < lo) lo = dc[i];
          if (dc[i] > hi) hi = dc[i];
        }
        shape[k].range.push((hi - lo) / X);
      }
    }
    const a = agg[k];
    const h = runSteps(c.act, dc, S, sp, RATING, bat, 'hourly');
    addResult(a.hourly, h);
    if (h.overSteps) overDays[k].push({ date: c.date, seconds: h.overSteps });
    const dcMin = blockMean(dc, 60);
    addResult(a.hourlyMinuteView, runSteps(c.act, dcMin, 60, sp, RATING, bat, 'hourly'));
    addResult(a.station3MinuteView, runSteps(c.act, dcMin, 60, sp, RATING, bat, 'station', spinOf(3)));
    // Days with no second over the rating need nothing covered: the modes below are compared on the
    // busy days only (the days where something has to react inside the hour).
    if (!h.overSteps) continue;
    addResult(a.hourlyBusy, h);
    addResult(a.battery, runSteps(c.act, dc, S, sp, RATING, bat, 'battery'));
    for (const s of SIZES) {
      addResult(a[`station${s}`], runSteps(c.act, dc, S, sp, RATING, bat, 'station', spinOf(s)));
      addResult(a[`spinAlone${s}`], runSteps(c.act, dc, S, sp, RATING, bat, 'station', spinOf(s), false));
    }
  }
}
console.error(`runs ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const q = (x: number[], pr: number) => {
  const s = [...x].sort((u, v) => u - v);
  return s[Math.min(s.length - 1, Math.floor(pr * s.length))];
};
const n = cases.length;
const summarize = (k: 'sync' | 'fleet') => {
  const a = agg[k];
  const row = (name: string) => ({
    overSeconds: a[name].overSteps * (name.endsWith('MinuteView') ? 60 : 1),
    overMWh: +a[name].overMWh.toFixed(4),
    maxExcessMW: +a[name].maxExcessMW.toFixed(3),
    batteryExtraMWh: +a[name].batteryExtraMWh.toFixed(3),
    flywheelMaxMW: +a[name].flywheelMaxMW.toFixed(3),
  });
  const busyDays = overDays[k].length;
  return {
    daysWithSecondsOver: busyDays,
    worstDays: [...overDays[k]].sort((u, v) => v.seconds - u.seconds).slice(0, 5),
    hourly: row('hourly'),
    hourlyMinuteView: row('hourlyMinuteView'),
    battery: {
      ...row('battery'),
      batteryChangesPerBusyDay: busyDays ? a.battery.batteryChanges / busyDays : 0,
    },
    hourlyBatteryChangesPerBusyDay: busyDays ? a.hourlyBusy.batteryChanges / busyDays : 0,
    station3MinuteView: row('station3MinuteView'),
    sweep: SIZES.map(s => ({
      spinMW: s,
      spinMWh: spinOf(s).energyMWh,
      withBatteryBackup: row(`station${s}`),
      batteryChangesPerBusyDay: busyDays ? a[`station${s}`].batteryChanges / busyDays : 0,
      flywheelAlone: row(`spinAlone${s}`),
      flywheelCyclesPerBusyDay: busyDays
        ? a[`spinAlone${s}`].flywheelThroughputMWh / 2 / spinOf(s).energyMWh / busyDays
        : 0,
    })),
    shape: {
      secondStepP95OfAvg: +q(shape[k].secStep, 0.95).toFixed(4),
      secondStepMaxOfAvg: +shape[k].secStep.reduce((m, v) => (v > m ? v : m), 0).toFixed(4),
      // as MW per second for this site: the fastest swing the substation sees from the new load
      secondStepMaxMW: +(shape[k].secStep.reduce((m, v) => (v > m ? v : m), 0) * X).toFixed(3),
      withinMinuteRangeP50OfAvg: +q(shape[k].range, 0.5).toFixed(4),
      withinMinuteRangeP95OfAvg: +q(shape[k].range, 0.95).toFixed(4),
    },
  };
};
const out = {
  generatedAt: new Date().toISOString(),
  source:
    'GPU power: MIT Supercloud Dataset (Samsi et al., IEEE HPEC 2021), nvidia-smi at 100 ms averaged to 1 s, CC BY-NC-ND 4.0, used only inside the run; aggregates only. Grid: EIA, CAISO, Open-Meteo issued forecasts.',
  days: n,
  first: cases[0].date,
  last: cases.at(-1)!.date,
  ratingMW: RATING,
  newLoadMW: X,
  siteFullPowerMW: +(X / MEAN_OF_PEAK).toFixed(2),
  station: `${A.powerMW} MW, ${A.energyMWh / A.powerMW} h`,
  spinMinutes: SPIN_MIN,
  spinEff: SPIN_EFF,
  jobs: index.length,
  jobSeconds: index.reduce((s, j) => s + j.seconds, 0),
  models: [...new Set(index.map(j => j.model))].sort(),
  fleetJobs: FLEET,
  sync: summarize('sync'),
  fleet: summarize('fleet'),
};
fs.writeFileSync('public/data/lab-seconds.json', `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify(out, null, 1));
