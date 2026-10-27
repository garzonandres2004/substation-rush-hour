// Shared by explain-build.ts and explain-ai.ts: lists every battery step on the page with the facts
// behind it, and checks an explanation text against those facts. Code decides what is true.
import type { Report, Scenario } from '../src/lib/report.js';
import { directions, type Strategy, type Step } from '../src/lib/directions.js';
import { stepHash, stepKey } from '../src/lib/explain.js';
import { PARAMS } from '../src/engine/params.js';

export interface StepFacts { key: string; hash: string; scenario: string; strategy: Strategy; step: Step; sc: Scenario }

export function allSteps(report: Report): StepFacts[] {
  const out: StepFacts[] = [];
  for (const sk of ['normal', 'derate'] as const) {
    for (const st of ['aware', 'priceOnly', 'clean'] as const) {
      const sc = report.scenarios[sk];
      for (const s of directions(sc, st, report.params.congestedThreshold)) {
        out.push({ key: stepKey(sk, st, s.kind, s.start, s.end), hash: stepHash(s.title, s.body), scenario: sk, strategy: st, step: s, sc });
      }
    }
  }
  return out;
}

const rowsOf = (f: StepFacts) => f.sc.hours.filter(h => h.hourLocal >= f.step.start && h.hourLocal <= f.step.end);

// The facts a model may use, as plain JSON.
export function factsFor(f: StepFacts, report: Report) {
  const r1 = (x: number) => +x.toFixed(1);
  return {
    key: f.key,
    scenario: f.scenario === 'normal' ? 'normal day' : 'substation capacity cut 10 percent',
    strategy: f.strategy === 'aware' ? 'stays out of traffic' : f.strategy === 'priceOnly' ? 'follows price only' : 'stays clean (follows grid CO2)',
    title: f.step.title, summary: f.step.body,
    limitMW: r1(f.sc.capMW), jamThreshold: report.params.congestedThreshold,
    hours: rowsOf(f).map(h => ({
      hour: h.hourLocal, pricePerMWh: r1(h.lmp), trafficIndex: +h.stress.toFixed(2), co2KgPerMWh: Math.round(h.co2),
      loadWithoutBatteryMW: r1(h.loadBefore), loadWithBatteryMW: r1(h[f.strategy].loadAfter),
      chargeMWh: r1(h[f.strategy].charge), dischargeMWh: r1(h[f.strategy].discharge), storedMWh: r1(h[f.strategy].soc),
    })),
  };
}

export function checkText(f: StepFacts, report: Report, text: string): string[] {
  const problems: string[] = [];
  const a = PARAMS.asset, jam = report.params.congestedThreshold, sc = f.sc, st = f.strategy;
  const rows = rowsOf(f);
  const allowed = new Set<number>();
  const add = (x: number) => { for (const d of [0, 1, 2]) allowed.add(+Math.abs(x).toFixed(d)); };
  for (let i = 1; i <= 12; i++) allowed.add(i); // clock hours
  [a.powerMW, a.energyMWh, jam, sc.capMW, a.startSocFrac * a.energyMWh, a.socMinFrac * a.energyMWh].forEach(add);
  for (const m of `${f.step.title} ${f.step.body}`.matchAll(/\d+(\.\d+)?/g)) allowed.add(+m[0]);
  for (const h of rows) {
    const x = h[st];
    [h.lmp, h.mcc, h.stress, h.co2, h.loadBefore, x.loadAfter, x.soc, x.charge, x.discharge,
      h.loadBefore - x.loadAfter, sc.capMW - x.loadAfter, x.loadAfter - sc.capMW, h.loadBefore - sc.capMW].forEach(add);
    allowed.add(Math.round(h.stress * 100));
  }
  for (const m of text.matchAll(/\d+(\.\d+)?/g)) if (!allowed.has(+m[0])) problems.push(`number ${m[0]} is not in the facts`);
  if (/[–—]| - /.test(text)) problems.push('contains a dash used as punctuation');
  const maxStress = Math.max(...sc.hours.map(h => h.stress));
  if (/worst hour/i.test(text) && !rows.some(h => h.stress === maxStress)) problems.push('says worst hour but it is not the peak traffic hour');
  if (text.length < 40 || text.length > 700) problems.push('length outside 40 to 700 characters');
  return problems;
}
