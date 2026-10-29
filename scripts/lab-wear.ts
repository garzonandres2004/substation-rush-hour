// Lab: how much the everyday plan depends on the battery wear cost. The page assumes $3 per MWh of
// throughput. DETOUR (Juan Lizarazo, MIT) assumes Torus Pulse wear at $450 per kWh over 7,500 cycles of
// 85 percent usable energy, $70.6 per MWh discharged, about $35 per MWh of throughput, and Nova Spin at
// $23.6 per MWh discharged. Same 30 days as the main page, same planner (replanning, guard, no charging in
// jam hours), the wear cost both in the plan and in the score. Writes public/data/lab-wear.json.
import fs from 'node:fs';
import { runReplan } from '../src/engine/execute.js';
import { score } from '../src/engine/score.js';
import { actualLoad, aware, backtestDates, days, misses, p } from './common.js';

const COSTS = [3, 8, 15, 25, 35];
const rows = COSTS.map(cost => {
  const A = { ...p.asset, cycleCostPerMWh: cost };
  let value = 0,
    relief = 0,
    throughput = 0,
    daysOver = 0,
    n = 0;
  for (const d of backtestDates) {
    const day = days.get(d);
    if (!day) continue;
    const a0 = actualLoad(day);
    if (a0.some(x => x === undefined)) continue;
    const act = a0 as number[];
    const pk = [...misses.keys()]
      .filter(k => k < d)
      .sort()
      .at(-1);
    const pm = pk ? misses.get(pk)! : [0];
    const s = runReplan(
      A,
      { forecastLoad: day.loadMW, cap: day.capMW, penalty: p.overloadPenalty, margin: 0, ...aware(day) },
      act,
      true,
      pm[pm.length - 1],
    );
    const sc = score({ ...day, loadMW: act }, s, { ...p, asset: A });
    value += sc.netValue;
    relief += sc.congestedEnergyRelievedMWh;
    throughput += s.charge.concat(s.discharge).reduce((x, y) => x + y, 0);
    if (sc.overloadAfterMWh > 0.1) daysOver++;
    n++;
  }
  console.error(cost, (value / n).toFixed(0), (relief / n).toFixed(2), daysOver);
  return {
    costPerMWhThroughput: cost,
    valuePerDay: value / n,
    jamReliefMWhPerDay: relief / n,
    throughputMWhPerDay: throughput / n,
    daysOver,
    days: n,
  };
});
const out = {
  generatedAt: new Date().toISOString(),
  pageAssumption: p.asset.cycleCostPerMWh,
  detour: { pulsePerMWhDischarged: 70.6, spinPerMWhDischarged: 23.6, pulsePerMWhThroughputApprox: 35.3 },
  rows,
};
fs.writeFileSync('public/data/lab-wear.json', `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify(out, null, 1));
