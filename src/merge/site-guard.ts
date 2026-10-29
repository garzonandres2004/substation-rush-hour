// The substation guard, site by site. Works on each business's own 15 minute plan from DETOUR:
// when the fleet's charging would push the substation over its limit, each charging site gives up
// its share of the excess (in proportion to how hard it is charging), and moves that battery charging
// to the nearest 15 minutes that (1) still leave the substation under its limit, (2) are not billed
// on-peak for that site, (3) the site's battery can take (power, and charge level never below its
// floor or above its top, in every interval in between), and (4) do not cross one of the site's own
// discharges, and (5) keep the site's grid draw at or under its own planned monthly peak. Then every site is billed again on its real tariff, so what the guard costs each
// customer is measured, not assumed. Only Pulse charging moves; Spin and all discharge stay as planned.

export interface GuardSite {
  id: string;
  gridKw: number[]; // planned grid draw per 15 minutes (changed in place)
  pulseChargeKw: number[]; // changed in place
  pulseDischargeKw: number[];
  pulseSocKwh: number[]; // charge at the end of each interval (changed in place)
  noChargeMove: boolean[]; // intervals the site must not receive moved charging (billed on-peak)
  floorKwh: number[]; // lowest allowed charge at the end of each interval (min, plus any reserve)
  topKwh: number; // highest allowed charge
  powerKw: number;
  chargeEfficiency: number;
  loadKw: number[];
  gridCapKw: number; // moved charging never lifts grid draw above this: the site's planned monthly peak,
  // so its facilities and demand charges cannot rise (no customer pays more to relieve the substation)
}

export interface GuardResult {
  movedKwh: number; // grid side energy moved
  unmovedKwh: number; // fleet charging (battery or flywheel) still over the limit after the guard
  maxShiftSteps: number;
}

// baseMW / capMW: the substation load without the fleet's batteries, and its limit, per 15 minutes.
export function guardSites(
  sites: GuardSite[],
  baseMW: number[],
  capMW: number[],
  stepHours = 0.25,
  reachSteps = 48,
): GuardResult {
  const T = baseMW.length;
  const fleetKw = Array.from({ length: T }, (_, t) => sites.reduce((s, x) => s + x.gridKw[t] - x.loadKw[t], 0));
  const roomKw = (t: number) => (capMW[t] - baseMW[t]) * 1000 - fleetKw[t];
  let moved = 0;
  let unmoved = 0;
  let maxShift = 0;

  const canTake = (s: GuardSite, from: number, to: number, kw: number): number => {
    // how much of kw the site can move from interval `from` to `to`, given its battery charge path
    let limit = Math.min(kw, s.powerKw - s.pulseChargeKw[to], s.gridCapKw - s.gridKw[to]);
    const dE = s.chargeEfficiency * stepHours; // kWh stored per kW charged for one interval
    if (to > from) {
      for (let k = from; k < to; k++) limit = Math.min(limit, (s.pulseSocKwh[k] - s.floorKwh[k]) / dE);
    } else {
      for (let k = to; k < from; k++) limit = Math.min(limit, (s.topKwh - s.pulseSocKwh[k]) / dE);
    }
    return Math.max(0, limit);
  };

  const shift = (s: GuardSite, from: number, to: number, kw: number) => {
    const dE = s.chargeEfficiency * stepHours * kw;
    s.pulseChargeKw[from] -= kw;
    s.gridKw[from] -= kw;
    s.pulseChargeKw[to] += kw;
    s.gridKw[to] += kw;
    if (to > from) for (let k = from; k < to; k++) s.pulseSocKwh[k] -= dE;
    else for (let k = to; k < from; k++) s.pulseSocKwh[k] += dE;
    fleetKw[from] -= kw;
    fleetKw[to] += kw;
  };

  for (let t = 0; t < T; t++) {
    const excess = -roomKw(t);
    if (excess <= 1e-6) continue;
    const chargers = sites.filter(s => s.pulseChargeKw[t] > 1e-6);
    const totalCharge = chargers.reduce((a, s) => a + s.pulseChargeKw[t], 0);
    if (totalCharge <= 1e-6) {
      unmoved += Math.min(Math.max(0, fleetKw[t]), excess) * stepHours; // only flywheel charging here
      continue;
    }
    const cut = Math.min(excess, totalCharge);
    for (const s of chargers) {
      let left = (cut * s.pulseChargeKw[t]) / totalCharge;
      const open = { later: true, earlier: true };
      for (let d = 1; d <= reachSteps && left > 1e-6 && (open.later || open.earlier); d++) {
        for (const [dir, j] of [
          ['later', t + d],
          ['earlier', t - d],
        ] as const) {
          if (!open[dir] || left <= 1e-6) continue;
          if (j < 0 || j >= T || s.noChargeMove[j] || s.pulseDischargeKw[j] > 1e-6) {
            open[dir] = false; // stop at the site's billed on-peak time or its own discharge
            continue;
          }
          const take = Math.min(left, Math.max(0, roomKw(j)), canTake(s, t, j, left));
          if (take <= 1e-6) continue;
          shift(s, t, j, take);
          left -= take;
          moved += take * stepHours;
          maxShift = Math.max(maxShift, d);
        }
      }
    }
    // whatever fleet charging still pushes the substation over here stays, and is reported
    unmoved += Math.min(Math.max(0, fleetKw[t]), Math.max(0, -roomKw(t))) * stepHours;
  }
  return { movedKwh: moved, unmovedKwh: unmoved, maxShiftSteps: maxShift };
}
