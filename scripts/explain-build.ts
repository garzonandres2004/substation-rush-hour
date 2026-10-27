// Validates the cached plain English explanations against the engine output and writes
// public/data/explanations.json. Run after `npm run engine`: npm run explain
import fs from 'node:fs';
import { report } from '../src/lib/report.js';
import { directions } from '../src/lib/directions.js';
import { stepHash, stepKey } from '../src/lib/explain.js';
import { PARAMS } from '../src/engine/params.js';

const source: Record<string, string> = JSON.parse(fs.readFileSync('scripts/explanations.source.json', 'utf8'));
const jam = report.params.congestedThreshold;
const a = PARAMS.asset;
const entries: Record<string, { hash: string; text: string }> = {};
const problems: string[] = [];

for (const sk of ['normal', 'derate'] as const) {
  for (const st of ['aware', 'priceOnly', 'clean'] as const) {
    const sc = report.scenarios[sk];
    for (const s of directions(sc, st, jam)) {
      const key = stepKey(sk, st, s.kind, s.start, s.end);
      const text = source[key];
      if (!text) { problems.push(`missing text for ${key}`); continue; }
      const before = problems.length;
      const rows = sc.hours.filter(h => h.hourLocal >= s.start && h.hourLocal <= s.end);
      const allowed = new Set<number>();
      const add = (x: number) => { for (const d of [0, 1, 2]) allowed.add(+Math.abs(x).toFixed(d)); };
      for (let i = 1; i <= 12; i++) allowed.add(i); // clock hours
      [a.powerMW, a.energyMWh, jam, sc.capMW, a.startSocFrac * a.energyMWh, a.socMinFrac * a.energyMWh].forEach(add);
      for (const m of `${s.title} ${s.body}`.matchAll(/\d+(\.\d+)?/g)) allowed.add(+m[0]);
      for (const h of rows) {
        const x = h[st];
        [h.lmp, h.mcc, h.stress, h.co2, h.loadBefore, x.loadAfter, x.soc, x.charge, x.discharge,
          h.loadBefore - x.loadAfter, sc.capMW - x.loadAfter, x.loadAfter - sc.capMW, h.loadBefore - sc.capMW].forEach(add);
      }
      const maxStress = Math.max(...sc.hours.map(h => h.stress));
      for (const m of text.matchAll(/\d+(\.\d+)?/g)) {
        if (!allowed.has(+m[0])) problems.push(`${key}: number ${m[0]} not found in engine facts`);
      }
      if (/[–—]| - /.test(text)) problems.push(`${key}: contains a dash used as punctuation`);
      if (text.includes('worst hour') && !rows.some(h => h.stress === maxStress)) problems.push(`${key}: says worst hour but it is not the peak index`);
      if (problems.length === before) entries[key] = { hash: stepHash(s.title, s.body), text };
    }
  }
}
const extra = Object.keys(source).filter(k => !entries[k] && !problems.some(p => p.includes(k)));
if (extra.length) problems.push(`source has unused keys (report changed?): ${extra.join(', ')}`);

// --lenient (used by the daily refresh): keep only explanations that still match today's plan and
// skip the rest. The page shows the plain numbers for any step without a checked explanation.
const LENIENT = process.argv.includes('--lenient');
if (problems.length && !LENIENT) { console.error(problems.join('\n')); process.exit(1); }
if (problems.length) console.warn(`lenient: skipped ${problems.length} explanation problems; those steps show plain numbers`);
const out = {
  generatedBy: 'Written by Claude from the engine facts, then checked by code. The model explains. It does not decide.',
  reportDate: report.date,
  entries,
};
fs.writeFileSync('public/data/explanations.json', JSON.stringify(out, null, 1) + '\n');
console.log(`ok: ${Object.keys(entries).length} explanations written, all numbers match engine facts`);
