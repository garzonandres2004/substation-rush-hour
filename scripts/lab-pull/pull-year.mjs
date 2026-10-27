// Lab data pull, run by .github/workflows/lab-data.yml on GitHub (needs internet and EIA_API_KEY).
// Pulls a long window of free, open data for PacifiCorp East into lab-data/ as gzipped JSON:
//   EIA hourly demand, EIA day ahead demand forecast, net generation, interchange, fuel mix
//   CAISO day ahead prices at TH_PACE_GEN-APND (logs which windows have data)
//   Open-Meteo observed weather (archive) and the day ahead weather forecast as it was issued
// Every step logs to lab-data/pull-log.txt and keeps going if one source fails.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const OUT = 'lab-data';
mkdirSync(OUT, { recursive: true });
const START = process.env.LAB_START ?? '2025-10-01';
const END = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
const log = msg => {
  console.log(msg);
  appendFileSync(`${OUT}/pull-log.txt`, `${new Date().toISOString()} ${msg}\n`);
};
const save = (name, data) => {
  const buf = gzipSync(Buffer.from(JSON.stringify(data)));
  writeFileSync(`${OUT}/${name}.json.gz`, buf);
  log(`saved ${name}.json.gz (${(buf.length / 1e6).toFixed(2)} MB)`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const step = async (name, f) => {
  try {
    await f();
  } catch (e) {
    log(`FAILED ${name}: ${String(e?.message ?? e).slice(0, 300)}`);
  }
};
log(`window ${START} to ${END}`);

// ---------- EIA ----------
const KEY = process.env.EIA_API_KEY;
async function eia(route, facets) {
  const rows = [];
  for (let offset = 0; ; offset += 5000) {
    const p = new URLSearchParams();
    p.set('api_key', KEY);
    p.set('frequency', 'hourly');
    p.set('data[0]', 'value');
    p.set('start', `${START}T00`);
    p.set('end', `${END}T00`);
    p.set('sort[0][column]', 'period');
    p.set('sort[0][direction]', 'asc');
    p.set('offset', String(offset));
    p.set('length', '5000');
    p.append('facets[respondent][]', 'PACE');
    for (const [k, vals] of Object.entries(facets)) for (const v of vals) p.append(`facets[${k}][]`, v);
    const res = await fetch(`https://api.eia.gov/v2/electricity/rto/${route}/data/?${p}`);
    if (!res.ok) throw new Error(`EIA ${route} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()).response.data;
    rows.push(...data);
    if (data.length < 5000) break;
    await sleep(300);
  }
  return rows;
}
await step('EIA', async () => {
  if (!KEY) throw new Error('EIA_API_KEY missing');
  for (const [t, name] of Object.entries({
    D: 'demand',
    DF: 'demand_forecast',
    NG: 'net_generation',
    TI: 'interchange',
  })) {
    const rows = await eia('region-data', { type: [t] });
    log(`EIA ${name}: ${rows.length} rows, ${rows[0]?.period} to ${rows.at(-1)?.period}`);
    save(`eia_${name}`, rows);
  }
  const fuel = await eia('fuel-type-data', {});
  log(`EIA fuel: ${fuel.length} rows`);
  save('eia_fuel', fuel);
});

// ---------- CAISO day ahead prices ----------
await step('CAISO', async () => {
  const node = 'TH_PACE_GEN-APND';
  const all = [];
  const fmt = d => `${d.toISOString().slice(0, 10).replace(/-/g, '')}T07:00-0000`;
  for (let a = new Date(`${START}T00:00:00Z`); a < new Date(`${END}T00:00:00Z`); ) {
    const b = new Date(Math.min(a.getTime() + 30 * 864e5, new Date(`${END}T00:00:00Z`).getTime()));
    const url = `https://oasis.caiso.com/oasisapi/SingleZip?queryname=PRC_LMP&startdatetime=${fmt(a)}&enddatetime=${fmt(b)}&version=1&market_run_id=DAM&node=${node}&resultformat=6`;
    const res = await fetch(url, { redirect: 'follow' });
    writeFileSync(`${OUT}/_tmp.zip`, Buffer.from(await res.arrayBuffer()));
    try {
      const csv = execFileSync('unzip', ['-p', `${OUT}/_tmp.zip`], { maxBuffer: 2e8 }).toString();
      if (!csv.startsWith('INTERVALSTARTTIME_GMT')) throw new Error(csv.slice(0, 160));
      const lines = csv.trim().split('\n');
      const head = lines[0].split(',');
      const ix = k => head.indexOf(k);
      const rows = lines.slice(1).map(l => {
        const c = l.split(',');
        return {
          start: c[ix('INTERVALSTARTTIME_GMT')],
          node: c[ix('NODE')],
          type: c[ix('LMP_TYPE')],
          value: Number(c[ix('MW')]),
        };
      });
      all.push(...rows);
      log(`CAISO ${a.toISOString().slice(0, 10)}: ${rows.length} rows`);
    } catch (e) {
      log(`CAISO ${a.toISOString().slice(0, 10)}: no data (${String(e.message).replace(/\n/g, ' ').slice(0, 140)})`);
    }
    a = b;
    await sleep(6000);
  }
  save('lmp_TH_PACE_GEN-APND', all);
});

// ---------- Open-Meteo ----------
const LAT = '40.76',
  LON = '-111.89';
await step('weather observed', async () => {
  const archiveEnd = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
  const q = new URLSearchParams({
    latitude: LAT,
    longitude: LON,
    timezone: 'GMT',
    start_date: START,
    end_date: archiveEnd,
    hourly: 'temperature_2m,shortwave_radiation,cloud_cover',
  });
  const r = await fetch(`https://archive-api.open-meteo.com/v1/archive?${q}`);
  const j = await r.json();
  if (!j.hourly) throw new Error(JSON.stringify(j).slice(0, 200));
  log(`weather observed: ${j.hourly.time.length} hours, ${j.hourly.time[0]} to ${j.hourly.time.at(-1)}`);
  save('weather_observed', j);
});
await step('weather issued day ahead', async () => {
  const vars = ['temperature_2m', 'shortwave_radiation', 'cloud_cover'].map(v => `${v}_previous_day1`).join(',');
  const tries = [
    new URLSearchParams({
      latitude: LAT,
      longitude: LON,
      timezone: 'GMT',
      hourly: vars,
      start_date: START,
      end_date: END,
    }),
    new URLSearchParams({
      latitude: LAT,
      longitude: LON,
      timezone: 'GMT',
      hourly: vars,
      past_days: '92',
      forecast_days: '2',
    }),
  ];
  for (const q of tries) {
    const r = await fetch(`https://previous-runs-api.open-meteo.com/v1/forecast?${q}`);
    const j = await r.json();
    if (j.hourly) {
      const t = j.hourly.time;
      const k = Object.keys(j.hourly).find(x => x.startsWith('temperature'));
      const firstGood = t[j.hourly[k].findIndex(x => x !== null)];
      log(
        `weather issued (${q.has('start_date') ? 'start_date' : 'past_days'}): ${t.length} hours, ${t[0]} to ${t.at(-1)}, first value ${firstGood}`,
      );
      save('weather_issued', j);
      return;
    }
    log(`weather issued try failed: ${JSON.stringify(j).slice(0, 200)}`);
  }
  throw new Error('no issued weather');
});
log('done');
