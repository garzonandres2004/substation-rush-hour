// A plan's fingerprint: SHA-256 of the saved plan (date, limit and hours) written in one fixed way. It is
// stored with each archived day by the refresh, before the day starts, and committed to the public repo, so
// anyone can recompute it from the saved hours and check the commit time: the plan was not changed after
// the fact. (Idea from RampMeter, which signs each plan before the day.)
export interface PlanForPrint {
  date: string;
  capMW: number;
  hours: { h: number; charge: number; discharge: number; afterMW: number }[];
}
export const canonicalPlan = (d: PlanForPrint) =>
  JSON.stringify({
    date: d.date,
    capMW: d.capMW,
    hours: d.hours.map(h => [h.h, h.charge, h.discharge, h.afterMW]),
  });

export async function fingerprint(d: PlanForPrint): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalPlan(d));
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}
