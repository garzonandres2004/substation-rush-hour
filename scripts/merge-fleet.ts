// Merge, Phase 1: the fleet test. Many businesses behind one substation, each running DETOUR's planner
// to cut only its own Rocky Mountain Power bill (carbon weight 0, grid relief 0). We add only what
// their batteries change (grid draw with storage minus site load) to the real substation load, and
// count the hours the substation goes over its limit, with and without the fleet.
// Substation: PACE demand scaled to a 100 MW peak, limit = 95th percentile of the trailing 30 days,
// as on the main page. EIA-930 values are hour ending (eia.gov/electricity/930-content/about.html).
// Sites and stations are DETOUR's simulated archetypes; each copy k gets its own random day noise.
import fs from 'node:fs';
import highsLoader from 'highs';
import { BacktestRunnerHelper } from '../src/detour/core/backtest/backtest-runner.helper';
import type { ILpSolver } from '../src/detour/core/backtest/backtest.interfaces';
import { LpStrategyHelper } from '../src/detour/core/backtest/lp-strategy.helper';
import { NaiveShaverHelper } from '../src/detour/core/backtest/naive-shaver.helper';
import { PlanEngineHelper } from '../src/detour/core/plan/plan-engine.helper';
import type { ILpInput } from '../src/detour/core/plan/plan-engine.interfaces';
import { EmissionsHelper } from '../src/detour/core/signals/emissions.helper';
import { SitesHelper } from '../src/detour/core/sites/sites.helper';
import { tariffSchedules } from '../src/detour/core/tariff/tariff.constants';
import { TimeHelper } from '../src/detour/core/helpers/time.helper';
import { TariffHelper } from '../src/detour/core/tariff/tariff.helper';
import { applyEnvelope } from '../src/merge/envelope';
import { loadGridMonths } from '../src/merge/grid-months';

const MONTHS = (process.argv[2] ?? '2026-01,2026-07').split(',');
const COPIES = Number(process.argv[3] ?? 20); // copies of each site type
const FLEETS = [5, 10, 20].filter(n => n <= COPIES); // copies of each type: 5 means 5 airports + 5 cement plants + 5 ski resorts
const HOUR_MS = 3_600_000;

const gridMonths = loadGridMonths();
const zeroCarbon = (() => {
  const m = EmissionsHelper.marginalSeries(
    EmissionsHelper.buildRows(gridMonths.flatMap(g => g.hours)),
    'fossil-generation',
  );
  return { ...m, points: m.points.map(p => ({ ...p, lbPerMwh: 0 })) };
})();

// Substation load by UTC hour start, and the limit for each local day.
const allHours = gridMonths.flatMap(g => g.hours).filter(h => h.demandMw !== null);
const hourStartMs = (h: { utcHourEnding: string }) => Date.parse(`${h.utcHourEnding}:00:00Z`) - HOUR_MS;
const demandAt = new Map<number, number>(allHours.map(h => [hourStartMs(h), h.demandMw!]));
const localDay = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
function substation(ms: number): { loadMW: number; capMW: number } | null {
  const d = demandAt.get(ms);
  if (d === undefined) return null;
  const dayStart = Date.parse(`${localDay(ms)}T12:00:00Z`) - 6 * HOUR_MS; // close enough to pick the trailing window
  const hist: number[] = [];
  let maxHist = 0;
  for (const [t, v] of demandAt) {
    if (t >= dayStart) continue;
    maxHist = Math.max(maxHist, v);
    if (t >= dayStart - 30 * 24 * HOUR_MS) hist.push(v);
  }
  hist.sort((a, b) => a - b);
  const scale = 100 / maxHist;
  return { loadMW: d * scale, capMW: hist[Math.min(hist.length - 1, Math.floor(0.95 * hist.length))] * scale };
}

async function main(): Promise<void> {
  const highs = await highsLoader();
  const solver: ILpSolver = { solve: async (input: ILpInput) => PlanEngineHelper.solve(highs, input) };
  const out: Record<string, unknown> = {};
  for (const month of MONTHS) {
    const gridMonth = gridMonths.find(g => g.month === month);
    if (!gridMonth) throw new Error(`no grid data for ${month}`);
    // fleet change per UTC hour start, per fleet size, plus per type for the profile
    const deltaByFleet = FLEETS.map(() => new Map<number, number>());
    const bills: Record<string, { saved: number; n: number; each: number[] }> = {};
    const t0 = Date.now();
    for (const base of SitesHelper.listArchetypes()) {
      const schedule = base.scheduleId === 'schedule-8' ? tariffSchedules.SCHEDULE_8 : tariffSchedules.SCHEDULE_6;
      for (let k = 0; k < COPIES; k++) {
        const site = k === 0 ? base : { ...base, id: `${base.id}-${k}` };
        const input = BacktestRunnerHelper.buildInput(
          site,
          schedule,
          SitesHelper.getAssets(base.id)!,
          gridMonth,
          null,
          zeroCarbon,
          month,
          null,
        );
        const result = await BacktestRunnerHelper.run(input, [
          NaiveShaverHelper.noStorage,
          LpStrategyHelper.detour(solver),
        ]);
        const lead = result.lead;
        bills[base.id] ??= { saved: 0, n: 0, each: [] };
        bills[base.id].each.push(Math.round(lead.savings.total));
        bills[base.id].saved += lead.savings.total;
        bills[base.id].n += 1;
        lead.intervals.forEach((iv, i) => {
          const ms = Date.parse(input.intervals[i].startUtc);
          const hour = ms - (ms % HOUR_MS);
          const deltaMW = ((iv.gridKw - input.loadKw[i]) * input.intervals[i].hours) / 1000; // MWh in this 15 min
          FLEETS.forEach((n, f) => {
            if (k < n) deltaByFleet[f].set(hour, (deltaByFleet[f].get(hour) ?? 0) + deltaMW);
          });
        });
      }
    }
    const hours = [...deltaByFleet[0].keys()].sort((a, b) => a - b);
    const monthIntervals = TimeHelper.localMonthIntervals(month);
    const s8OnPeak = TariffHelper.onPeakMask(tariffSchedules.SCHEDULE_8, monthIntervals);
    const onPeakHour = new Set<number>();
    monthIntervals.forEach((iv, i) => {
      if (!s8OnPeak[i]) return;
      const ms = Date.parse(iv.startUtc);
      onPeakHour.add(ms - (ms % HOUR_MS));
    });
    const sub = new Map(hours.map(h => [h, substation(h)]));
    const summarize = (delta: Map<number, number> | null) => {
      let over = 0,
        overMWh = 0,
        peak = 0,
        created = 0,
        relieved = 0;
      const days = new Set<string>();
      const createdDays = new Set<string>();
      for (const h of hours) {
        const s = sub.get(h);
        if (!s) continue;
        const load = s.loadMW + (delta?.get(h) ?? 0);
        peak = Math.max(peak, load);
        const wasOver = s.loadMW > s.capMW + 1e-9;
        const isOver = load > s.capMW + 1e-9;
        if (isOver && !wasOver) {
          created++;
          createdDays.add(localDay(h));
        }
        if (wasOver && !isOver) relieved++;
        if (load > s.capMW + 1e-9) {
          over++;
          overMWh += load - s.capMW;
          days.add(localDay(h));
        }
      }
      return {
        overloadHours: over,
        overloadDays: days.size,
        overloadMWh: +overMWh.toFixed(1),
        peakMW: +peak.toFixed(2),
        hoursCreatedByFleet: created,
        daysWithCreatedHours: createdDays.size,
        hoursRelievedByFleet: relieved,
      };
    };
    const profile = (delta: Map<number, number>) => {
      const sum = Array(24).fill(0),
        cnt = Array(24).fill(0);
      for (const h of hours) {
        const hr = Number(
          new Date(h).toLocaleString('en-US', { timeZone: 'America/Denver', hour: '2-digit', hourCycle: 'h23' }),
        );
        sum[hr] += delta.get(h) ?? 0;
        cnt[hr] += 1;
      }
      return sum.map((s, i) => +(s / Math.max(1, cnt[i])).toFixed(2));
    };
    const fleets = FLEETS.map((n, f) => {
      const d = deltaByFleet[f];
      const vals = hours.map(h => d.get(h) ?? 0);
      const envHours = hours
        .filter(h => sub.get(h))
        .map(h => ({
          ms: h,
          baseMW: sub.get(h)!.loadMW,
          capMW: sub.get(h)!.capMW,
          fleetMW: d.get(h) ?? 0,
          offPeak: !onPeakHour.has(h),
        }));
      const pulseMW = n * (0.8 + 1.0 + 0.3);
      const spinMW = n * (0.5 + 1.0 + 0.3);
      const env = applyEnvelope(envHours, pulseMW + spinMW);
      const guarded = new Map(envHours.map((e, i) => [e.ms, env.fleetMW[i]]));
      return {
        copiesPerType: n,
        sites: n * 3,
        pulseMW: +pulseMW.toFixed(1),
        spinMW: +spinMW.toFixed(1),
        withFleet: summarize(d),
        withGuard: {
          ...summarize(guarded),
          movedMWh: +env.movedMWh.toFixed(1),
          unmovedMWh: +env.unmovedMWh.toFixed(1),
          maxShiftHours: env.maxShiftHours,
          chargedMWh: +vals
            .filter(v => v > 0)
            .reduce((a, b) => a + b, 0)
            .toFixed(1),
        },
        maxChargeMW: +Math.max(...vals).toFixed(2),
        maxDischargeMW: +(-Math.min(...vals)).toFixed(2),
        avgByLocalHour: profile(d),
      };
    });
    out[month] = {
      noFleet: summarize(null),
      fleets,
      savedPerSitePerMonth: Object.fromEntries(Object.entries(bills).map(([id, b]) => [id, Math.round(b.saved / b.n)])),
      savedEachSite: Object.fromEntries(Object.entries(bills).map(([id, b]) => [id, b.each])),
    };
    console.log(`${month}: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    const o = out[month] as any;
    console.log('  no fleet', JSON.stringify(o.noFleet));
    for (const f of o.fleets) {
      console.log(
        `  ${f.sites} sites ${f.pulseMW} MW alone `,
        JSON.stringify(f.withFleet),
        'max charge',
        f.maxChargeMW,
      );
      console.log(`  ${f.sites} sites ${f.pulseMW} MW guard `, JSON.stringify(f.withGuard));
    }
    console.log('  saved per site per month', JSON.stringify(o.savedPerSitePerMonth));
  }
  fs.writeFileSync(
    process.env.OUT ?? 'public/data/merge-fleet.json',
    JSON.stringify({ generatedAt: new Date().toISOString(), months: out }, null, 1),
  );
}
main();
