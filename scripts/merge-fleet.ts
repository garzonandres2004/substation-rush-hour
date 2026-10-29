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
import { type GuardSite, guardSites } from '../src/merge/site-guard';
import { envelopeHighs } from '../src/merge/two-bosses';
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
// EIA's day ahead demand forecast: what a utility would know the day before when it publishes room
const forecastAt = new Map<number, number>(
  gridMonths
    .flatMap(g => g.hours)
    .filter(h => h.dayAheadForecastMw !== null)
    .map(h => [hourStartMs(h), h.dayAheadForecastMw!]),
);
const localDay = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
function substation(ms: number): { loadMW: number; capMW: number; forecastMW: number } | null {
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
  return {
    loadMW: d * scale,
    capMW: hist[Math.min(hist.length - 1, Math.floor(0.95 * hist.length))] * scale,
    forecastMW: (forecastAt.get(ms) ?? d) * scale,
  };
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
    type Run = {
      k: number;
      typeId: string;
      input: ReturnType<typeof BacktestRunnerHelper.buildInput>;
      lead: Awaited<ReturnType<typeof BacktestRunnerHelper.run>>['lead'];
      baselineBill: number;
      aloneSaved: number; // what this business saves running DETOUR alone: the yardstick for "kept"
    };
    const runs: Run[] = [];
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
        runs.push({
          k,
          typeId: base.id,
          input,
          lead,
          baselineBill: result.baseline.bill.total,
          aloneSaved: result.baseline.bill.total - lead.bill.total,
        });
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
    // The guard site by site: each business moves its own charging, then is billed again.
    const siteGuard = (subset: Run[]) => {
      const intervals = subset[0].input.intervals;
      const T = intervals.length;
      const hourOf = intervals.map(iv => {
        const ms = Date.parse(iv.startUtc);
        return ms - (ms % HOUR_MS);
      });
      const baseMW = hourOf.map(h => sub.get(h)?.loadMW ?? 0);
      const capMW = hourOf.map(h => sub.get(h)?.capMW ?? Number.POSITIVE_INFINITY);
      const sites: GuardSite[] = subset.map(r => {
        const pulse = r.input.assets.pulse;
        const minKwh = pulse.minSocFraction * pulse.energyKwh;
        const isS8 = r.input.schedule.demandBasis === 'on-peak';
        return {
          id: r.input.site.id,
          gridKw: r.lead.intervals.map(iv => iv.gridKw),
          pulseChargeKw: r.lead.intervals.map(iv => iv.pulseChargeKw),
          pulseDischargeKw: r.lead.intervals.map(iv => iv.pulseDischargeKw),
          pulseSocKwh: r.lead.intervals.map(iv => iv.pulseSocKwh),
          noChargeMove: r.input.onPeakMask.map(m => isS8 && m),
          floorKwh: r.input.rushHourMask.map(rush => minKwh + (rush ? r.input.wattsmartReserveKwh : 0)),
          topKwh: pulse.maxSocFraction * pulse.energyKwh,
          powerKw: pulse.powerKw,
          chargeEfficiency: pulse.chargeEfficiency,
          loadKw: r.input.loadKw,
          gridCapKw: Math.max(...r.lead.intervals.map(iv => iv.gridKw)),
        };
      });
      const res = guardSites(sites, baseMW, capMW);
      const delta = new Map<number, number>();
      const kept: Record<string, number[]> = {};
      let savedBefore = 0;
      let savedAfter = 0;
      let worstChange = 0;
      sites.forEach((s, i) => {
        const r = subset[i];
        for (let t = 0; t < T; t++)
          delta.set(hourOf[t], (delta.get(hourOf[t]) ?? 0) + ((s.gridKw[t] - s.loadKw[t]) * intervals[t].hours) / 1000);
        const bill = TariffHelper.monthlyBill(r.input.schedule, intervals, s.gridKw).total;
        const before = r.aloneSaved;
        const after = r.baselineBill - bill;
        savedBefore += before;
        savedAfter += after;
        worstChange = Math.min(worstChange, after - before);
        kept[r.typeId] ??= [];
        kept[r.typeId].push(before > 0 ? after / before : 1);
      });
      const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
      return {
        delta,
        stats: {
          movedMWh: +(res.movedKwh / 1000).toFixed(1),
          unmovedMWh: +(res.unmovedKwh / 1000).toFixed(1),
          maxShiftHours: +(res.maxShiftSteps / 4).toFixed(2),
          savedBeforeUsd: Math.round(savedBefore),
          savedAfterUsd: Math.round(savedAfter),
          savingsKeptPct: +((100 * savedAfter) / savedBefore).toFixed(2),
          worstSiteKeptPct: +(100 * Math.min(...Object.values(kept).flat())).toFixed(2),
          worstSiteChangeUsd: Math.round(worstChange),
          keptPctByType: Object.fromEntries(Object.entries(kept).map(([id, v]) => [id, +(100 * mean(v)).toFixed(2)])),
        },
      };
    };
    // One plan, two bosses: every business plans again with the substation's published room in its plan.
    const twoBosses = new Map<
      number,
      { delta: Map<number, number>; stats: Record<string, number>; combined: ReturnType<typeof siteGuard> }
    >();
    const subMemo = new Map<number, ReturnType<typeof substation>>();
    const subAt = (h: number) => {
      if (!subMemo.has(h)) subMemo.set(h, sub.get(h) ?? substation(h));
      return subMemo.get(h)!;
    };
    // Room for each business: by battery size (fixed slices), or traded by need: in each 15 minutes the
    // room goes first to the businesses that want to charge then (from their plans made alone), in
    // proportion to how much, and only what is left is shared by battery size.
    const planWithRoom = async (n: number, mode: 'size' | 'traded') => {
      const subset = runs.filter(r => r.k < n);
      const fleetPulseKw = subset.reduce((a, r) => a + r.input.assets.pulse.powerKw, 0);
      const desire = new Map<string, Map<number, number>>(); // site -> interval start -> kW it wants to charge
      const totalDesire = new Map<number, number>();
      for (const r of subset) {
        const m = new Map<number, number>();
        r.lead.intervals.forEach((iv, i) => {
          const ms = Date.parse(r.input.intervals[i].startUtc);
          const want = Math.max(0, iv.gridKw - r.input.loadKw[i]);
          m.set(ms, want);
          totalDesire.set(ms, (totalDesire.get(ms) ?? 0) + want);
        });
        desire.set(r.input.site.id, m);
      }
      const delta = new Map<number, number>();
      let savedBefore = 0;
      let savedAfter = 0;
      let worst = Number.POSITIVE_INFINITY;
      let worstChange = 0;
      const planned: Run[] = [];
      for (const r of subset) {
        const sizeShare = r.input.assets.pulse.powerKw / fleetPulseKw;
        const mine = desire.get(r.input.site.id)!;
        const solver: ILpSolver = {
          solve: async (lp: ILpInput) => {
            const env = lp.intervals.map((iv, t) => {
              const ms = Date.parse(iv.startUtc);
              const s = subAt(ms - (ms % HOUR_MS));
              const roomKw = s ? Math.max(0, (s.capMW - s.forecastMW) * 1000) : Number.POSITIVE_INFINITY;
              if (!Number.isFinite(roomKw)) return lp.loadKw[t] + 1e7;
              if (mode === 'size') return lp.loadKw[t] + sizeShare * roomKw;
              const want = mine.get(ms) ?? 0;
              const all = totalDesire.get(ms) ?? 0;
              const share = all <= roomKw ? want + (roomKw - all) * sizeShare : (roomKw * want) / all;
              return lp.loadKw[t] + share;
            });
            return PlanEngineHelper.solve(envelopeHighs(highs, env, lp.intervals[0]?.hours ?? 0.25) as any, lp);
          },
        };
        const res = await BacktestRunnerHelper.run(r.input, [
          NaiveShaverHelper.noStorage,
          LpStrategyHelper.detour(solver),
        ]);
        res.lead.intervals.forEach((iv, i) => {
          const ms = Date.parse(r.input.intervals[i].startUtc);
          const h = ms - (ms % HOUR_MS);
          delta.set(h, (delta.get(h) ?? 0) + ((iv.gridKw - r.input.loadKw[i]) * r.input.intervals[i].hours) / 1000);
        });
        const before = r.aloneSaved;
        const after = res.baseline.bill.total - res.lead.bill.total;
        savedBefore += before;
        savedAfter += after;
        if (before > 0) worst = Math.min(worst, after / before);
        worstChange = Math.min(worstChange, after - before);
        planned.push({ ...r, lead: res.lead, baselineBill: res.baseline.bill.total });
      }
      return {
        delta,
        stats: {
          savedBeforeUsd: Math.round(savedBefore),
          savedAfterUsd: Math.round(savedAfter),
          savingsKeptPct: +((100 * savedAfter) / savedBefore).toFixed(2),
          worstSiteKeptPct: +(100 * worst).toFixed(2),
          worstSiteChangeUsd: Math.round(worstChange),
        },
        combined: siteGuard(planned), // plan with the room, then the guard on the meter
      };
    };
    const traded = new Map<number, Awaited<ReturnType<typeof planWithRoom>>>();
    for (const n of FLEETS) {
      twoBosses.set(n, await planWithRoom(n, 'size'));
      traded.set(n, await planWithRoom(n, 'traded'));
    }
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
      const site = siteGuard(runs.filter(r => r.k < n));
      const two = twoBosses.get(n)!;
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
        withSiteGuard: { ...summarize(site.delta), ...site.stats },
        twoBosses: { ...summarize(two.delta), ...two.stats },
        planAndGuard: { ...summarize(two.combined.delta), ...two.combined.stats },
        traded: { ...summarize(traded.get(n)!.delta), ...traded.get(n)!.stats },
        tradedAndGuard: { ...summarize(traded.get(n)!.combined.delta), ...traded.get(n)!.combined.stats },
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
      console.log(`  ${f.sites} sites ${f.pulseMW} MW site guard`, JSON.stringify(f.withSiteGuard));
      console.log(`  ${f.sites} sites ${f.pulseMW} MW two bosses`, JSON.stringify(f.twoBosses));
      console.log(`  ${f.sites} sites ${f.pulseMW} MW plan+guard`, JSON.stringify(f.planAndGuard));
      console.log(`  ${f.sites} sites ${f.pulseMW} MW traded+guard`, JSON.stringify(f.tradedAndGuard));
    }
    console.log('  saved per site per month', JSON.stringify(o.savedPerSitePerMonth));
  }
  fs.writeFileSync(
    process.env.OUT ?? 'public/data/merge-fleet.json',
    JSON.stringify({ generatedAt: new Date().toISOString(), months: out }, null, 1),
  );
}
main();
