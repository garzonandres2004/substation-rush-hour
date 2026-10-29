// Keep every day's forecast. The daily refresh overwrites public/data/report.json with the next
// day's forecast; this copies the part the history page needs into public/data/archive/<date>.json
// and lists the saved days in public/data/archive/index.json.
// Usage: tsx scripts/archive.ts [path to a report.json]
import fs from 'node:fs';
import { fingerprint } from '../src/lib/fingerprint.js';

const src = process.argv[2] ?? 'public/data/report.json';
const DIR = 'public/data/archive';
const r = JSON.parse(fs.readFileSync(src, 'utf8'));
const sc = r.scenarios.normal;
const n2 = (x: number) => Math.round(x * 100) / 100;
const day = {
  date: r.date,
  generatedAt: r.generatedAt,
  capMW: n2(sc.capMW),
  jamThreshold: r.params.congestedThreshold,
  hours: sc.hours.map((h: any) => ({
    h: h.hourLocal,
    stress: Math.round(h.stress * 1000) / 1000,
    congested: h.congested,
    loadMW: n2(h.loadBefore),
    charge: n2(h.aware.charge),
    discharge: n2(h.aware.discharge),
    afterMW: n2(h.aware.loadAfter),
  })),
};
const saved = { ...day, fingerprint: await fingerprint(day) };
fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(`${DIR}/${day.date}.json`, `${JSON.stringify(saved)}\n`);
const dates = fs
  .readdirSync(DIR)
  .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .map(f => f.slice(0, 10))
  .sort();
fs.writeFileSync(`${DIR}/index.json`, `${JSON.stringify({ dates })}\n`);
console.log(`archived ${day.date} (${saved.fingerprint.slice(0, 12)}); ${dates.length} days saved`);
