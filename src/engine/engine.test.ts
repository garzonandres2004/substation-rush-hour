import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, naiveSchedule } from './dispatch.js';
import { PARAMS } from './params.js';
import { score } from './score.js';
import type { DayInputs, Schedule } from './types.js';
import { co2DeltaT, intensity } from './carbon.js';

const a = PARAMS.asset;
const eta = Math.sqrt(a.roundTripEff);
const hours = Array.from({ length: 24 }, (_, i) => i);

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function fakeDay(lmp: number[], load: number[], cap: number): DayInputs {
  return {
    date: 'test',
    hourLocal: hours,
    t: hours.map(String),
    lmp,
    mcc: lmp.map(() => 0),
    mce: lmp,
    demandHat: load,
    solarHat: lmp.map(() => 0),
    windHat: lmp.map(() => 0),
    netLoadHat: load,
    loadMW: load,
    capMW: cap,
    stress: lmp.map(x => Math.min(1, x / 60)),
    comps: { demand: [], netLoad: [], ramp: [], price: [] },
  };
}

test('schedule respects SoC bounds, power limit, no simultaneous charge and discharge (random prices)', () => {
  const r = rng(7);
  for (let k = 0; k < 20; k++) {
    const lmp = hours.map(() => 10 + 60 * r());
    const s = dispatch(lmp, a);
    const sc = score(
      fakeDay(
        lmp,
        hours.map(() => 50),
        100,
      ),
      s,
      PARAMS,
    );
    assert.ok(Object.values(sc.checks).every(Boolean), JSON.stringify(sc.checks));
  }
});

test('energy balance: starts and ends at the same SoC, discharge equals round trip efficiency times charge', () => {
  const r = rng(11);
  const lmp = hours.map(() => 10 + 60 * r());
  const s = dispatch(lmp, a);
  const c = s.charge.reduce((x, y) => x + y, 0),
    d = s.discharge.reduce((x, y) => x + y, 0);
  assert.ok(Math.abs(s.soc[23] - a.energyMWh * a.startSocFrac) < 1e-9);
  assert.ok(Math.abs(d - a.roundTripEff * c) < 1e-6);
  assert.ok(Math.abs(eta * eta - a.roundTripEff) < 1e-12);
});

test('flat price means no cycling (no free lunch)', () => {
  const s = dispatch(
    hours.map(() => 30),
    a,
  );
  assert.equal(
    s.charge.reduce((x, y) => x + y, 0),
    0,
  );
  assert.equal(
    s.discharge.reduce((x, y) => x + y, 0),
    0,
  );
});

test('deterministic: same inputs give the same schedule', () => {
  const lmp = hours.map(i => 20 + 30 * Math.sin(i / 3));
  assert.deepEqual(dispatch(lmp, a), dispatch(lmp, a));
});

test('baseline is feasible and returns to start SoC', () => {
  const s = naiveSchedule(a, hours);
  const sc = score(
    fakeDay(
      hours.map(() => 30),
      hours.map(() => 50),
      100,
    ),
    s,
    PARAMS,
  );
  assert.ok(Object.values(sc.checks).every(Boolean), JSON.stringify(sc.checks));
});

test('capacity aware dispatch does not create overload where price only dispatch does', () => {
  const lmp = hours.map(i => (i >= 10 && i <= 16 ? 15 : 45));
  const load = hours.map(i => (i >= 10 && i <= 16 ? 78 : 60));
  const cap = 80;
  const price = dispatch(lmp, a);
  const aware = dispatch(lmp, a, { load, cap, penalty: PARAMS.overloadPenalty });
  const day = fakeDay(lmp, load, cap);
  const sp = score(day, price, PARAMS),
    sa = score(day, aware, PARAMS);
  assert.ok(sp.overloadAfterMWh > 0);
  assert.equal(sa.overloadAfterMWh, 0);
});

test('storage clears an existing overload without extra energy being invented', () => {
  const lmp = hours.map(i => (i >= 17 && i <= 20 ? 60 : 20));
  const load = hours.map(i => (i >= 17 && i <= 20 ? 90 : 60));
  const day = fakeDay(lmp, load, 85);
  const aware = dispatch(
    lmp.map(x => x + 10),
    a,
    { load, cap: 85, penalty: PARAMS.overloadPenalty },
  );
  const sc = score(day, aware, PARAMS);
  assert.ok(sc.overloadBeforeMWh > 0);
  assert.ok(sc.overloadAfterMWh < sc.overloadBeforeMWh);
  const s: Schedule = aware;
  const delivered = s.discharge.reduce((x, y) => x + y, 0);
  const bought = s.charge.reduce((x, y) => x + y, 0);
  assert.ok(delivered <= bought * a.roundTripEff + 1e-6);
});

test('carbon: charging in clean hours and discharging in dirty hours avoids CO2, and intensity uses EIA rates', () => {
  assert.ok(co2DeltaT([400, 800], [10, 0], [0, 10]) < 0);
  assert.equal(co2DeltaT([500, 500], [0, 0], [0, 0]), 0);
  const k = intensity({ t: 'x', coal: 50, gas: 50, genTotal: 100 })!;
  assert.ok(Math.abs(k - ((2.31 + 0.96) / 2) * 453.592) < 1e-6);
});

test('replanning is causal and the guard holds the limit when power and energy allow', async () => {
  const { runReplan } = await import('./execute.js');
  const r = rng(5);
  const lmp = hours.map(() => 10 + 60 * r());
  const load = hours.map(h => 60 + 15 * Math.sin((h - 9) / 3));
  const run = { signal: lmp, forecastLoad: load, cap: 72, penalty: PARAMS.overloadPenalty, margin: 0 };
  const plan = dispatch(lmp, a, { load, cap: 72, penalty: PARAMS.overloadPenalty });
  const same = runReplan(a, run, load, false);
  assert.ok(
    same.charge.every(
      (c, t) => Math.abs(c - plan.charge[t]) < 1e-6 && Math.abs(same.discharge[t] - plan.discharge[t]) < 1e-6,
    ),
  );
  // A surprise in hour 14 only: the replanner cannot know it in advance, the guard reacts to the meter.
  const actual = load.map((l, t) => l + (t === 14 ? 3 : 0));
  const noGuard = runReplan(a, run, actual, false);
  const withGuard = runReplan(a, run, actual, true);
  assert.ok(
    Math.abs(noGuard.charge[14] - same.charge[14]) < 1e-6 &&
      Math.abs(noGuard.discharge[14] - same.discharge[14]) < 1e-6,
    'no lookahead',
  );
  assert.ok(actual[14] + withGuard.charge[14] - withGuard.discharge[14] <= 72 + 1e-6);
  const sc = score(fakeDay(lmp, actual, 72), withGuard, PARAMS);
  assert.ok(
    sc.checks.socWithinBounds && sc.checks.powerWithinLimit && sc.checks.noSimultaneous && sc.checks.energyBalances,
    JSON.stringify(sc.checks),
  );
});

test('station: simulated data center keeps each hourly average, flywheel never exceeds its power', async () => {
  const { dataCenterMinutes, runMinutes } = await import('./station.js');
  const dc = dataCenterMinutes(6.75, 42);
  for (let h = 0; h < 24; h++)
    assert.ok(Math.abs(dc.slice(h * 60, h * 60 + 60).reduce((x, y) => x + y, 0) / 60 - 6.75) < 1e-9);
  const base = hours.map(() => 60);
  const sp = hours.map(() => 0);
  const spin = { powerMW: 3, energyMWh: 0.3, roundTripEff: 0.9 };
  const bat = { powerMW: 10, minStoredMWh: hours.map(() => 20), floorMWh: 4, eff: 0.88 };
  const r = runMinutes(base, dc, sp, 66.5, bat, 'station', spin, false);
  const plain = runMinutes(base, dc, sp, 66.5, bat, 'hourly');
  assert.ok(r.grid.every((g, m) => Math.abs(g - plain.grid[m]) <= 3 + 1e-9));
  assert.ok(r.overloadMinutes <= plain.overloadMinutes);
});

test('EIA-930 hours are hour ending: each value is filed under the hour it started', async () => {
  const { eiaHourStart } = await import('./time.js');
  assert.equal(eiaHourStart('2026-07-02T18'), '2026-07-02T17:00:00Z');
  assert.equal(eiaHourStart('2026-01-01T00'), '2025-12-31T23:00:00Z');
});
