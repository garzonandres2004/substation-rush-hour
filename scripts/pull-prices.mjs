// Pulls real CAISO day-ahead prices (LMP, congestion MCC, energy MCE, loss MCL) for PacifiCorp East nodes.
// Run: node scripts/pull-prices.mjs     (needs the `unzip` command, present on macOS)
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

mkdirSync('data/raw', { recursive: true });
const NODES = ['TH_PACE_GEN-APND', 'ELAP_PACE-APND'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt = d => `${d.toISOString().slice(0, 10).replace(/-/g, '')}T07:00-0000`;
const day = n => new Date(Date.now() + n * 864e5);
// windows of 10 days from 40 days back to 2 days ahead
const windows = [];
for (let s = -40; s < 2; s += 10) windows.push([s, Math.min(s + 10, 2)]);

function parseCsv(text) {
  const lines = text.trim().split('\n');
  const head = lines[0].split(',');
  const ix = k => head.indexOf(k);
  return lines.slice(1).map(l => {
    const c = l.split(',');
    return {
      start: c[ix('INTERVALSTARTTIME_GMT')],
      node: c[ix('NODE')],
      type: c[ix('LMP_TYPE')],
      value: Number(c[ix('MW')]),
    };
  });
}

for (const node of NODES) {
  const all = [];
  for (const [a, b] of windows) {
    const url = `https://oasis.caiso.com/oasisapi/SingleZip?queryname=PRC_LMP&startdatetime=${fmt(day(a))}&enddatetime=${fmt(day(b))}&version=1&market_run_id=DAM&node=${node}&resultformat=6`;
    const res = await fetch(url, { redirect: 'follow' });
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync('data/raw/_tmp.zip', buf);
    try {
      const csv = execFileSync('unzip', ['-p', 'data/raw/_tmp.zip'], { maxBuffer: 1e8 }).toString();
      if (!csv.startsWith('INTERVALSTARTTIME_GMT')) throw new Error(csv.slice(0, 200));
      const rows = parseCsv(csv);
      all.push(...rows);
      console.log(node, `window ${a}..${b}: ${rows.length} rows`);
    } catch (e) {
      console.log(node, `window ${a}..${b}: no data (${String(e.message).slice(0, 120).replace(/\n/g, ' ')})`);
    }
    await sleep(6000);
  }
  writeFileSync(`data/raw/lmp_${node}.json`, JSON.stringify(all));
  const lmp = all.filter(r => r.type === 'LMP');
  console.log(
    node,
    'total',
    all.length,
    'rows, LMP hours:',
    lmp.length,
    'first',
    lmp[0]?.start,
    'last',
    lmp.at(-1)?.start,
  );
}
console.log('Done.');
