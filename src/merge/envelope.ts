// The substation guard applied to a fleet: each hour the substation publishes its room (limit minus
// load). Fleet charging that would push it over the limit is moved to the nearest hour, within reach,
// that is off-peak on Schedule 8 and still has room. Off-peak energy is one flat rate on Schedule 8,
// so a move inside off-peak hours leaves the customer's energy and on-peak demand lines unchanged.
// Discharge is never moved: it only lowers the substation load.

export interface EnvelopeHour {
  ms: number; // UTC hour start
  baseMW: number; // substation load without the fleet's batteries
  capMW: number; // substation limit
  fleetMW: number; // fleet battery change, + charging, - discharging
  offPeak: boolean; // off-peak on Schedule 8 for this local hour
}

export interface EnvelopeResult {
  fleetMW: number[];
  movedMWh: number;
  unmovedMWh: number;
  maxShiftHours: number;
}

export function applyEnvelope(hours: EnvelopeHour[], fleetMaxChargeMW: number, reachHours = 12): EnvelopeResult {
  const fleet = hours.map(h => h.fleetMW);
  const room = (i: number) => hours[i].capMW - hours[i].baseMW - fleet[i];
  let moved = 0;
  let unmoved = 0;
  let maxShift = 0;
  for (let i = 0; i < hours.length; i++) {
    let excess = Math.min(Math.max(0, fleet[i]), Math.max(0, -room(i)));
    if (excess <= 1e-9) continue;
    fleet[i] -= excess;
    // nearest hours first, later before earlier at the same distance (charging later keeps the plan's order).
    // A search direction stops at the first on-peak hour or data gap, so charging never jumps across a
    // discharge window and the battery's charge stays in the same off-peak block.
    const open = { later: true, earlier: true };
    for (let d = 1; d <= reachHours && excess > 1e-9 && (open.later || open.earlier); d++) {
      for (const [dir, j] of [
        ['later', i + d],
        ['earlier', i - d],
      ] as const) {
        if (!open[dir] || excess <= 1e-9) continue;
        if (j < 0 || j >= hours.length || !hours[j].offPeak || hours[j].ms - hours[i].ms !== (j - i) * 3_600_000) {
          open[dir] = false;
          continue;
        }
        const take = Math.min(excess, Math.max(0, room(j)), Math.max(0, fleetMaxChargeMW - fleet[j]));
        if (take <= 1e-9) continue;
        fleet[j] += take;
        excess -= take;
        moved += take;
        maxShift = Math.max(maxShift, d);
      }
    }
    if (excess > 1e-9) {
      // no room within reach: keep it where it was and report it
      fleet[i] += excess;
      unmoved += excess;
    }
  }
  return { fleetMW: fleet, movedMWh: moved, unmovedMWh: unmoved, maxShiftHours: maxShift };
}
