import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KG_PER_MWH } from './carbon.js';
import { marginalFit } from './marginal.js';
import type { Hour } from './types.js';

// Thirty days where gas follows every change in demand and coal stays flat: the marginal rate is gas's.
function days(n: number, gasShare: (hr: number) => number): Hour[] {
  const out: Hour[] = [];
  const t0 = Date.parse('2026-09-01T06:00:00Z');
  for (let i = 0; i < n * 24; i++) {
    const hr = i % 24;
    const demand = 5000 + 1500 * Math.sin((hr / 24) * 2 * Math.PI) + 200 * Math.sin(i * 1.7);
    const coal = 2000;
    const gas = (demand - coal - 1000) * gasShare(hr) + 500;
    out.push({ t: new Date(t0 + i * 3_600_000).toISOString(), demand, coal, gas, genTotal: demand });
  }
  return out;
}

test('gas on the margin gives the gas rate, by either method', () => {
  for (const m of ['fossil', 'demand'] as const) {
    const f = marginalFit(
      days(30, () => 1),
      60,
      m,
    );
    for (const v of f.kgPerMWh) assert.ok(Math.abs(v - KG_PER_MWH.gas) < 1, `${m} ${v}`);
  }
});

test('demand method: nothing fossil on the margin gives zero', () => {
  const f = marginalFit(
    days(30, () => 0),
    60,
    'demand',
  );
  for (const v of f.kgPerMWh) assert.ok(Math.abs(v) < 1e-6);
});

test('the fit uses only the trailing days', () => {
  const f = marginalFit(
    days(90, () => 1),
    20,
  );
  assert.ok(f.samples.every(n => n <= 20 && n >= 18));
});
