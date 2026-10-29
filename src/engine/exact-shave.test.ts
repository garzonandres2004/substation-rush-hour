import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runReplan } from './execute.js';
import { PARAMS } from './params.js';

const A = PARAMS.asset;
const T = 24;
const load = Array.from({ length: T }, (_, t) => (t >= 15 && t <= 17 ? 101.3 : 80));
const run = {
  signal: Array.from({ length: T }, (_, t) => (t >= 15 ? 60 : 30)),
  forecastLoad: load,
  cap: 100,
  penalty: PARAMS.overloadPenalty,
  margin: 0,
};

test('exact shave discharges only what is over the limit', () => {
  const s = runReplan(A, run, load, true, 0, undefined, undefined, undefined, true);
  for (let t = 0; t < T; t++) {
    const over = Math.max(0, load[t] - 100);
    assert.ok(Math.abs(s.discharge[t] - over) < 1e-9, `hour ${t}: ${s.discharge[t]}`);
    assert.ok(load[t] + s.charge[t] - s.discharge[t] <= 100 + 1e-9);
  }
});

test('without it the plan may discharge more than needed', () => {
  const s = runReplan(A, run, load, true, 0);
  const total = s.discharge.reduce((x, y) => x + y, 0);
  assert.ok(total >= 3 * 1.3 - 1e-9);
});
