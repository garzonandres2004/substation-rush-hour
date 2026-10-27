import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, naiveSchedule } from './dispatch.js';
import { PARAMS } from './params.js';
import { score } from './score.js';
import type { DayInputs, Schedule } from './types.js';

const a = PARAMS.asset;
const eta = Math.sqrt(a.roundTripEff);
const hours = Array.from({ length: 24 }, (_, i) => i);

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

function fakeDay(lmp: number[], load: number[], cap: number): DayInputs {
  return {
    date: 'test', hourLocal: hours, t: hours.map(String), lmp, mcc: lmp.map(() => 0), mce: lmp,
    demandHat: load, solarHat: lmp.map(() => 0), windHat: lmp.map(() => 0), netLoadHat: load,
    loadMW: load, capMW: cap, stress: lmp.map(x => Math.min(1, x / 60)),
    comps: { demand: [], netLoad: [], ramp: [], price: [] },
  };
}

test('schedule respects SoC bounds, power limit, no simultaneous charge and discharge (random prices)', () => {
  const r = rng(7);
  for (let k = 0; k < 20; k++) {
    const lmp = hours.map(() => 10 + 60 * r());
    const s = dispatch(lmp, a);
    const sc = score(fakeDay(lmp, hours.map(() => 50), 100), s, PARAMS);
    assert.ok(Object.values(sc.checks).every(Boolean), JSON.stringify(sc.checks));
  }
});

test('energy balance: starts and ends at the same SoC, discharge equals round trip efficiency times charge', () => {
  const r = rng(11);
  const lmp = hours.map(() => 10 + 60 * r());
  const s = dispatch(lmp, a);
  const c = s.charge.reduce((x, y) => x + y, 0), d = s.discharge.reduce((x, y) => x + y, 0);
  assert.ok(Math.abs(s.soc[23] - a.energyMWh * a.startSocFrac) < 1e-9);
  assert.ok(Math.abs(d - a.roundTripEff * c) < 1e-6);
  assert.ok(Math.abs(eta * eta - a.roundTripEff) < 1e-12);
});

test('flat price means no cycling (no free lunch)', () => {
  const s = dispatch(hours.map(() => 30), a);
  assert.equal(s.charge.reduce((x, y) => x + y, 0), 0);
  assert.equal(s.discharge.reduce((x, y) => x + y, 0), 0);
});

test('deterministic: same inputs give the same schedule', () => {
  const lmp = hours.map(i => 20 + 30 * Math.sin(i / 3));
  assert.deepEqual(dispatch(lmp, a), dispatch(lmp, a));
});

test('baseline is feasible and returns to start SoC', () => {
  const s = naiveSchedule(a, hours);
  const sc = score(fakeDay(hours.map(() => 30), hours.map(() => 50), 100), s, PARAMS);
  assert.ok(Object.values(sc.checks).every(Boolean), JSON.stringify(sc.checks));
});

test('capacity aware dispatch does not create overload where price only dispatch does', () => {
  const lmp = hours.map(i => (i >= 10 && i <= 16 ? 15 : 45));
  const load = hours.map(i => (i >= 10 && i <= 16 ? 78 : 60));
  const cap = 80;
  const price = dispatch(lmp, a);
  const aware = dispatch(lmp, a, { load, cap, penalty: PARAMS.overloadPenalty });
  const day = fakeDay(lmp, load, cap);
  const sp = score(day, price, PARAMS), sa = score(day, aware, PARAMS);
  assert.ok(sp.overloadAfterMWh > 0);
  assert.equal(sa.overloadAfterMWh, 0);
});

test('storage clears an existing overload without extra energy being invented', () => {
  const lmp = hours.map(i => (i >= 17 && i <= 20 ? 60 : 20));
  const load = hours.map(i => (i >= 17 && i <= 20 ? 90 : 60));
  const day = fakeDay(lmp, load, 85);
  const aware = dispatch(lmp.map(x => x + 10), a, { load, cap: 85, penalty: PARAMS.overloadPenalty });
  const sc = score(day, aware, PARAMS);
  assert.ok(sc.overloadBeforeMWh > 0);
  assert.ok(sc.overloadAfterMWh < sc.overloadBeforeMWh);
  const s: Schedule = aware;
  const delivered = s.discharge.reduce((x, y) => x + y, 0);
  const bought = s.charge.reduce((x, y) => x + y, 0);
  assert.ok(delivered <= bought * a.roundTripEff + 1e-6);
});
