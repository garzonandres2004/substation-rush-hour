// One plan, two bosses: DETOUR's day ahead plan for a business, with the substation's room added.
// The utility publishes, the day before, how much room the substation has each hour (its limit minus
// its own day ahead load forecast). Each business gets a share of that room in proportion to its
// battery power, and its plan pays a steep price for every kWh it would draw above its own load
// forecast plus that share. The vendored DETOUR code is not edited: the LP text it builds is extended
// on its way to the solver with one variable and one row per 15 minutes.
//
//   minimize   DETOUR's objective + PENALTY * sum(o_t)
//   subject to DETOUR's rows, and  g_t - o_t <= load_forecast_t + share * room_t
//
// o_t >= 0 is the overshoot; keeping it soft means the plan never fails, it just pays to stay out.

export interface HighsLike {
  solve(lpText: string, options?: unknown): any;
}

// Per kWh over the envelope. It has to outweigh what the plan gains from charging then, which is mostly
// the demand charge (about $15 per kW a month), not the energy price: at $1 the plans paid it and went over.
export const PENALTY_PER_KWH = Number(process.env.ENVELOPE_PENALTY ?? 50);

export function withEnvelope(lpText: string, envelopeKw: number[], stepHours: number): string {
  const lines = lpText.split('\n');
  const subjectTo = lines.indexOf('Subject To');
  const bounds = lines.indexOf('Bounds');
  if (subjectTo < 0 || bounds < 0) throw new Error('unexpected LP layout');
  const n = envelopeKw.length;
  const objTerms: string[] = [];
  for (let t = 0; t < n; t++) objTerms.push(`+ ${(PENALTY_PER_KWH * stepHours).toFixed(6)} o_${t}`);
  const objLines: string[] = [];
  for (let i = 0; i < objTerms.length; i += 8) objLines.push(` ${objTerms.slice(i, i + 8).join(' ')}`);
  const rows = ['', '\\ Substation envelope: grid draw over the published room is paid at the penalty'];
  for (let t = 0; t < n; t++) rows.push(` env_${t}: g_${t} - o_${t} <= ${envelopeKw[t].toFixed(4)}`);
  return [
    ...lines.slice(0, subjectTo),
    ...objLines,
    ...lines.slice(subjectTo, bounds),
    ...rows,
    ...lines.slice(bounds),
  ].join('\n');
}

// A HiGHS that adds the envelope for this plan's intervals before solving.
export function envelopeHighs(highs: HighsLike, envelopeKw: number[], stepHours: number): HighsLike {
  return {
    solve: (lpText: string, options?: unknown) => highs.solve(withEnvelope(lpText, envelopeKw, stepHours), options),
  };
}
