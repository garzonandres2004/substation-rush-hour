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
