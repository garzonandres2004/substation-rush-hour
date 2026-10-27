// Pulls 60 days of real public data for the Utah grid into data/raw/*.json
// Run: node scripts/ingest.mjs   (needs Node 18+ and EIA_API_KEY in .env.local)
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

const DAYS = 60;
const start = `${new Date(Date.now() - DAYS * 864e5).toISOString().slice(0, 10)}T00`;

async function eia(route, facets) {
  const rows = [];
  for (let offset = 0; ; offset += 5000) {
    const p = new URLSearchParams();
    p.set('api_key', KEY);
    p.set('frequency', 'hourly');
    p.set('data[0]', 'value');
    p.set('start', start);
    p.set('sort[0][column]', 'period');
    p.set('sort[0][direction]', 'asc');
    p.set('offset', String(offset));
    p.set('length', '5000');
    p.append('facets[respondent][]', 'PACE');
    for (const [k, vals] of Object.entries(facets)) for (const v of vals) p.append(`facets[${k}][]`, v);
    const res = await fetch(`https://api.eia.gov/v2/electricity/rto/${route}/data/?${p}`);
    if (!res.ok) throw new Error(`EIA ${route} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    const data = j.response.data;
    rows.push(...data);
    if (data.length < 5000) break;
  }
  return rows;
}

const types = { D: 'demand', DF: 'demand_forecast', NG: 'net_generation', TI: 'interchange' };
for (const [t, name] of Object.entries(types)) {
  const rows = await eia('region-data', { type: [t] });
  writeFileSync(`data/raw/eia_${name}.json`, JSON.stringify(rows));
  console.log(`EIA ${name}: ${rows.length} rows, ${rows[0]?.period} to ${rows.at(-1)?.period}`);
}
const fuel = await eia('fuel-type-data', {});
writeFileSync('data/raw/eia_fuel.json', JSON.stringify(fuel));
console.log(`EIA fuel mix: ${fuel.length} rows, fuels: ${[...new Set(fuel.map(r => r.fueltype))].join(',')}`);

const w = new URLSearchParams({
  latitude: '40.76',
  longitude: '-111.89',
  timezone: 'GMT',
  hourly: 'temperature_2m,shortwave_radiation,cloud_cover',
  past_days: String(DAYS),
  forecast_days: '3',
});
const wr = await fetch(`https://api.open-meteo.com/v1/forecast?${w}`);
if (!wr.ok) throw new Error(`Open-Meteo HTTP ${wr.status}`);
const wj = await wr.json();
writeFileSync('data/raw/weather.json', JSON.stringify(wj));
console.log(`Weather: ${wj.hourly.time.length} hours, ${wj.hourly.time[0]} to ${wj.hourly.time.at(-1)}`);
console.log('Done. Files in data/raw/');
