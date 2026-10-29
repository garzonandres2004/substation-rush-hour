import assert from 'node:assert/strict';
import test from 'node:test';
import { decide, tomorrowInUtah } from './refresh.js';

test('tomorrow is counted in Utah time, not UTC', () => {
  // 11 PM Utah on Oct 28 is already Oct 29 in UTC; tomorrow in Utah is still Oct 29.
  assert.equal(tomorrowInUtah(new Date('2026-10-29T05:00:00Z')), '2026-10-29');
  // 4 PM Utah on Oct 28
  assert.equal(tomorrowInUtah(new Date('2026-10-28T22:00:00Z')), '2026-10-29');
});

test('skips when the page already shows tomorrow', () => {
  const d = decide('2026-10-29', false, new Date('2026-10-28T22:00:00Z'));
  assert.equal(d.action, 'skip');
});

test('skips when a refresh is already running', () => {
  const d = decide('2026-10-28', true, new Date('2026-10-28T22:00:00Z'));
  assert.deepEqual([d.action, d.action === 'skip' && d.reason], ['skip', 'running']);
});

test('dispatches when the page is stale, or unreadable', () => {
  assert.equal(decide('2026-10-28', false, new Date('2026-10-28T22:00:00Z')).action, 'dispatch');
  assert.equal(decide(null, false, new Date('2026-10-28T22:00:00Z')).action, 'dispatch');
});
