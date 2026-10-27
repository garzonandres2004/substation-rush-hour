import type { HourRow, Scenario } from './report';
import { rangeLabel, stressWord } from './report';

export type Strategy = 'aware' | 'priceOnly' | 'clean';
export interface Step { kind: 'charge' | 'discharge'; start: number; end: number; mwh: number; title: string; body: string }

const f1 = (x: number) => x.toFixed(1);

export function directions(sc: Scenario, strategy: Strategy, jam: number): Step[] {
  const act = (h: HourRow) => (h[strategy].charge > 0.05 ? 'charge' : h[strategy].discharge > 0.05 ? 'discharge' : null);
  const steps: Step[] = [];
  let cur: { kind: 'charge' | 'discharge'; rows: HourRow[] } | null = null;
  const flush = () => {
    if (!cur) return;
    const rows = cur.rows;
    const kind = cur.kind;
    const mwh = rows.reduce((s, r) => s + r[strategy][kind], 0);
    const price = rows.reduce((s, r) => s + r.lmp, 0) / rows.length;
    const stress = rows.reduce((s, r) => s + r.stress, 0) / rows.length;
    const start = rows[0].hourLocal, end = rows[rows.length - 1].hourLocal;
    const maxBefore = Math.max(...rows.map(r => r.loadBefore));
    const maxAfter = Math.max(...rows.map(r => r[strategy].loadAfter));
    const overB = rows.reduce((s, r) => s + Math.max(0, r.loadBefore - sc.capMW), 0);
    const overA = rows.reduce((s, r) => s + Math.max(0, r[strategy].loadAfter - sc.capMW), 0);
    let body = `Price averages $${price.toFixed(0)} per MWh. Traffic index ${stress.toFixed(2)}, ${stressWord(stress, jam).toLowerCase()}.`;
    if (kind === 'charge') {
      const gap = sc.capMW - maxAfter;
      body += gap > 0.05
        ? ` Grid draw peaks at ${f1(maxAfter)} MW, ${f1(gap)} MW under the limit.`
        : gap >= -0.05
          ? ` Grid draw is held to the ${f1(sc.capMW)} MW limit.`
          : ` Grid draw reaches ${f1(maxAfter)} MW, ${f1(-gap)} MW over the limit.`;
    } else {
      body += ` The busiest hour drops from ${f1(maxBefore)} to ${f1(maxAfter)} MW.`;
      if (overB > 0.05) body += overA < overB ? ` Clears ${f1(overB - overA)} MWh of overload.` : ' Overload remains.';
    }
    steps.push({ kind, start, end, mwh, title: `${rangeLabel(start, end)}: ${kind} ${mwh.toFixed(0)} MWh`, body });
    cur = null;
  };
  for (const h of sc.hours) {
    const a = act(h);
    if (!a) { flush(); continue; }
    if (cur && cur.kind === a && cur.rows[cur.rows.length - 1].hourLocal === h.hourLocal - 1) cur.rows.push(h);
    else { flush(); cur = { kind: a, rows: [h] }; }
  }
  flush();
  // Steps under 1 MWh are real in the schedule and charts, but too small to list as a turn.
  return steps.filter(st => st.mwh >= 1);
}

export function jamRanges(sc: Scenario): [number, number][] {
  const out: [number, number][] = [];
  let s = -1;
  sc.hours.forEach((h, i) => {
    if (h.congested && s < 0) s = h.hourLocal;
    if ((!h.congested || i === sc.hours.length - 1) && s >= 0) {
      out.push([s, h.congested ? h.hourLocal : sc.hours[i - 1].hourLocal]);
      s = -1;
    }
  });
  return out;
}
