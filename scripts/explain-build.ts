// Checks the plain English explanations against the engine output and writes
// public/data/explanations.json. Run after `npm run engine`: npm run explain
//   --source <file>  explanation sources in priority order (default scripts/explanations.source.json)
//   --lenient        keep only explanations that pass; others show plain numbers (used daily)
import fs from 'node:fs';
import { report } from '../src/lib/report.js';
import { allSteps, checkText } from './explain-check.js';

const args = process.argv.slice(2);
const sources = args.flatMap((x, i) => (x === '--source' ? [args[i + 1]] : []));
if (!sources.length) sources.push('scripts/explanations.source.json');
const LENIENT = args.includes('--lenient');
const texts = sources.map(f => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) as Record<string, string> : {}));

const entries: Record<string, { hash: string; text: string; source: string }> = {};
const problems: string[] = [];
for (const f of allSteps(report)) {
  let found = false;
  const tried: string[] = [];
  texts.forEach((t, i) => {
    if (found || !t[f.key]) return;
    const p = checkText(f, report, t[f.key]);
    if (p.length) tried.push(`${f.key} (${sources[i]}): ${p.join('; ')}`);
    else { entries[f.key] = { hash: f.hash, text: t[f.key], source: sources[i].includes('.ai.') ? 'gemini' : 'claude' }; found = true; }
  });
  if (!found) problems.push(...(tried.length ? tried : [`missing text for ${f.key}`]));
}
if (problems.length && !LENIENT) { console.error(problems.join('\n')); process.exit(1); }
if (problems.length) console.warn(`lenient: ${problems.length} steps without a checked explanation; they show plain numbers\n${problems.join('\n')}`);
const out = {
  generatedBy: 'Written by an AI model from the engine facts, then checked by code. The model explains. It does not decide.',
  reportDate: report.date,
  entries,
};
fs.writeFileSync('public/data/explanations.json', JSON.stringify(out, null, 1) + '\n');
console.log(`ok: ${Object.keys(entries).length} explanations written, all numbers match engine facts`);
