// Inside the hour: run the 30 backtest days at 1 minute resolution with a simulated AI data
// center added at the capacity unlocked level. Writes public/data/station.json.
import fs from 'node:fs';
import { runReplan } from '../src/engine/execute.js';
import { dataCenterMinutes, runMinutes } from '../src/engine/station.js';
import { p, backtestDates, days, actualLoad, aware, misses } from './common.js';

const cap = JSON.parse(fs.readFileSync('public/data/capacity.json', 'utf8'));
const X: number = cap.limits.moving.stations.find(
  (s: any) => s.powerMW === p.asset.powerMW && s.energyMWh === p.asset.energyMWh,
).awareMW;
const SPIN_EFF = 0.9; // assumed round trip efficiency for the flywheel
const SPIN_MIN = 6; // Torus Spin: full discharge in about 6 minutes (company claim)
const spinOf = (mw: number) => ({ powerMW: mw, energyMWh: (mw * SPIN_MIN) / 60, roundTripEff: SPIN_EFF });
const SIZES = [0.5, 1, 1.5, 2, 3, 4];
const MAIN_SPIN = 3; // smallest size that leaves the battery close to its hourly plan

const cases = backtestDates
  .map((d, i) => ({ d, i, day: days.get(d)!, act: actualLoad(days.get(d)!) }))
  .filter(c => c.day && c.act.every(x => x !== undefined));
type Agg = {
  overloadMinutes: number;
  overloadMWh: number;
  batteryChanges: number;
  batteryExtraMWh: number;
  flywheelThroughputMWh: number;
  maxExcessMW: number;
  max15ExcessMW: number;
  maxRampMWPerMin: number;
};
const zero = (): Agg => ({
  overloadMinutes: 0,
  overloadMWh: 0,
  batteryChanges: 0,
  batteryExtraMWh: 0,
  flywheelThroughputMWh: 0,
  maxExcessMW: 0,
  max15ExcessMW: -1e9,
  maxRampMWPerMin: 0,
});
const MAXK = new Set(['maxExcessMW', 'max15ExcessMW', 'maxRampMWPerMin']);
const add = (a: Agg, r: Agg) => {
  for (const k of Object.keys(a) as (keyof Agg)[]) a[k] = MAXK.has(k) ? Math.max(a[k], r[k]) : a[k] + r[k];
};
const agg = { hourly: zero(), battery: zero(), station: zero() };
let stationAlone = 0;
const sweep = Object.fromEntries(SIZES.map(s => [s, zero()]));
const sweepAlone = Object.fromEntries(SIZES.map(s => [s, zero()]));
let worst: any = {
  d: '',
  minutes: -1,
  hour: 0,
  base: [] as number[],
  dc: [] as number[],
  sp: [] as number[],
  capMW: 0,
};
let maxRamp = 0;

for (const c of cases) {
  const base = c.act as number[];
  const hourlyLoad = base.map(l => l + X);
  const prev = misses.get(
    [...misses.keys()]
      .filter(x => x < c.d)
      .sort()
      .at(-1) ?? '',
  );
  // Hourly layer: causal replanning plus the real time guard on the hourly average. The minute
  // layer below asks what happens inside each hour.
  const plan = runReplan(
    p.asset,
    {
      forecastLoad: c.day.loadMW.map(l => l + X),
      cap: c.day.capMW,
      margin: 0,
      ...aware(c.day),
      penalty: p.overloadPenalty,
    },
    hourlyLoad,
    true,
    prev ? prev[prev.length - 1] : 0,
  );
  const startSoc = p.asset.energyMWh * p.asset.startSocFrac;
  const bat = {
    powerMW: p.asset.powerMW,
    floorMWh: p.asset.energyMWh * p.asset.socMinFrac,
    eff: p.asset.roundTripEff,
    minStoredMWh: plan.soc.map((x, t) => Math.min(x, t ? plan.soc[t - 1] : startSoc)),
  };
  const sp = plan.charge.map((ch, t) => ch - plan.discharge[t]);
  const dc = dataCenterMinutes(X, 1000 + c.i);
  for (let m = 1; m < dc.length; m++) maxRamp = Math.max(maxRamp, Math.abs(dc[m] - dc[m - 1]));
  const h = runMinutes(base, dc, sp, c.day.capMW, bat, 'hourly');
  add(agg.hourly, h);
  add(agg.battery, runMinutes(base, dc, sp, c.day.capMW, bat, 'battery'));
  add(agg.station, runMinutes(base, dc, sp, c.day.capMW, bat, 'station', spinOf(MAIN_SPIN)));
  stationAlone += runMinutes(base, dc, sp, c.day.capMW, bat, 'station', spinOf(MAIN_SPIN), false).overloadMinutes;
  for (const s of SIZES) {
    add(sweep[s], runMinutes(base, dc, sp, c.day.capMW, bat, 'station', spinOf(s)));
    add(sweepAlone[s], runMinutes(base, dc, sp, c.day.capMW, bat, 'station', spinOf(s), false));
  }
  if (h.overloadMinutes > worst.minutes) {
    // busiest hour of overload minutes on the worst day
    const perHour = Array.from(
      { length: 24 },
      (_, k) => h.grid.slice(k * 60, k * 60 + 60).filter(g => g > c.day.capMW + 1e-6).length,
    );
    const pair = perHour.slice(0, 23).map((v, k) => v + perHour[k + 1]);
    const hour = pair.indexOf(Math.max(...pair));
    worst = { d: c.d, minutes: h.overloadMinutes, hour, base, dc, sp, capMW: c.day.capMW, bat };
  }
}

// Example window: two hours around the worst hour of the worst day, all three modes.
const w0 = Math.max(0, worst.hour - 0) * 60,
  w1 = Math.min(24 * 60, w0 + 120);
const ex = (mode: 'hourly' | 'battery' | 'station') =>
  runMinutes(worst.base, worst.dc, worst.sp, worst.capMW, worst.bat, mode, spinOf(MAIN_SPIN))
    .grid.slice(w0, w1)
    .map(x => +x.toFixed(3));
const n = cases.length;
const out = {
  days: n,
  dataCenterMW: X,
  spinMinutes: SPIN_MIN,
  spinEff: SPIN_EFF,
  mainSpinMW: MAIN_SPIN,
  maxDataCenterRampMWPerMin: maxRamp,
  totals: agg,
  limitTypicalMW: cases.reduce((s2, c) => s2 + c.day.capMW, 0) / n,
  wearCostPerMWh: p.asset.cycleCostPerMWh,
  batteryBackupMinutes: stationAlone,
  perDay: Object.fromEntries(
    Object.entries(agg).map(([k, a]) => [
      k,
      {
        batteryChanges: a.batteryChanges / n,
        flywheelCycles: a.flywheelThroughputMWh / 2 / spinOf(MAIN_SPIN).energyMWh / n,
      },
    ]),
  ),
  sweep: SIZES.map(s => ({
    spinMW: s,
    spinMWh: spinOf(s).energyMWh,
    overloadMinutes: sweep[s].overloadMinutes,
    overloadMinutesFlywheelAlone: sweepAlone[s].overloadMinutes,
    batteryChangesPerDay: sweep[s].batteryChanges / n,
    batteryChanges: sweep[s].batteryChanges,
    flywheelCyclesPerDay: sweep[s].flywheelThroughputMWh / 2 / spinOf(s).energyMWh / n,
  })),
  example: {
    date: worst.d,
    startHour: worst.hour,
    capMW: worst.capMW,
    hourly: ex('hourly'),
    battery: ex('battery'),
    station: ex('station'),
  },
};
fs.writeFileSync('public/data/station.json', `${JSON.stringify(out)}\n`);
console.log(JSON.stringify({ ...out, example: { date: out.example.date, startHour: out.example.startHour } }, null, 1));
