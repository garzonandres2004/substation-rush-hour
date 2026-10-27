// Inside the hour: a minute level model of a Torus style Station (flywheel + battery).
// The hourly planner sets the battery's power for each hour. Inside the hour, load moves
// minute by minute. This module asks who covers those fast swings.

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// SIMULATED AI data center load, 1 minute steps. Shape: compute bursts near full power,
// short synchronization dips, and a checkpoint drop about every 30 minutes, plus noise.
// Each hour is rescaled so its average is exactly `avgMW`, so it matches the hourly model.
export function dataCenterMinutes(avgMW: number, seed: number, hours = 24): number[] {
  const r = rng(seed);
  const out: number[] = [];
  let phase = 0, left = 0, level = 1;
  for (let m = 0; m < hours * 60; m++) {
    if (left <= 0) {
      if (m % 30 === 0 && r() < 0.8) { level = 0.3 + 0.1 * r(); left = 2; }       // checkpoint save
      else if (phase === 0) { level = 0.5 + 0.1 * r(); left = 1 + Math.floor(2 * r()); phase = 1; } // sync dip
      else { level = 0.95 + 0.05 * r(); left = 2 + Math.floor(5 * r()); phase = 0; }               // compute burst
    }
    out.push(level * (1 + 0.02 * (r() - 0.5)));
    left--;
  }
  for (let h = 0; h < hours; h++) {
    const seg = out.slice(h * 60, h * 60 + 60);
    const mean = seg.reduce((a, b) => a + b, 0) / 60;
    for (let i = 0; i < 60; i++) out[h * 60 + i] = (seg[i] / mean) * avgMW;
  }
  return out;
}

export interface Spin { powerMW: number; energyMWh: number; roundTripEff: number }

export interface MinuteResult {
  overloadMinutes: number; overloadMWh: number;
  batteryChanges: number;          // minutes where battery power moves by more than 0.1 MW
  batteryExtraMWh: number;         // battery energy beyond its hourly plan
  flywheelThroughputMWh: number;
  grid: number[];
}

// mode 'hourly': battery holds its hourly setpoint, nothing reacts inside the hour.
// mode 'battery': battery also chases every spike above the limit (within its power limit).
// mode 'station': the flywheel covers spikes first and recharges in headroom; the battery
// holds its hourly setpoint and only steps in if the flywheel runs out.
export function runMinutes(baseHourly: number[], dc: number[], setpointHourly: number[], cap: number, batteryPowerMW: number,
  mode: 'hourly' | 'battery' | 'station', spin?: Spin, batteryBackup = true): MinuteResult {
  const eta = spin ? Math.sqrt(spin.roundTripEff) : 1;
  let e = spin ? spin.energyMWh : 0; // flywheel starts full
  let prevB = setpointHourly[0];
  const res: MinuteResult = { overloadMinutes: 0, overloadMWh: 0, batteryChanges: 0, batteryExtraMWh: 0, flywheelThroughputMWh: 0, grid: [] };
  for (let m = 0; m < dc.length; m++) {
    const h = Math.floor(m / 60);
    const load = baseHourly[h] + dc[m];
    let b = setpointHourly[h];       // battery, positive = charging (grid side)
    let f = 0;                       // flywheel, positive = charging (grid side)
    let over = load + b - cap;
    if (mode === 'station' && spin) {
      if (over > 0) {
        const d = Math.min(over, spin.powerMW, (e * eta) * 60);
        f = -d; e -= d / eta / 60; over -= d;
      } else {
        const c = Math.min(-over, spin.powerMW, ((spin.energyMWh - e) / eta) * 60);
        f = c; e += (c * eta) / 60; over += c;
      }
    }
    if ((mode === 'battery' || (mode === 'station' && batteryBackup)) && over > 1e-9) {
      const nb = Math.max(-batteryPowerMW, b - over);
      res.batteryExtraMWh += (b - nb) / 60;
      over -= b - nb; b = nb;
    }
    if (Math.abs(b - prevB) > 0.1) res.batteryChanges++;
    prevB = b;
    if (over > 1e-6) { res.overloadMinutes++; res.overloadMWh += over / 60; }
    res.flywheelThroughputMWh += Math.abs(f) / 60;
    res.grid.push(load + b + f);
  }
  return res;
}
