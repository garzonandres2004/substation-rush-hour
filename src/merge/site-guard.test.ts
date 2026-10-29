// Site guard tests: removes charging overloads, keeps each battery's charge within its limits,
// conserves energy per site, and never moves charging into a site's billed on-peak time.
import assert from 'node:assert/strict';
import test from 'node:test';
import { type GuardSite, guardSites } from './site-guard.js';

function site(id: string, charge: number[], opts: Partial<GuardSite> = {}): GuardSite {
  const T = charge.length;
  const load = Array(T).fill(100);
  const soc: number[] = [];
  let e = 50;
  for (const c of charge) {
    e += c * 0.9 * 0.25;
    soc.push(e);
  }
  return {
    id,
    gridKw: load.map((l, t) => l + charge[t]),
    pulseChargeKw: [...charge],
    pulseDischargeKw: Array(T).fill(0),
    pulseSocKwh: soc,
    noChargeMove: Array(T).fill(false),
    floorKwh: Array(T).fill(10),
    topKwh: 400,
    powerKw: 400,
    chargeEfficiency: 0.9,
    loadKw: load,
    gridCapKw: 10_000,
    ...opts,
  };
}
const sum = (x: number[]) => x.reduce((a, b) => a + b, 0);

test('moves charging out of an overload and conserves each site energy', () => {
  const a = site('a', [0, 300, 0, 0]);
  const b = site('b', [0, 100, 0, 0]);
  const base = [1, 1, 1, 1]; // MW, without batteries
  const cap = [1.5, 1.2, 1.5, 1.5]; // the second interval has 200 kW of room, the fleet charges 400
  const r = guardSites([a, b], base, cap);
  for (let t = 0; t < 4; t++) {
    const fleet = a.gridKw[t] - a.loadKw[t] + b.gridKw[t] - b.loadKw[t];
    assert.ok(base[t] * 1000 + fleet <= cap[t] * 1000 + 1e-6, `interval ${t} over`);
  }
  assert.ok(Math.abs(sum(a.pulseChargeKw) - 300) < 1e-6 && Math.abs(sum(b.pulseChargeKw) - 100) < 1e-6);
  assert.ok(Math.abs(r.movedKwh - 50) < 1e-6, 'moved 200 kW for one 15 minute step');
  assert.equal(r.unmovedKwh, 0);
});

test('keeps the battery charge path valid after a move', () => {
  const a = site('a', [0, 300, 0, 0]);
  guardSites([a], [1, 1, 1, 1], [1.5, 1.2, 1.5, 1.5]);
  let e = 50;
  a.pulseChargeKw.forEach((c, t) => {
    e += c * 0.9 * 0.25;
    assert.ok(Math.abs(a.pulseSocKwh[t] - e) < 1e-6, `charge path at ${t}`);
    assert.ok(e >= 10 - 1e-6 && e <= 400 + 1e-6);
  });
});

test('never moves charging into billed on-peak time or across a discharge', () => {
  const a = site('a', [0, 0, 300, 0, 0], {
    noChargeMove: [false, false, false, true, false],
    pulseDischargeKw: [0, 200, 0, 0, 0],
  });
  const r = guardSites([a], [1, 1, 1, 1, 1], [1.5, 1.5, 1.2, 1.5, 1.5]);
  assert.equal(a.pulseChargeKw[3], 0, 'on-peak interval untouched');
  assert.equal(a.pulseChargeKw[1], 0, 'no move across the discharge');
  assert.ok(r.unmovedKwh > 0, 'what has no room is reported, not hidden');
});

test('never lifts a site above its own monthly peak', () => {
  const a = site('a', [0, 300, 0, 0], { gridCapKw: 400 }); // planned peak is 100 load + 300 charge
  a.loadKw[2] = 380;
  a.gridKw[2] = 380;
  guardSites([a], [1, 1, 1, 1], [1.5, 1.2, 1.5, 1.5]);
  assert.ok(
    a.gridKw.every(g => g <= 400 + 1e-6),
    'grid draw stays at or under the planned peak',
  );
});
