import type { Highs } from 'highs';
import { TimeHelper } from '../helpers/time.helper';
import {
  IBillBreakdown,
  IInterval,
  ILpStats,
  IMarginalEmissionsPoint,
  IMarginalEmissionsSeries,
  IPlanInterval,
  IPlanMetrics,
  IPlanRealized,
  IPlanRequest,
  IPlanResult,
  IPlanValue,
  IRushHourWindow,
  ISiteArchetype,
  ISiteLoadInterval,
  IStationAssets,
  ITariffSchedule,
} from '../models';
import { NaiveShaverHelper } from '../backtest/naive-shaver.helper';
import { PlanReplayHelper } from '../backtest/plan-replay.helper';
import { SiteLoadForecastHelper } from '../backtest/site-load-forecast.helper';
import { SiteGeneratorHelper } from '../sites/site-generator.helper';
import { TariffHelper } from '../tariff/tariff.helper';
import { LpBuilderHelper } from './lp-builder.helper';
import { ILpInput, ILpModel, IMonthToDate, IRushPeaks, IShaverComparison, ISolarDay } from './plan-engine.interfaces';
import { mefConversions } from './placeholder-mef.constants';
import { planEngineSettings } from './plan-engine.constants';

export class PlanEngineHelper {
  public static defaultRequest(
    site: ISiteArchetype,
    assets: IStationAssets,
    schedule: ITariffSchedule,
    date: string,
  ): IPlanRequest {
    return {
      siteId: site.id,
      scheduleId: schedule.id,
      date,
      horizonDays: 2,
      co2WeightPerKg: planEngineSettings.DEFAULT_CO2_WEIGHT_PER_KG,
      wattsmartReserveKwh: 0,
      peakSoFarOnPeakKw: 0,
      peakSoFarAllHoursKw: 0,
      initialSpinSocKwh: 0,
      initialPulseSocKwh: assets.pulse.energyKwh * planEngineSettings.DEFAULT_PULSE_SOC_FRACTION,
    };
  }

  public static buildInput(
    site: ISiteArchetype,
    assets: IStationAssets,
    schedule: ITariffSchedule,
    request: IPlanRequest,
    mef: IMarginalEmissionsSeries,
    rushHourWindows: IRushHourWindow[],
  ): ILpInput {
    const dayDates = [request.date, TimeHelper.addDays(request.date, 1)];
    const intervals = PlanEngineHelper.reindex(dayDates.flatMap((day: string) => TimeHelper.localDayIntervals(day)));
    const loadKw = dayDates.flatMap((day: string) => SiteLoadForecastHelper.forecastDay(site, day));
    const actualLoadKw = dayDates.flatMap((day: string) => PlanEngineHelper.loadFor(site, day));
    const onPeakMask = TariffHelper.onPeakMask(schedule, intervals);
    const isOnPeakBasis = schedule.demandBasis === 'on-peak';
    const energyPricePerKwh = intervals.map((interval: IInterval, i: number) => {
      const rates = TariffHelper.seasonRatesFor(schedule, interval.localDate);

      return isOnPeakBasis && onPeakMask[i] ? rates.energyOnPeakPerKwh : rates.energyOffPeakPerKwh;
    });
    const marginalKgCo2PerKwh = PlanEngineHelper.marginalSeries(schedule, intervals, mef);
    const rushHourMask = PlanEngineHelper.rushHourMask(intervals, rushHourWindows);
    const monthToDate = PlanEngineHelper.monthToDate(site, request.date);
    const peakSoFar = TariffHelper.peakSoFar(schedule, monthToDate.intervals, monthToDate.loadKw);
    const initialPulseSocKwh =
      request.initialPulseSocKwh < 0 ? assets.pulse.energyKwh * planEngineSettings.DEFAULT_PULSE_SOC_FRACTION : request.initialPulseSocKwh;
    const initialSpinSocKwh = request.initialSpinSocKwh < 0 ? 0 : request.initialSpinSocKwh;

    return {
      request: {
        ...request,
        peakSoFarOnPeakKw: peakSoFar.onPeakKw,
        peakSoFarAllHoursKw: peakSoFar.allHoursKw,
        initialPulseSocKwh,
        initialSpinSocKwh,
      },
      schedule,
      assets,
      intervals,
      loadKw,
      actualLoadKw,
      onPeakMask,
      energyPricePerKwh,
      marginalKgCo2PerKwh,
      rushHourMask,
      rushHourWindows,
      monthToDateIntervals: monthToDate.intervals,
      monthToDateLoadKw: monthToDate.loadKw,
      site,
    };
  }

  public static rushHourWindows(gridHours: Detour.Firestore.Snapshot.IGridHour[], date: string): IRushHourWindow[] {
    const startHour = PlanEngineHelper.busiestBlockStart(gridHours, date);
    const isAssumption = startHour === null;
    const blockStart = startHour ?? planEngineSettings.FALLBACK_RUSH_HOUR_START;

    return [
      PlanEngineHelper.windowFor(date, blockStart, isAssumption),
      PlanEngineHelper.windowFor(TimeHelper.addDays(date, 1), blockStart, true),
    ];
  }

  public static solve(highs: Highs, input: ILpInput): IPlanResult {
    const startMs = performance.now();
    let model: ILpModel = { lpText: '', columnNames: [], stats: PlanEngineHelper.emptyStats(input) };

    try {
      model = LpBuilderHelper.build(input);
      const solution = highs.solve(model.lpText);
      const solveMs = performance.now() - startMs;

      if (solution.Status !== 'Optimal') {
        return PlanEngineHelper.failedResult(
          input,
          'infeasible',
          PlanEngineHelper.infeasibleMessage(input, solution.Status),
          model.lpText,
          solveMs,
          { ...model.stats, solveMs },
        );
      }

      const columns = solution.Columns as Record<string, { Primal: number }>;
      const primal = (name: string): number => PlanEngineHelper.clean(columns[name]?.Primal ?? 0);

      return PlanEngineHelper.optimalResult(
        input,
        model.lpText,
        { ...model.stats, solveMs },
        primal,
        solution.ObjectiveValue,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      return PlanEngineHelper.failedResult(
        input,
        'error',
        `The solver failed before returning a plan: ${message}`,
        model.lpText,
        performance.now() - startMs,
        model.stats,
      );
    }
  }

  public static emptyStats(input: ILpInput): ILpStats {
    return { intervalCount: input.intervals.length, variableCount: 0, constraintCount: 0, solveMs: 0 };
  }

  public static failedResult(
    input: ILpInput,
    status: 'infeasible' | 'error',
    errorMessage: string,
    lpText: string,
    solveMs: number,
    lpStats: ILpStats = PlanEngineHelper.emptyStats(input),
  ): IPlanResult {
    const baselineBill = PlanEngineHelper.billFor(input, input.loadKw);
    const intervals = input.intervals.map((interval: IInterval, t: number) =>
      PlanEngineHelper.planInterval(input, interval, t, input.loadKw[t], 0, 0, 0, 0, 0, 0),
    );

    return {
      request: input.request,
      status,
      intervals,
      demandKw: baselineBill.determinants.demandKw,
      baselineBill,
      plannedBill: baselineBill,
      lpText,
      solveMs,
      lpStats: { ...lpStats, solveMs },
      errorMessage,
    };
  }

  private static optimalResult(
    input: ILpInput,
    lpText: string,
    lpStats: ILpStats,
    primal: (name: string) => number,
    objectiveValue: number,
  ): IPlanResult {
    const { assets } = input;
    const intervals = input.intervals.map((interval: IInterval, t: number) =>
      PlanEngineHelper.planInterval(
        input,
        interval,
        t,
        primal(`g_${t}`),
        primal(`fc_${t}`),
        primal(`fd_${t}`),
        primal(`pc_${t}`),
        primal(`pd_${t}`),
        primal(`sf_${t}`),
        primal(`sp_${t}`),
      ),
    );
    const gridKw = intervals.map((planInterval: IPlanInterval) => planInterval.gridKw);
    let baselineCo2Kg = 0;
    let plannedCo2Kg = 0;
    let baselineRushHourKwh = 0;
    let plannedRushHourKwh = 0;
    let spinThroughputKwh = 0;
    let pulseThroughputKwh = 0;
    let minimumHeldKwh = Number.POSITIVE_INFINITY;
    const rushPeaks: IRushPeaks = { baselineRushPeakKw: 0, plannedRushPeakKw: 0 };
    const pulseFloorKwh = assets.pulse.minSocFraction * assets.pulse.energyKwh;

    for (let t = 0; t < intervals.length; t++) {
      const stepHours = input.intervals[t].hours;
      const planInterval = intervals[t];
      baselineCo2Kg += input.marginalKgCo2PerKwh[t] * input.loadKw[t] * stepHours;
      plannedCo2Kg += input.marginalKgCo2PerKwh[t] * planInterval.gridKw * stepHours;
      spinThroughputKwh += planInterval.spinDischargeKw * stepHours;
      pulseThroughputKwh += planInterval.pulseDischargeKw * stepHours;

      if (input.rushHourMask[t]) {
        minimumHeldKwh = Math.min(minimumHeldKwh, planInterval.pulseSocKwh - pulseFloorKwh);
      }

      if (input.rushHourMask[t] && input.intervals[t].localDate === input.request.date) {
        baselineRushHourKwh += input.loadKw[t] * stepHours;
        plannedRushHourKwh += planInterval.gridKw * stepHours;
        rushPeaks.baselineRushPeakKw = Math.max(rushPeaks.baselineRushPeakKw, input.loadKw[t]);
        rushPeaks.plannedRushPeakKw = Math.max(rushPeaks.plannedRushPeakKw, planInterval.gridKw);
      }
    }

    const rushHourPulseMinKwh = Number.isFinite(minimumHeldKwh) ? Math.max(0, minimumHeldKwh) : 0;
    const wattsmartHeldKwh = input.request.wattsmartReserveKwh > 0 ? rushHourPulseMinKwh : 0;
    const shaver = PlanEngineHelper.shaverComparison(input);
    const reboundMask = PlanEngineHelper.reboundMask(input.intervals, input.rushHourWindows[0]);
    const realized = PlanEngineHelper.realized(input, intervals);
    const plannedValue = PlanEngineHelper.planValue(input, gridKw, plannedCo2Kg - baselineCo2Kg);
    const metrics: IPlanMetrics = {
      baselineCo2Kg,
      plannedCo2Kg,
      baselineRushHourKwh,
      plannedRushHourKwh,
      trafficAvoidedKwh: baselineRushHourKwh - plannedRushHourKwh,
      ...rushPeaks,
      rushPeakCutKw: Math.max(0, rushPeaks.baselineRushPeakKw - rushPeaks.plannedRushPeakKw),
      chargeSolarShare: null,
      shaverChargeSolarShare: null,
      solarShareProxyDate: null,
      reboundPeakKw: PlanEngineHelper.maskedPeak(gridKw, reboundMask),
      shaverReboundPeakKw: shaver ? PlanEngineHelper.maskedPeak(shaver.gridKw, reboundMask) : 0,
      shaverGridKw: shaver?.gridKw,
      shaverChargeKw: shaver?.chargeKw,
      rushHourWindows: input.rushHourWindows,
      wattsmartHeldKwh,
      rushHourPulseMinKwh,
      spinBurstCount: PlanEngineHelper.spinBurstCount(intervals),
      spinThroughputKwh,
      pulseThroughputKwh,
      objectiveValue,
      value: realized ? PlanEngineHelper.withRealizedPeaks(plannedValue, realized.value) : plannedValue,
      realized,
    };

    if (realized) {
      metrics.baselineRushPeakKw = realized.baselineRushPeakKw;
      metrics.plannedRushPeakKw = realized.realizedRushPeakKw;
      metrics.rushPeakCutKw = realized.rushPeakCutKw;
      metrics.trafficAvoidedKwh = realized.rushKwhMoved;
    }

    return {
      request: input.request,
      status: 'optimal',
      intervals,
      demandKw: primal('D'),
      baselineBill: PlanEngineHelper.billFor(input, input.loadKw),
      plannedBill: PlanEngineHelper.billFor(input, gridKw),
      lpText,
      solveMs: lpStats.solveMs,
      lpStats,
      metrics,
    };
  }

  public static realized(input: ILpInput, planned: IPlanInterval[]): IPlanRealized | null {
    const actualLoadKw = input.actualLoadKw;
    const dayIndexes = input.intervals
      .map((interval: IInterval, t: number) => (interval.localDate === input.request.date ? t : -1))
      .filter((t: number) => t >= 0);

    if (!actualLoadKw || dayIndexes.length === 0) {
      return null;
    }

    const isOnPeakBasis = input.schedule.demandBasis === 'on-peak';
    const billedFloorKw = isOnPeakBasis ? input.request.peakSoFarOnPeakKw : input.request.peakSoFarAllHoursKw;
    const billedMask = dayIndexes.map((t: number) => !isOnPeakBasis || input.onPeakMask[t]);
    const rushHourMask = dayIndexes.map((t: number) => input.rushHourMask[t]);
    const dayLoadKw = dayIndexes.map((t: number) => actualLoadKw[t]);
    const day = PlanReplayHelper.replayDay({
      assets: input.assets,
      loadKw: dayLoadKw,
      planned: dayIndexes.map((t: number) => planned[t]),
      billedMask,
      rushHourMask,
      wattsmartReserveKwh: input.request.wattsmartReserveKwh,
      stepHours: input.intervals[0]?.hours ?? 0.25,
      state: {
        pulseSocKwh: input.request.initialPulseSocKwh,
        spinSocKwh: input.request.initialSpinSocKwh,
        pulseNetKw: input.request.initialPulseNetKw ?? 0,
        billedPeakKw: billedFloorKw,
        billedLoadPeakKw: billedFloorKw,
        facilitiesPeakKw: Math.max(input.request.peakSoFarAllHoursKw, ...dayIndexes.map((t: number) => planned[t].gridKw)),
        facilitiesLoadPeakKw: input.request.peakSoFarAllHoursKw,
      },
    });
    const replayedKw = day.intervals.map((planInterval: IPlanInterval) => planInterval.gridKw);
    const baselinePeakKw = PlanEngineHelper.maskedPeak(dayLoadKw, billedMask);
    const realizedPeakKw = PlanEngineHelper.maskedPeak(replayedKw, billedMask);
    const forecastKw = dayIndexes.map((t: number) => input.loadKw[t]);
    const baselineRushPeakKw = PlanEngineHelper.maskedPeak(dayLoadKw, rushHourMask);
    const realizedRushPeakKw = PlanEngineHelper.maskedPeak(replayedKw, rushHourMask);
    const stepHours = input.intervals[0]?.hours ?? 0.25;
    const rushKwhMoved = rushHourMask.reduce(
      (sum: number, isRush: boolean, i: number) => (isRush ? sum + (dayLoadKw[i] - replayedKw[i]) * stepHours : sum),
      0,
    );
    const dayInput: ILpInput = {
      ...input,
      intervals: dayIndexes.map((t: number) => input.intervals[t]),
      loadKw: dayLoadKw,
      onPeakMask: dayIndexes.map((t: number) => input.onPeakMask[t]),
      energyPricePerKwh: dayIndexes.map((t: number) => input.energyPricePerKwh[t]),
    };

    return {
      rushPeakCutKw: Math.max(0, baselineRushPeakKw - realizedRushPeakKw),
      peakCutKw: Math.max(0, Math.max(baselinePeakKw, billedFloorKw) - Math.max(realizedPeakKw, billedFloorKw)),
      baselinePeakKw,
      realizedPeakKw,
      forecastErrorPeakKw: Math.max(...dayLoadKw) - Math.max(...forecastKw),
      baselineRushPeakKw,
      realizedRushPeakKw,
      rushKwhMoved,
      value: PlanEngineHelper.planValue(dayInput, replayedKw, 0),
    };
  }

  public static shaverComparison(input: ILpInput): IShaverComparison | null {
    if (!input.site || input.intervals.length === 0) {
      return null;
    }

    const shaverIntervals = NaiveShaverHelper.runShaver({
      month: input.request.date.slice(0, 7),
      throughDate: null,
      site: input.site,
      schedule: input.schedule,
      assets: input.assets,
      intervals: input.intervals,
      loadKw: input.loadKw,
      onPeakMask: input.onPeakMask,
      energyPricePerKwh: input.energyPricePerKwh,
      edamLmpPerMwh: [],
      marginalKgCo2PerKwh: input.marginalKgCo2PerKwh,
      marginalEmissions: { method: 'demand', points: [], provenance: [] },
      gridHours: [],
      rushHourMask: input.rushHourMask,
      wattsmartReserveKwh: input.request.wattsmartReserveKwh,
      initialPulseSocKwh: input.request.initialPulseSocKwh,
      initialSpinSocKwh: input.request.initialSpinSocKwh,
    });

    return {
      gridKw: shaverIntervals.map((planInterval: IPlanInterval) => planInterval.gridKw),
      chargeKw: shaverIntervals.map((planInterval: IPlanInterval) => planInterval.spinChargeKw + planInterval.pulseChargeKw),
    };
  }

  public static withSolarShares(result: IPlanResult, gridHours: Detour.Firestore.Snapshot.IGridHour[]): IPlanResult {
    if (!result.metrics) {
      return result;
    }

    const exactByUtcHour = PlanEngineHelper.solarShareByUtcHour(gridHours);
    const hourStarts = result.intervals.map((planInterval: IPlanInterval) => {
      const startMs = Date.parse(planInterval.startUtc);

      return startMs - (startMs % planEngineSettings.MS_PER_HOUR);
    });
    const chargeKw = result.intervals.map((planInterval: IPlanInterval) => planInterval.spinChargeKw + planInterval.pulseChargeKw);
    const shaverChargeKw = result.metrics.shaverChargeKw ?? [];
    const exactShares = hourStarts.map((hourStartMs: number) => exactByUtcHour.get(hourStartMs) ?? null);
    const isCovered = (series: number[]): boolean =>
      series.every((kw: number, t: number) => kw <= planEngineSettings.TINY_VALUE || exactShares[t] !== null);
    const isExact = isCovered(chargeKw) && isCovered(shaverChargeKw);
    const proxyDay = isExact ? null : PlanEngineHelper.latestSolarDay(gridHours);
    const shares = isExact
      ? exactShares
      : hourStarts.map((hourStartMs: number) => proxyDay?.sharesByHour.get(TimeHelper.localParts(hourStartMs).hour) ?? null);

    return {
      ...result,
      metrics: {
        ...result.metrics,
        chargeSolarShare: PlanEngineHelper.chargeWeightedShare(chargeKw, shares),
        shaverChargeSolarShare: result.metrics.shaverChargeKw ? PlanEngineHelper.chargeWeightedShare(shaverChargeKw, shares) : null,
        solarShareProxyDate: proxyDay?.date ?? null,
      },
    };
  }

  public static solarShareByUtcHour(gridHours: Detour.Firestore.Snapshot.IGridHour[]): Map<number, number> {
    const shares = new Map<number, number>();

    for (const gridHour of gridHours) {
      const share = PlanEngineHelper.solarShareOf(gridHour);

      if (share !== null) {
        const hourEndingMs = Date.parse(`${gridHour.utcHourEnding.slice(0, 13)}:00:00Z`);
        shares.set(hourEndingMs - planEngineSettings.MS_PER_HOUR, share);
      }
    }

    return shares;
  }

  public static latestSolarDay(gridHours: Detour.Firestore.Snapshot.IGridHour[]): ISolarDay | null {
    const days = new Map<string, Map<number, number>>();

    for (const gridHour of gridHours) {
      const share = PlanEngineHelper.solarShareOf(gridHour);

      if (share === null) {
        continue;
      }

      const date = gridHour.localHourStart.slice(0, 10);
      const sharesByHour = days.get(date) ?? new Map<number, number>();
      sharesByHour.set(Number(gridHour.localHourStart.slice(11, 13)), share);
      days.set(date, sharesByHour);
    }

    const fullDates = [...days.keys()]
      .filter((date: string) => (days.get(date)?.size ?? 0) >= planEngineSettings.SOLAR_DAY_MIN_HOURS)
      .sort();
    const date = fullDates[fullDates.length - 1];

    return date ? { date, sharesByHour: days.get(date) as Map<number, number> } : null;
  }

  private static solarShareOf(gridHour: Detour.Firestore.Snapshot.IGridHour): number | null {
    const values = Object.values(gridHour.fuelMw ?? {}).filter(
      (megawatts): megawatts is number => megawatts !== null && Number.isFinite(megawatts) && megawatts > 0,
    );
    const totalMw = values.reduce((sum: number, megawatts: number) => sum + megawatts, 0);
    const solarMw = gridHour.fuelMw?.[planEngineSettings.SOLAR_FUEL_KEY];

    if (totalMw <= 0 || solarMw === null || solarMw === undefined) {
      return null;
    }

    return Math.max(0, solarMw) / totalMw;
  }

  private static chargeWeightedShare(chargeKw: number[], shares: (number | null)[]): number | null {
    let weightedShare = 0;
    let weight = 0;

    for (let t = 0; t < chargeKw.length; t++) {
      const share = shares[t];

      if (share === null || chargeKw[t] <= planEngineSettings.TINY_VALUE) {
        continue;
      }

      weightedShare += share * chargeKw[t];
      weight += chargeKw[t];
    }

    return weight > 0 ? weightedShare / weight : null;
  }

  private static reboundMask(intervals: IInterval[], window: IRushHourWindow | undefined): boolean[] {
    if (!window) {
      return intervals.map(() => false);
    }

    const endMs = Date.parse(window.endUtc);
    const reboundEndMs = endMs + planEngineSettings.REBOUND_HOURS * planEngineSettings.MS_PER_HOUR;

    return intervals.map((interval: IInterval) => {
      const startMs = Date.parse(interval.startUtc);

      return startMs >= endMs && startMs < reboundEndMs;
    });
  }

  private static maskedPeak(series: number[], mask: boolean[]): number {
    return series.reduce((peak: number, kw: number, t: number) => (mask[t] ? Math.max(peak, kw) : peak), 0);
  }

  public static spinBurstCount(intervals: IPlanInterval[]): number {
    let count = 0;
    let isBursting = false;

    for (const planInterval of intervals) {
      const isDischarging = planInterval.spinDischargeKw > planEngineSettings.SPIN_BURST_MIN_KW;

      if (isDischarging && !isBursting) {
        count++;
      }

      isBursting = isDischarging;
    }

    return count;
  }

  public static withRealizedPeaks(planned: IPlanValue, realized: IPlanValue): IPlanValue {
    return {
      ...planned,
      baselinePeakKw: realized.baselinePeakKw,
      plannedPeakKw: realized.plannedPeakKw,
      peakCutKw: realized.peakCutKw,
      baselineFacilitiesKw: realized.baselineFacilitiesKw,
      plannedFacilitiesKw: realized.plannedFacilitiesKw,
      facilitiesCutKw: realized.facilitiesCutKw,
      demandWorthPerMonth: realized.demandWorthPerMonth,
      facilitiesWorthPerMonth: realized.facilitiesWorthPerMonth,
      worthPerMonth: realized.worthPerMonth,
    };
  }

  public static planValue(input: ILpInput, gridKw: number[], co2ChangeKg: number): IPlanValue {
    const { schedule, request } = input;
    const isOnPeakBasis = schedule.demandBasis === 'on-peak';
    const demandFloorKw = isOnPeakBasis ? request.peakSoFarOnPeakKw : request.peakSoFarAllHoursKw;
    const billedPeak = (series: number[]): number =>
      series.reduce(
        (peak: number, kw: number, t: number) => (isOnPeakBasis && !input.onPeakMask[t] ? peak : Math.max(peak, kw)),
        demandFloorKw,
      );
    const facilitiesPeak = (series: number[]): number =>
      series.reduce((peak: number, kw: number) => Math.max(peak, kw), request.peakSoFarAllHoursKw);
    const energyCost = (series: number[]): number =>
      series.reduce(
        (sum: number, kw: number, t: number) => sum + kw * input.intervals[t].hours * input.energyPricePerKwh[t],
        0,
      );
    const demandRatePerKw =
      input.intervals.length > 0 ? TariffHelper.seasonRatesFor(schedule, input.intervals[0].localDate).demandRatePerKw : 0;
    const baselinePeakKw = billedPeak(input.loadKw);
    const plannedPeakKw = billedPeak(gridKw);
    const baselineFacilitiesKw = facilitiesPeak(input.loadKw);
    const plannedFacilitiesKw = facilitiesPeak(gridKw);
    const peakCutKw = Math.max(0, baselinePeakKw - plannedPeakKw);
    const facilitiesCutKw = Math.max(0, baselineFacilitiesKw - plannedFacilitiesKw);
    const demandWorthPerMonth = peakCutKw * demandRatePerKw;
    const facilitiesWorthPerMonth = facilitiesCutKw * schedule.facilitiesRatePerKw;
    const baselineEnergyCost = energyCost(input.loadKw);
    const plannedEnergyCost = energyCost(gridKw);

    return {
      baselinePeakKw,
      plannedPeakKw,
      peakCutKw,
      baselineFacilitiesKw,
      plannedFacilitiesKw,
      facilitiesCutKw,
      demandRatePerKw,
      facilitiesRatePerKw: schedule.facilitiesRatePerKw,
      demandWorthPerMonth,
      facilitiesWorthPerMonth,
      worthPerMonth: demandWorthPerMonth + facilitiesWorthPerMonth,
      baselineEnergyCost,
      plannedEnergyCost,
      energyCostChange: plannedEnergyCost - baselineEnergyCost,
      co2ChangeKg,
    };
  }

  private static planInterval(
    input: ILpInput,
    interval: IInterval,
    t: number,
    gridKw: number,
    spinChargeKw: number,
    spinDischargeKw: number,
    pulseChargeKw: number,
    pulseDischargeKw: number,
    spinSocKwh: number,
    pulseSocKwh: number,
  ): IPlanInterval {
    return {
      startUtc: interval.startUtc,
      loadKw: input.loadKw[t],
      gridKw,
      spinChargeKw,
      spinDischargeKw,
      pulseChargeKw,
      pulseDischargeKw,
      spinSocKwh,
      pulseSocKwh,
      isOnPeak: input.onPeakMask[t],
      energyPricePerKwh: input.energyPricePerKwh[t],
      marginalKgCo2PerKwh: input.marginalKgCo2PerKwh[t],
    };
  }

  private static billFor(input: ILpInput, horizonKw: number[]): IBillBreakdown {
    const month = input.request.date.slice(0, 7);
    const intervals = [...input.monthToDateIntervals];
    const loadKw = [...input.monthToDateLoadKw];

    for (let t = 0; t < input.intervals.length; t++) {
      if (input.intervals[t].localDate.slice(0, 7) === month) {
        intervals.push(input.intervals[t]);
        loadKw.push(horizonKw[t]);
      }
    }

    return TariffHelper.monthlyBill(input.schedule, PlanEngineHelper.reindex(intervals), loadKw);
  }

  private static infeasibleMessage(input: ILpInput, status: string): string {
    if (input.request.wattsmartReserveKwh > 0) {
      return 'The plan has no feasible dispatch: the Wattsmart reserve is larger than the station can hold through the rush-hour window.';
    }

    return `The plan has no feasible dispatch (solver status: ${status}).`;
  }

  private static clean(value: number): number {
    if (Math.abs(value) < planEngineSettings.TINY_VALUE) {
      return 0;
    }

    return value;
  }

  private static loadFor(site: ISiteArchetype, day: string): number[] {
    return SiteGeneratorHelper.generateDay(site, day).map((interval: ISiteLoadInterval) => interval.kw);
  }

  private static reindex(intervals: IInterval[]): IInterval[] {
    return intervals.map((interval: IInterval, index: number) => ({ ...interval, index }));
  }

  private static monthToDate(site: ISiteArchetype, date: string): IMonthToDate {
    const intervals: IInterval[] = [];
    const loadKw: number[] = [];
    let day = `${date.slice(0, 7)}-01`;

    while (day < date) {
      intervals.push(...TimeHelper.localDayIntervals(day));
      loadKw.push(...PlanEngineHelper.loadFor(site, day));
      day = TimeHelper.addDays(day, 1);
    }

    return { intervals: PlanEngineHelper.reindex(intervals), loadKw };
  }

  private static marginalSeries(
    schedule: ITariffSchedule,
    intervals: IInterval[],
    mef: IMarginalEmissionsSeries,
  ): number[] {
    const pointsByKey = new Map<string, number>(
      mef.points.map((point: IMarginalEmissionsPoint) => [`${point.season}|${point.hour}`, point.lbPerMwh]),
    );

    return intervals.map((interval: IInterval) => {
      const season = TariffHelper.seasonOf(schedule, Number(interval.localDate.slice(5, 7)));
      const hour = Math.floor(interval.localHour);
      const lbPerMwh = pointsByKey.get(`${season}|${hour}`) ?? 0;

      return lbPerMwh * mefConversions.KG_PER_KWH_PER_LB_PER_MWH;
    });
  }

  private static rushHourMask(intervals: IInterval[], windows: IRushHourWindow[]): boolean[] {
    const ranges = windows.map((window: IRushHourWindow) => [Date.parse(window.startUtc), Date.parse(window.endUtc)]);

    return intervals.map((interval: IInterval) => {
      const startMs = Date.parse(interval.startUtc);

      return ranges.some(([windowStartMs, windowEndMs]) => startMs >= windowStartMs && startMs < windowEndMs);
    });
  }

  private static busiestBlockStart(gridHours: Detour.Firestore.Snapshot.IGridHour[], date: string): number | null {
    const megawattsByHour: (number | null)[] = new Array(24).fill(null);

    for (const gridHour of gridHours) {
      if (!gridHour.localHourStart.startsWith(date)) {
        continue;
      }

      const hour = Number(gridHour.localHourStart.slice(11, 13));
      const megawatts = gridHour.dayAheadForecastMw ?? gridHour.demandMw;

      if (megawattsByHour[hour] === null && megawatts !== null && Number.isFinite(megawatts)) {
        megawattsByHour[hour] = megawatts;
      }
    }

    let bestStart: number | null = null;
    let bestSum = Number.NEGATIVE_INFINITY;

    for (let start = 0; start + planEngineSettings.RUSH_HOUR_BLOCK_HOURS <= 24; start++) {
      const block = megawattsByHour.slice(start, start + planEngineSettings.RUSH_HOUR_BLOCK_HOURS);

      if (block.some((megawatts: number | null) => megawatts === null)) {
        continue;
      }

      const sum = block.reduce((total: number, megawatts: number | null) => total + (megawatts ?? 0), 0);

      if (sum > bestSum) {
        bestSum = sum;
        bestStart = start;
      }
    }

    return bestStart;
  }

  private static windowFor(date: string, startHour: number, isAssumption: boolean): IRushHourWindow {
    const endHour = startHour + planEngineSettings.RUSH_HOUR_BLOCK_HOURS;
    const dayIntervals = TimeHelper.localDayIntervals(date);
    const startInterval = dayIntervals.find((interval: IInterval) => interval.localHour >= startHour);
    const endInterval = dayIntervals.find((interval: IInterval) => interval.localHour >= endHour);
    const nextMidnightUtc = new Date(TimeHelper.localMidnightUtcMs(TimeHelper.addDays(date, 1))).toISOString();

    return {
      startUtc: startInterval?.startUtc ?? nextMidnightUtc,
      endUtc: endInterval?.startUtc ?? nextMidnightUtc,
      startLocalHour: startHour,
      endLocalHour: endHour,
      isAssumption,
    };
  }
}
