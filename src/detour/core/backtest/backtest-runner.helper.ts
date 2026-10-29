import { TimeHelper } from '../helpers/time.helper';
import {
  IBillBreakdown,
  IInterval,
  IMarginalEmissionsSeries,
  IPlanInterval,
  IRushHourWindow,
  ISiteArchetype,
  IStationAssets,
  ITariffSchedule,
} from '../models';
import { PlanEngineHelper } from '../plan/plan-engine.helper';
import { SiteGeneratorHelper } from '../sites/site-generator.helper';
import { mefSeasonMonths } from '../signals/signals.constants';
import { TariffHelper } from '../tariff/tariff.helper';
import { backtestSettings } from './backtest.constants';
import { IBacktestInput, IBacktestResult, IBacktestStrategy, IBacktestStrategyResult } from './backtest.interfaces';
import { BacktestMetricsHelper } from './backtest-metrics.helper';

export class BacktestRunnerHelper {
  public static buildInput(
    site: ISiteArchetype,
    schedule: ITariffSchedule,
    assets: IStationAssets,
    gridMonth: Detour.Firestore.Snapshot.IGridMonth,
    priceMonth: Detour.Firestore.Snapshot.IPriceMonth | null,
    marginalEmissions: IMarginalEmissionsSeries,
    month: string = backtestSettings.DEFAULT_MONTH,
    throughDate: string | null = null,
  ): IBacktestInput {
    const intervals = TimeHelper.localMonthIntervals(month).filter(
      (interval: IInterval) => throughDate === null || interval.localDate <= throughDate,
    );
    const loadKw = SiteGeneratorHelper.generateMonth(site, month)
      .slice(0, intervals.length)
      .map((entry) => entry.kw);
    const onPeakMask = TariffHelper.onPeakMask(schedule, intervals);
    const isOnPeakBasis = schedule.demandBasis === 'on-peak';
    const energyPricePerKwh = intervals.map((interval: IInterval, index: number) => {
      const rates = TariffHelper.seasonRatesFor(schedule, interval.localDate);

      return isOnPeakBasis && onPeakMask[index] ? rates.energyOnPeakPerKwh : rates.energyOffPeakPerKwh;
    });

    return {
      month,
      throughDate,
      site,
      schedule,
      assets,
      intervals,
      loadKw,
      onPeakMask,
      energyPricePerKwh,
      edamLmpPerMwh: BacktestRunnerHelper.edamSeries(intervals, priceMonth),
      marginalKgCo2PerKwh: BacktestRunnerHelper.marginalSeries(intervals, marginalEmissions),
      marginalEmissions,
      gridHours: gridMonth.hours,
      rushHourMask: BacktestRunnerHelper.rushHourMask(intervals, gridMonth.hours),
      wattsmartReserveKwh: assets.pulse.energyKwh * backtestSettings.WATTSMART_RESERVE_FRACTION,
      initialPulseSocKwh: assets.pulse.energyKwh * backtestSettings.INITIAL_PULSE_SOC_FRACTION,
      initialSpinSocKwh: backtestSettings.INITIAL_SPIN_SOC_KWH,
    };
  }

  public static async run(input: IBacktestInput, strategies: IBacktestStrategy[]): Promise<IBacktestResult> {
    const baselineStrategy = strategies.find((strategy: IBacktestStrategy) => strategy.role === 'baseline');

    if (!baselineStrategy) {
      throw new Error('A baseline strategy is required to compute savings.');
    }

    const billed: { strategy: IBacktestStrategy; intervals: IPlanInterval[]; bill: IBillBreakdown }[] = [];

    for (const strategy of strategies) {
      const intervals = await strategy.run(input);

      if (intervals.length !== input.intervals.length) {
        throw new Error(
          `Strategy ${strategy.id} returned ${intervals.length} intervals, expected ${input.intervals.length}.`,
        );
      }

      const bill = TariffHelper.monthlyBill(
        input.schedule,
        input.intervals,
        intervals.map((interval: IPlanInterval) => interval.gridKw),
      );
      billed.push({ strategy, intervals, bill });
    }

    const baselineBilled = billed.find((entry) => entry.strategy.id === baselineStrategy.id);

    if (!baselineBilled) {
      throw new Error('The baseline strategy did not run.');
    }

    const results: IBacktestStrategyResult[] = billed.map((entry) =>
      BacktestMetricsHelper.strategyResult(entry.strategy, input, entry.intervals, entry.bill, baselineBilled.bill),
    );

    return BacktestMetricsHelper.assemble(input, results);
  }

  private static edamSeries(
    intervals: IInterval[],
    priceMonth: Detour.Firestore.Snapshot.IPriceMonth | null,
  ): (number | null)[] {
    const lmpByHour = new Map<number, number | null>();

    for (const hour of priceMonth?.hours ?? []) {
      lmpByHour.set(Date.parse(`${hour.utcStart.slice(0, 13)}:00:00Z`), hour.lmp);
    }

    const hourMs = 3600000;

    return intervals.map((interval: IInterval) => {
      const startMs = Date.parse(interval.startUtc);

      return lmpByHour.get(startMs - (startMs % hourMs)) ?? null;
    });
  }

  private static marginalSeries(intervals: IInterval[], series: IMarginalEmissionsSeries): number[] {
    const lookup = new Map<string, number>();

    for (const point of series.points) {
      lookup.set(`${point.season}|${point.hour}`, point.lbPerMwh);
    }

    return intervals.map((interval: IInterval) => {
      const month = Number(interval.localDate.slice(5, 7));
      const season = mefSeasonMonths.SUMMER.includes(month) ? 'summer' : 'winter';

      return (lookup.get(`${season}|${interval.localHour}`) ?? 0) * backtestSettings.KG_PER_KWH_PER_LB_PER_MWH;
    });
  }

  private static rushHourMask(intervals: IInterval[], gridHours: Detour.Firestore.Snapshot.IGridHour[]): boolean[] {
    const windowsByDate = new Map<string, IRushHourWindow>();
    const dates = Array.from(new Set(intervals.map((interval: IInterval) => interval.localDate)));

    for (const date of dates) {
      windowsByDate.set(date, PlanEngineHelper.rushHourWindows(gridHours, date)[0]);
    }

    return intervals.map((interval: IInterval) => {
      const window = windowsByDate.get(interval.localDate);

      if (!window) {
        return false;
      }

      const startMs = Date.parse(interval.startUtc);

      return startMs >= Date.parse(window.startUtc) && startMs < Date.parse(window.endUtc);
    });
  }
}
