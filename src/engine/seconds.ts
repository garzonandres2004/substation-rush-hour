// Lab: the inside the hour Station model at any time step, down to 1 second.
// Same rules as runMinutes in station.ts (which the main page uses and is left untouched):
// the battery holds its hourly setpoint; in 'battery' mode it also chases every spike; in 'station'
// mode the flywheel covers spikes first and recharges in headroom, with the battery as backup.
// Differences: any number of steps per hour, and only running statistics are kept (no grid array),
// so a full year at 1 s fits in memory.
import type { Spin } from './station.js';

export interface StepBattery {
  powerMW: number;
  minStoredMWh: number[]; // lowest planned stored energy in each hour
  floorMWh: number;
  eff: number;
}

export interface StepResult {
  steps: number;
  overSteps: number;
  overMWh: number;
  maxExcessMW: number;
  batteryChanges: number; // steps where battery power moves by more than 0.1 MW
  batteryExtraMWh: number;
  flywheelThroughputMWh: number;
  flywheelMaxMW: number;
  maxRampMW: number; // largest step to step change the grid sees
}

export const emptyResult = (): StepResult => ({
  steps: 0,
  overSteps: 0,
  overMWh: 0,
  maxExcessMW: 0,
  batteryChanges: 0,
  batteryExtraMWh: 0,
  flywheelThroughputMWh: 0,
  flywheelMaxMW: 0,
  maxRampMW: 0,
});

const MAX_KEYS: (keyof StepResult)[] = ['maxExcessMW', 'flywheelMaxMW', 'maxRampMW'];
export function addResult(a: StepResult, r: StepResult) {
  for (const k of Object.keys(a) as (keyof StepResult)[])
    a[k] = MAX_KEYS.includes(k) ? Math.max(a[k], r[k]) : a[k] + r[k];
}

// baseHourly: substation load without the new load, MW per hour. dc: the new load per step (MW).
// setpointHourly: battery plan per hour, positive = charging. stepsPerHour: 60 = minutes, 3600 = seconds.
export function runSteps(
  baseHourly: number[],
  dc: ArrayLike<number>,
  stepsPerHour: number,
  setpointHourly: number[],
  cap: number,
  battery: StepBattery,
  mode: 'hourly' | 'battery' | 'station',
  spin?: Spin,
  batteryBackup = true,
): StepResult {
  const dt = 1 / stepsPerHour; // hours per step
  const eta = spin ? Math.sqrt(spin.roundTripEff) : 1;
  const etaB = Math.sqrt(battery.eff);
  let e = spin ? spin.energyMWh : 0; // flywheel starts full
  let prevB = setpointHourly[0];
  let prevG = Number.NaN;
  let extraStored = 0;
  const res = emptyResult();
  for (let m = 0; m < dc.length; m++) {
    const h = Math.floor(m / stepsPerHour);
    const load = baseHourly[h] + dc[m];
    let b = setpointHourly[h];
    let f = 0;
    let over = load + b - cap;
    if (mode === 'station' && spin) {
      if (over > 0) {
        const d = Math.min(over, spin.powerMW, (e * eta) / dt);
        f = -d;
        e -= (d / eta) * dt;
        over -= d;
      } else {
        const c = Math.min(-over, spin.powerMW, (spin.energyMWh - e) / eta / dt);
        f = c;
        e += c * eta * dt;
        over += c;
      }
    }
    if ((mode === 'battery' || (mode === 'station' && batteryBackup)) && over > 1e-9) {
      const room = (Math.max(0, battery.minStoredMWh[h] - battery.floorMWh - extraStored) * etaB) / dt;
      const nb = Math.max(-battery.powerMW, b - Math.min(over, room));
      res.batteryExtraMWh += (b - nb) * dt;
      extraStored += ((b - nb) / etaB) * dt;
      over -= b - nb;
      b = nb;
    } else if ((mode === 'battery' || mode === 'station') && extraStored > 1e-9 && over < -1e-9) {
      const c = Math.min(-over, battery.powerMW - b, extraStored / etaB / dt);
      const add = Math.max(0, c);
      res.batteryExtraMWh += add * dt;
      extraStored -= add * etaB * dt;
      over += add;
      b += add;
    }
    if (Math.abs(b - prevB) > 0.1) res.batteryChanges++;
    prevB = b;
    if (over > 1e-6) {
      res.overSteps++;
      res.overMWh += over * dt;
      if (over > res.maxExcessMW) res.maxExcessMW = over;
    }
    const af = Math.abs(f);
    res.flywheelThroughputMWh += af * dt;
    if (af > res.flywheelMaxMW) res.flywheelMaxMW = af;
    const g = load + b + f;
    if (!Number.isNaN(prevG)) {
      const r = Math.abs(g - prevG);
      if (r > res.maxRampMW) res.maxRampMW = r;
    }
    prevG = g;
  }
  res.steps = dc.length;
  return res;
}

// Rescale each hour of a step series so its average is exactly avgMW, keeping its shape.
// This keeps the hourly planner's view (a constant new load per hour) and the step view consistent.
export function scaleHours(x: Float64Array, stepsPerHour: number, avgMW: number) {
  const out = new Float64Array(x.length);
  for (let h = 0; h * stepsPerHour < x.length; h++) {
    const a = h * stepsPerHour;
    const b = Math.min(x.length, a + stepsPerHour);
    let s = 0;
    for (let i = a; i < b; i++) s += x[i];
    const k = s > 0 ? (avgMW * (b - a)) / s : 0;
    for (let i = a; i < b; i++) out[i] = x[i] * k;
  }
  return out;
}

// Keep each hour's average at exactly avgMW, but size the swings around it by the site's full power:
// out = avgMW + (x - hour mean of x) * nameplateMW, floored at 0. x is power as a share of peak.
// Unlike scaleHours, a quiet hour in the trace is not blown up: swings keep their real size.
export function swingHours(x: Float64Array, stepsPerHour: number, avgMW: number, nameplateMW: number) {
  const out = new Float64Array(x.length);
  for (let h = 0; h * stepsPerHour < x.length; h++) {
    const a = h * stepsPerHour;
    const b = Math.min(x.length, a + stepsPerHour);
    let s = 0;
    for (let i = a; i < b; i++) s += x[i];
    const m = s / (b - a);
    for (let i = a; i < b; i++) out[i] = Math.max(0, avgMW + (x[i] - m) * nameplateMW);
  }
  return out;
}

// Average consecutive blocks: seconds to minutes with n = 60.
export function blockMean(x: ArrayLike<number>, n: number) {
  const out = new Float64Array(Math.floor(x.length / n));
  for (let j = 0; j < out.length; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += x[j * n + i];
    out[j] = s / n;
  }
  return out;
}
