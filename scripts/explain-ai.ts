// AI at the edge (AI-02, AI-05, AI-08): asks Gemini for a plain English explanation of each battery
// step the hand written texts no longer cover, in ONE request a day. Every answer is checked by code
// (explain-check.ts); failures get one retry with the problems listed, then fall back to plain numbers.
// Writes scripts/explanations.ai.json. Needs GEMINI_API_KEY; without it, it does nothing.
// Optional: GEMINI_MODEL (otherwise the newest Flash-Lite model the key can use).
import fs from 'node:fs';
import { report } from '../src/lib/report.js';
import { EXPLAIN_PROMPT } from '../src/lib/prompts.js';
import { allSteps, checkText, factsFor } from './explain-check.js';

const KEY = process.env.GEMINI_API_KEY;
const OUT = 'scripts/explanations.ai.json';
const API = 'https://generativelanguage.googleapis.com/v1beta';
if (!KEY && !process.env.GEMINI_MOCK_FILE) { console.log('explain-ai: no GEMINI_API_KEY, skipping'); fs.writeFileSync(OUT, '{}\n'); process.exit(0); }

const hand: Record<string, string> = JSON.parse(fs.readFileSync('scripts/explanations.source.json', 'utf8'));
const steps = allSteps(report);
const todo = steps.filter(f => !(hand[f.key] && checkText(f, report, hand[f.key]).length === 0));
if (!todo.length) { console.log('explain-ai: hand written texts cover every step'); fs.writeFileSync(OUT, '{}\n'); process.exit(0); }

async function pickModel(): Promise<string> {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;
  const res = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': KEY! } });
  if (!res.ok) throw new Error(`list models HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const names: string[] = ((await res.json()).models ?? [])
    .filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .map((m: any) => String(m.name).replace(/^models\//, ''))
    .filter((n: string) => /^gemini-[\d.]+-flash/.test(n) && !/preview|exp|tts|image|live|audio|thinking/.test(n));
  const ver = (n: string) => parseFloat(n.split('-')[1]);
  const lite = names.filter(n => n.includes('flash-lite')).sort((a, b) => ver(b) - ver(a));
  const flash = names.filter(n => !n.includes('lite')).sort((a, b) => ver(b) - ver(a));
  const pick = lite[0] ?? flash[0];
  if (!pick) throw new Error(`no Flash model available to this key (${names.join(', ')})`);
  return pick;
}

async function ask(model: string, prompt: string): Promise<Record<string, string>> {
  if (process.env.GEMINI_MOCK_FILE) return JSON.parse(fs.readFileSync(process.env.GEMINI_MOCK_FILE, 'utf8'));
  const res = await fetch(`${API}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY! },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.3 } }),
  });
  if (!res.ok) throw new Error(`generateContent HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const text = (await res.json()).candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
  const obj = JSON.parse(text);
  if (typeof obj !== 'object' || Array.isArray(obj)) throw new Error('model did not return a JSON object');
  return obj;
}

const instructions = (facts: unknown[], feedback = '') => `${EXPLAIN_PROMPT}

You get several steps at once. Return ONE JSON object: each key is a step's "key" exactly as given, each value is that step's explanation as a plain string. Write numbers exactly as they appear in the facts (same rounding), or leave them out. Clock times like "6 PM" are fine.
${feedback}
Steps:
${JSON.stringify(facts, null, 1)}`;

try {
  const model = process.env.GEMINI_MOCK_FILE ? 'mock' : await pickModel();
  console.log(`explain-ai: ${todo.length} steps, model ${model}`);
  const out: Record<string, string> = {};
  const first = await ask(model, instructions(todo.map(f => factsFor(f, report))));
  const retry: { f: typeof todo[number]; problems: string[] }[] = [];
  for (const f of todo) {
    const t = typeof first[f.key] === 'string' ? first[f.key].trim() : '';
    const p = t ? checkText(f, report, t) : ['no text returned'];
    if (p.length) retry.push({ f, problems: p }); else out[f.key] = t;
  }
  if (retry.length) {
    const feedback = `Your previous answers for these steps failed our checks. Fix them:\n${retry.map(r => `${r.f.key}: ${r.problems.join('; ')}`).join('\n')}\n`;
    const second = await ask(model, instructions(retry.map(r => factsFor(r.f, report)), feedback));
    for (const r of retry) {
      const t = typeof second[r.f.key] === 'string' ? second[r.f.key].trim() : '';
      if (t && checkText(r.f, report, t).length === 0) out[r.f.key] = t;
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`explain-ai: ${Object.keys(out).length} of ${todo.length} passed the checks`);
} catch (e) {
  // Never break the daily refresh over an explanation: the page shows plain numbers instead.
  console.warn(`explain-ai: skipped (${(e as Error).message})`);
  fs.writeFileSync(OUT, '{}\n');
}
