// Merge, full stack: the utility's own Torus Station at the substation, and the fleet of customer
// batteries behind it (DETOUR's businesses, see merge-fleet.ts), over the same months.
// The Station plans each day exactly as on the main page and in lab section A: the night before, on
// the weather forecast issued then, replanned every hour, with the guard on the meter, its charge
// carried from day to day. The utility sees the fleet's planned charging (published under room
// trading), so the Station's forecast load includes it. Graded on real demand plus what the fleet did.
// Needs data/lab-raw/fleet-deltas.json from merge-fleet.ts and lab-data/*.json.gz.
// Writes public/data/merge-fullstack.json.
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { runReplan } from '../src/engine/execute.js';
import { loadHours } from '../src/engine/merge.js';
import { PARAMS as p } from '../src/engine/params.js';
import { buildDay } from '../src/engine/stress.js';
import { localDate } from '../src/engine/time.js';
import type { DayInputs, Hour, Params } from '../src/engine/types.js';

const RAW = 'data/lab-raw';
const gz = (f: string) => JSON.parse(gunzipSync(fs.readFileSync(`lab-data/${f}.json.gz`)).toString());
const issuedRaw = gz('weather_issued').hourly;
const key = (s: string) => `${s.slice(0, 13)}:00:00Z`;
const issued = new Map<string, { temp: number; rad: number; cloud: number }>();
issuedRaw.time.forEach((t: string, i: number) => {
  const temp = issuedRaw.temperature_2m_previous_day1[i];
  const rad = issuedRaw.shortwave_radiation_previous_day1[i];
  const cloud = issuedRaw.cloud_cover_previous_day1[i];
  if (temp !== null && rad !== null && cloud !== null) issued.set(key(t), { temp, rad, cloud });
});
const all = loadHours(RAW);
const NO_PRICE: Params = { ...p, stressWeights: { demand: 0.4, netLoad: 0.4, ramp: 0.2, price: 0 } };
function dayIssued(d: string): { day: DayInputs; priced: boolean } | null {
  const dayHours = all.filter(h => localDate(h.t) === d);
  if (dayHours.length !== 24 || dayHours.some(h => !issued.has(h.t))) return null;
  const priced = dayHours.every(h => h.lmp !== undefined);
  const swapped: Hour[] = dayHours.map(h => ({ ...h, ...issued.get(h.t)!, lmp: priced ? h.lmp : 0 }));
  const hist = all.filter(h => h.t < dayHours[0].t);
  const day = buildDay([...hist, ...swapped], d, priced ? p : NO_PRICE);
  return day ? { day, priced } : null;
}

const deltas = JSON.parse(fs.readFileSync(`${RAW}/fleet-deltas.json`, 'utf8')) as Record<
  'alone' | 'guard' | 'tradedAndGuard',
  Record<string, number>
>;
const fleetAt = (which: keyof typeof deltas, t: string) => deltas[which][String(Date.parse(t))] ?? 0;

const FIRST = process.argv[2] ?? '2025-11-01';
const LAST = process.argv[3] ?? '2026-09-30';
const A = p.asset;
const START = A.energyMWh * A.startSocFrac;
type Cfg =
  | 'none'
  | 'fleetAlone'
  | 'fleetGuard'
  | 'fleetTraded'
  | 'station'
  | 'stationFleetAlone'
  | 'stationFleetTraded';
const CFGS: Cfg[] = [
  'none',
  'fleetAlone',
  'fleetGuard',
  'fleetTraded',
  'station',
  'stationFleetAlone',
  'stationFleetTraded',
];
const FLEET_OF: Record<Cfg, keyof typeof deltas | null> = {
  none: null,
  fleetAlone: 'alone',
  fleetGuard: 'guard',
  fleetTraded: 'tradedAndGuard',
  station: null,
  stationFleetAlone: 'alone',
  stationFleetTraded: 'tradedAndGuard',
};
const HAS_STATION = (c: Cfg) => c.startsWith('station');
const carry: Record<string, number> = { station: START, stationFleetAlone: START, stationFleetTraded: START };
const tot = Object.fromEntries(CFGS.map(c => [c, { hours: 0, mwh: 0, created: 0, days: new Set<string>() }]));
let prevMiss = 0;
let days = 0;
const dates = [...new Set(all.map(h => localDate(h.t)))].filter(d => d >= FIRST && d <= LAST).sort();
for (const d of dates) {
  const got = dayIssued(d);
  if (!got) continue;
  const { day, priced } = got;
  const actRaw = day.actual!.demand;
  if (actRaw.some(x => x === undefined)) continue;
  const k = day.loadMW[0] / day.demandHat[0];
  const act0 = actRaw.map(x => x! * k);
  const prem = priced ? p.stressPremium : NO_PRICE.stressPremium;
  const signal = day.lmp.map((x, i) => x + prem * day.stress[i]);
  const caps = Array.isArray(day.capMW) ? day.capMW : Array(24).fill(day.capMW);
  const TOL_MW = 0.001; // 1 kW: the saved fleet power is rounded to 0.1 kW
  const baseOver = act0.map((l, i) => l > caps[i] + TOL_MW);
  for (const c of CFGS) {
    const fleet = FLEET_OF[c];
    const f = day.t.map(t => (fleet ? fleetAt(fleet, t) : 0));
    const act = act0.map((l, i) => l + f[i]);
    let net = Array(24).fill(0);
    if (HAS_STATION(c)) {
      const s = runReplan(
        A,
        {
          signal,
          forecastLoad: day.loadMW.map((l, i) => l + f[i]),
          cap: day.capMW,
          penalty: p.overloadPenalty,
          margin: 0,
        },
        act,
        true,
        prevMiss,
        carry[c],
      );
      carry[c] = s.soc[23];
      net = s.charge.map((x, i) => x - s.discharge[i]);
    }
    for (let i = 0; i < 24; i++) {
      const load = act[i] + net[i];
      if (load > caps[i] + TOL_MW) {
        tot[c].hours++;
        tot[c].mwh += load - caps[i];
        tot[c].days.add(d);
        if (!baseOver[i]) tot[c].created++;
      }
    }
  }
  prevMiss = act0[23] - day.loadMW[23];
  days++;
}
const result = Object.fromEntries(
  CFGS.map(c => [
    c,
    {
      overloadHours: tot[c].hours,
      overloadDays: tot[c].days.size,
      overloadMWh: +tot[c].mwh.toFixed(1),
      hoursNotOverWithoutBatteries: tot[c].created,
    },
  ]),
);
const out = {
  generatedAt: new Date().toISOString(),
  first: FIRST,
  last: LAST,
  days,
  station: `${A.powerMW} MW, ${A.energyMWh} MWh`,
  fleet: '60 businesses (DETOUR archetypes), 42 MW of Pulse batteries',
  result,
};
fs.writeFileSync('public/data/merge-fullstack.json', `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify(out, null, 1));
