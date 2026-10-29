import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runMinutes } from './station.js';

const bat = { powerMW: 10, minStoredMWh: [30], floorMWh: 4, eff: 0.88 };

test('a steady excess is covered after one quarter hour in 15 minute steps', () => {
  const dc = Array(60).fill(5); // 5 MW of new load all hour
  const r = runMinutes([97], dc, [0], 100, bat, 'quarter'); // 2 MW over every minute
  assert.equal(r.overloadMinutes, 15); // the first quarter, before the battery acts
  assert.equal(r.over15Intervals, 1);
});

test('swings inside the quarter are not caught by 15 minute steps', () => {
  const dc = Array.from({ length: 60 }, (_, m) => (m % 4 < 2 ? 8 : 2)); // 3 MW over, then 3 under, every 2 minutes
  const q = runMinutes([95], dc, [0], 100, bat, 'quarter');
  const m = runMinutes([95], dc, [0], 100, bat, 'battery');
  assert.ok(q.overloadMinutes > m.overloadMinutes);
  assert.equal(m.overloadMinutes, 0);
});
