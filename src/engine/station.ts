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
  maxExcessMW: number;             // largest single minute above the limit
  max15ExcessMW: number;           // largest rolling 15 minute average above the limit
  maxRampMWPerMin: number;         // steepest minute to minute change the grid sees
  batteryChanges: number;          // minutes where battery power moves by more than 0.1 MW
  batteryExtraMWh: number;         // battery energy beyond its hourly plan (grid side)
  flywheelThroughputMWh: number;
  grid: number[];
}

// mode 'hourly': battery holds its hourly setpoint, nothing reacts inside the hour.
// mode 'battery': battery also chases every spike above the limit, within its power limit and
//   the energy it actually has left (minStoredMWh is the lowest planned stored energy per hour).
// mode 'station': the flywheel covers spikes first and recharges in headroom; the battery holds
//   its hourly setpoint and only steps in if the flywheel runs out.
export function runMinutes(baseHourly: number[], dc: number[], setpointHourly: number[], cap: number, battery: { powerMW: number; minStoredMWh: number[]; floorMWh: number; eff: number },
  mode: 'hourly' | 'battery' | 'station', spin?: Spin, batteryBackup = true): MinuteResult {
  const eta = spin ? Math.sqrt(spin.roundTripEff) : 1;
  const etaB = Math.sqrt(battery.eff);
  let e = spin ? spin.energyMWh : 0; // flywheel starts full
  let prevB = setpointHourly[0];
  let extraStored = 0;               // battery side energy drawn beyond plan so far today
  const res: MinuteResult = { overloadMinutes: 0, overloadMWh: 0, maxExcessMW: 0, max15ExcessMW: 0, maxRampMWPerMin: 0, batteryChanges: 0, batteryExtraMWh: 0, flywheelThroughputMWh: 0, grid: [] };
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
      const room = Math.max(0, battery.minStoredMWh[h] - battery.floorMWh - extraStored) * etaB * 60; // MW for one minute
      const nb = Math.max(-battery.powerMW, b - Math.min(over, room));
      res.batteryExtraMWh += (b - nb) / 60;
      extraStored += (b - nb) / etaB / 60;
      over -= b - nb; b = nb;
    } else if ((mode === 'battery' || mode === 'station') && extraStored > 1e-9 && over < -1e-9) {
      // Same fairness rule as the flywheel: refill the extra energy in the dips, within headroom.
      const c = Math.min(-over, battery.powerMW - b, (extraStored / etaB) * 60);
      const add = Math.max(0, c);
      res.batteryExtraMWh += add / 60;
      extraStored -= (add * etaB) / 60;
      over += add; b += add;
    }
    if (Math.abs(b - prevB) > 0.1) res.batteryChanges++;
    prevB = b;
    if (over > 1e-6) { res.overloadMinutes++; res.overloadMWh += over / 60; res.maxExcessMW = Math.max(res.maxExcessMW, over); }
    res.flywheelThroughputMWh += Math.abs(f) / 60;
    const g = load + b + f;
    if (res.grid.length) res.maxRampMWPerMin = Math.max(res.maxRampMWPerMin, Math.abs(g - res.grid[res.grid.length - 1]));
    res.grid.push(g);
  }
  let roll = 0;
  for (let m = 0; m < res.grid.length; m++) {
    roll += res.grid[m] - (m >= 15 ? res.grid[m - 15] : 0);
    if (m >= 14) res.max15ExcessMW = Math.max(res.max15ExcessMW, roll / 15 - cap);
  }
  return res;
}
