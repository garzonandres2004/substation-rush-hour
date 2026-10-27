// Pulls July and August 2026 hourly demand and EIA's own day ahead demand forecast for PacifiCorp East.
// Used only by the summer capacity test (scripts/summer.ts). Run on a computer with internet:
//   node scripts/pull-summer.mjs        (needs EIA_API_KEY in .env.local, like ingest.mjs)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}
const KEY = process.env.EIA_API_KEY;
if (!KEY) throw new Error('EIA_API_KEY missing in .env.local');
mkdirSync('data/raw', { recursive: true });

const START = '2026-07-01T00', END = '2026-09-01T00';
async function eia(type) {
  const rows = [];
  for (let offset = 0; ; offset += 5000) {
    const p = new URLSearchParams();
    p.set('api_key', KEY);
    p.set('frequency', 'hourly');
    p.set('data[0]', 'value');
    p.set('start', START);
    p.set('end', END);
    p.set('sort[0][column]', 'period');
    p.set('sort[0][direction]', 'asc');
    p.set('offset', String(offset));
    p.set('length', '5000');
    p.append('facets[respondent][]', 'PACE');
    p.append('facets[type][]', type);
    const res = await fetch(`https://api.eia.gov/v2/electricity/rto/region-data/data/?${p}`);
    if (!res.ok) throw new Error(`EIA ${type} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()).response.data;
    rows.push(...data);
    if (data.length < 5000) break;
  }
  return rows;
}
for (const [type, name] of [['D', 'summer_demand'], ['DF', 'summer_demand_forecast']]) {
  const rows = await eia(type);
  writeFileSync(`data/raw/${name}.json`, JSON.stringify(rows));
  console.log(`${name}: ${rows.length} rows, ${rows[0]?.period} to ${rows.at(-1)?.period}`);
}
console.log('Done. Now tell Claude the summer pull finished.');
