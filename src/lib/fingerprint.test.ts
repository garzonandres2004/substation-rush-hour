import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { canonicalPlan, fingerprint } from './fingerprint.js';

const day = { date: '2026-10-30', capMW: 92.1, hours: [{ h: 0, charge: 1.5, discharge: 0, afterMW: 80 }] };

test('fingerprint is the SHA-256 of the canonical plan', async () => {
  const want = createHash('sha256').update(canonicalPlan(day)).digest('hex');
  assert.equal(await fingerprint(day), want);
});

test('any change to the plan changes the fingerprint', async () => {
  const a = await fingerprint(day);
  const b = await fingerprint({ ...day, hours: [{ ...day.hours[0], charge: 1.6 }] });
  assert.notEqual(a, b);
});

test('extra fields do not change it', async () => {
  assert.equal(await fingerprint({ ...day, generatedAt: 'x' } as typeof day), await fingerprint(day));
});
