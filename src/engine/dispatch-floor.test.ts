import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dispatch } from './dispatch.js';
import { PARAMS } from './params.js';

const A = PARAMS.asset;
// Prices that pay to empty the battery in hours 0 to 5 and refill it in hours 18 to 23.
const v = Array.from({ length: 24 }, (_, t) => (t < 6 ? 200 : t >= 18 ? 0 : 50));

test('without a floor the battery empties early', () => {
  const s = dispatch(v, A);
  assert.ok(s.soc[5] < A.energyMWh * A.socMinFrac + 1);
});

test('a floor holds the reserve at that hour', () => {
  const floor: (number | undefined)[] = Array(24).fill(undefined);
  floor[5] = 30;
  const s = dispatch(v, A, { load: Array(24).fill(0), cap: 1e9, penalty: 0, floorMWh: floor });
  assert.ok(s.soc[5] >= 30 - 1e-9);
});

test('a floor out of reach is lowered, the plan still exists', () => {
  const floor: (number | undefined)[] = Array(24).fill(undefined);
  floor[0] = 40; // from 20 MWh, one hour of charging reaches at most about 29
  const s = dispatch(v, A, { load: Array(24).fill(0), cap: 1e9, penalty: 0, floorMWh: floor });
  assert.equal(s.soc.length, 24);
  assert.ok(s.soc.every(x => Number.isFinite(x)));
  assert.ok(s.soc[0] > 28);
});

test('closed hours get no charging, and the plan still exists', () => {
  // Cheapest hours are 10 to 14; close them and the battery must charge elsewhere or not at all.
  const price = Array.from({ length: 24 }, (_, t) => (t >= 10 && t <= 14 ? 10 : t >= 18 ? 120 : 60));
  const closed = price.map((_, t) => t >= 10 && t <= 14);
  const s = dispatch(price, A, { load: Array(24).fill(0), cap: 1e9, penalty: 0, noCharge: closed });
  for (let t = 10; t <= 14; t++) assert.equal(s.charge[t], 0);
  assert.equal(s.soc.length, 24);
});

test('all hours closed late in the day: falls back instead of failing', () => {
  const closed = Array(24).fill(true);
  const s = dispatch(Array(24).fill(50), A, { load: Array(24).fill(0), cap: 1e9, penalty: 0, noCharge: closed }, 0.25, 8);
  assert.ok(s.soc.every(x => Number.isFinite(x)));
});
