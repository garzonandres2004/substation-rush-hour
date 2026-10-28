// Lab tests: the any-step Station model must match the main page's minute model exactly at 60
// steps per hour, and conserve energy at 1 second steps.
import assert from 'node:assert/strict';
import test from 'node:test';
import { blockMean, runSteps, scaleHours } from './seconds.js';
import { dataCenterMinutes, runMinutes } from './station.js';

const base = Array.from({ length: 24 }, (_, h) => 80 + 8 * Math.sin((h / 24) * 2 * Math.PI));
const sp = Array.from({ length: 24 }, (_, h) => (h < 6 ? 6 : h >= 17 && h < 21 ? -8 : 0));
const bat = { powerMW: 10, minStoredMWh: Array(24).fill(20), floorMWh: 4, eff: 0.88 };
const spin = { powerMW: 3, energyMWh: 0.3, roundTripEff: 0.9 };

test('matches runMinutes at 60 steps per hour in every mode', () => {
  const dc = dataCenterMinutes(6, 7);
  for (const mode of ['hourly', 'battery', 'station'] as const) {
    for (const backup of [true, false]) {
      const a = runMinutes(base, dc, sp, 88, bat, mode, spin, backup);
      const b = runSteps(base, dc, 60, sp, 88, bat, mode, spin, backup);
      assert.equal(b.overSteps, a.overloadMinutes, `${mode} ${backup} over`);
      assert.ok(Math.abs(b.overMWh - a.overloadMWh) < 1e-9, `${mode} MWh`);
      assert.equal(b.batteryChanges, a.batteryChanges, `${mode} changes`);
      assert.ok(Math.abs(b.batteryExtraMWh - a.batteryExtraMWh) < 1e-9, `${mode} extra`);
      assert.ok(Math.abs(b.flywheelThroughputMWh - a.flywheelThroughputMWh) < 1e-9, `${mode} fly`);
      assert.ok(Math.abs(b.maxRampMW - a.maxRampMWPerMin) < 1e-9, `${mode} ramp`);
    }
  }
});

test('scaleHours keeps each hour average and blockMean averages', () => {
  const x = new Float64Array(7200).map((_, i) => 0.5 + 0.5 * Math.sin(i / 3));
  const y = scaleHours(x, 3600, 7);
  for (let h = 0; h < 2; h++) {
    let s = 0;
    for (let i = 0; i < 3600; i++) s += y[h * 3600 + i];
    assert.ok(Math.abs(s / 3600 - 7) < 1e-9);
  }
  const m = blockMean(y, 60);
  assert.equal(m.length, 120);
  assert.ok(Math.abs(m.reduce((a, b) => a + b, 0) / 120 - 7) < 1e-9);
});

test('a flywheel big enough for every swing leaves nothing over at 1 s', () => {
  const x = new Float64Array(24 * 3600).map((_, i) => (Math.floor(i / 3) % 2 ? 1 : 0.6));
  const dc = scaleHours(x, 3600, 6);
  const hourly = runSteps(base, dc, 3600, sp, 100, bat, 'hourly');
  const big = runSteps(
    base,
    dc,
    3600,
    sp,
    100,
    bat,
    'station',
    { powerMW: 5, energyMWh: 0.5, roundTripEff: 0.9 },
    false,
  );
  assert.ok(hourly.overSteps > 0);
  assert.equal(big.overSteps, 0);
});
