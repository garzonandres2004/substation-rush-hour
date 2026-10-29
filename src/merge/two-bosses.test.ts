// The envelope must reach the solver in valid LP form and bind: with the penalty above the value of
// drawing more, the plan stays inside the envelope; with it below, the plan goes over and pays.
import assert from 'node:assert/strict';
import test from 'node:test';
import highsLoader from 'highs';
import { withEnvelope } from './two-bosses.js';

const lp = [
  'Minimize',
  ' obj: - 1 g_0 - 1 g_1',
  '',
  'Subject To',
  ' c0: g_0 + g_1 <= 10',
  'Bounds',
  ' 0 <= g_0 <= +inf',
  ' 0 <= g_1 <= +inf',
  'End',
  '',
].join('\n');

test('the envelope binds when the penalty outweighs the gain', async () => {
  const highs = await highsLoader();
  const sol = highs.solve(withEnvelope(lp, [3, 3], 1, 4)); // penalty 4 per unit over, gain 1 per unit
  assert.equal(sol.Status, 'Optimal');
  assert.ok(Math.abs(sol.Columns.g_0.Primal - 3) < 1e-6 && Math.abs(sol.Columns.g_1.Primal - 3) < 1e-6);
});

test('it stays soft: a cheap penalty lets the plan go over', async () => {
  const highs = await highsLoader();
  const sol = highs.solve(withEnvelope(lp, [3, 3], 1, 0.25)); // penalty 0.25, gain 1
  assert.equal(sol.Status, 'Optimal');
  assert.ok(sol.Columns.g_0.Primal + sol.Columns.g_1.Primal > 6 + 1e-6);
});
