import fs from 'node:fs';
import { report } from '../src/lib/report.js';
import { directions } from '../src/lib/directions.js';

const jam = report.params.congestedThreshold;
const out: any[] = [];
for (const sk of ['normal', 'derate'] as const) {
  for (const st of ['aware', 'priceOnly'] as const) {
    const sc = report.scenarios[sk];
    for (const s of directions(sc, st, jam)) {
      const rows = sc.hours.filter(h => h.hourLocal >= s.start && h.hourLocal <= s.end);
      out.push({ key: `${sk}|${st}|${s.kind}|${s.start}-${s.end}`, title: s.title, body: s.body, capMW: sc.capMW,
        hours: rows.map(h => ({ h: h.hourLocal, lmp: +h.lmp.toFixed(1), mcc: +h.mcc.toFixed(1), stress: +h.stress.toFixed(2), before: +h.loadBefore.toFixed(1), after: +h[st].loadAfter.toFixed(1), soc: +h[st].soc.toFixed(1), c: +h[st].charge.toFixed(1), d: +h[st].discharge.toFixed(1) })) });
    }
  }
}
console.log(JSON.stringify({ date: report.date, jam, steps: out }, null, 1));
