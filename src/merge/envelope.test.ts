// Merge tests: the fleet guard must remove charging overloads, conserve the fleet's energy, never
// move charging into an on-peak hour or across one, and never move discharge.
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyEnvelope, type EnvelopeHour } from './envelope.js';

const H = 3_600_000;
const hour = (i: number, baseMW: number, fleetMW: number, offPeak = true): EnvelopeHour => ({
  ms: i * H,
  baseMW,
  capMW: 100,
  fleetMW,
  offPeak,
});
const sum = (x: number[]) => x.reduce((a, b) => a + b, 0);

test('moves charging out of an overload into the nearest hours with room', () => {
  const hours = [hour(0, 99, 0), hour(1, 95, 10), hour(2, 90, 0), hour(3, 80, 0)];
  const r = applyEnvelope(hours, 50);
  for (const [i, h] of hours.entries()) assert.ok(h.baseMW + r.fleetMW[i] <= h.capMW + 1e-9, `hour ${i} over`);
  assert.equal(r.unmovedMWh, 0);
  assert.ok(Math.abs(sum(r.fleetMW) - 10) < 1e-9, 'energy conserved');
});

test('never charges in or across an on-peak hour', () => {
  const hours = [hour(0, 50, 0), hour(1, 60, 0, false), hour(2, 98, 10), hour(3, 99, 0)];
  const r = applyEnvelope(hours, 50);
  assert.equal(r.fleetMW[1], 0, 'on-peak hour untouched');
  assert.equal(r.fleetMW[0], 0, 'no jump across the on-peak hour');
  assert.ok(r.unmovedMWh > 0, 'what has no room is reported, not hidden');
  assert.ok(Math.abs(sum(r.fleetMW) - 10) < 1e-9, 'energy conserved');
});

test('leaves discharge and hours under the limit alone', () => {
  const hours = [hour(0, 105, -8), hour(1, 70, 5), hour(2, 60, 0)];
  const r = applyEnvelope(hours, 50);
  assert.deepEqual(r.fleetMW, [-8, 5, 0]);
  assert.equal(r.movedMWh, 0);
});

test('respects the fleet charging power limit', () => {
  const hours = [hour(0, 99, 8), hour(1, 50, 0), hour(2, 50, 0)];
  const r = applyEnvelope(hours, 4);
  assert.ok(r.fleetMW.every(v => v <= 8 + 1e-9));
  assert.ok(r.fleetMW[1] <= 4 + 1e-9 && r.fleetMW[2] <= 4 + 1e-9);
});
