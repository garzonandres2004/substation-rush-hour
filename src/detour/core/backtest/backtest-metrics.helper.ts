import {
  IBillBreakdown,
  IBillLine,
  IInterval,
  IPlanInterval,
  IProvenance,
} from '../models';
import { planEngineSettings } from '../plan/plan-engine.constants';
import { backtestProvenance, backtestSettings } from './backtest.constants';
import {
  IBacktestCycles,
  IBacktestDay,
  IBacktestInput,
  IBacktestPeakInterval,
  IBacktestResult,
  IBacktestStrategy,
  IBacktestStrategyResult,
  IBacktestTraffic,
  IBacktestValue,
  IBacktestWattsmart,
  IComponentSavings,
} from './backtest.interfaces';

export class BacktestMetricsHelper {
  public static strategyResult(
    strategy: IBacktestStrategy,
    input: IBacktestInput,
    intervals: IPlanInterval[],
    bill: IBillBreakdown,
    baselineBill: IBillBreakdown,
  ): IBacktestStrategyResult {
    const savings = BacktestMetricsHelper.savingsByComponent(baselineBill, bill);
    const cycles = BacktestMetricsHelper.cycles(input, intervals);
    const traffic = BacktestMetricsHelper.traffic(input, intervals);

    return {
      strategy: { id: strategy.id, label: strategy.label, description: strategy.description, role: strategy.role },
      intervals,
      bill,
      savings,
      peakInterval: BacktestMetricsHelper.peakInterval(input.intervals, bill),
      facilitiesKw: bill.determinants.facilitiesKw,
      cycles,
      wattsmart: BacktestMetricsHelper.wattsmart(input, intervals),
      traffic,
      value: BacktestMetricsHelper.value(input, savings, cycles, traffic),
      captureRate: null,
    };
  }

  public static value(
    input: IBacktestInput,
    savings: IComponentSavings,
    cycles: IBacktestCycles,
    traffic: IBacktestTraffic,
  ): IBacktestValue {
    const carbonValue = -planEngineSettings.DEFAULT_CO2_WEIGHT_PER_KG * traffic.netKgCo2Change;
    const wearCost =
      cycles.pulseThroughputKwh * input.assets.pulse.degradationCostPerKwh +
      cycles.spinThroughputKwh * input.assets.spin.degradationCostPerKwh;

    return { billSavings: savings.total, carbonValue, wearCost, total: savings.total + carbonValue - wearCost };
  }

  public static savingsByComponent(baselineBill: IBillBreakdown, bill: IBillBreakdown): IComponentSavings {
    const savings: IComponentSavings = { customer: 0, facilities: 0, demand: 0, energy: 0, total: 0 };
    const amountOf = (lines: IBillLine[], match: (id: string) => boolean): number =>
      lines.filter((line: IBillLine) => match(line.id)).reduce((sum: number, line: IBillLine) => sum + line.amount, 0);
    const round = (value: number): number => Math.round(value * backtestSettings.CENT_FACTOR) / backtestSettings.CENT_FACTOR;

    savings.customer = round(
      amountOf(baselineBill.lines, (id) => id === 'customer-charge') - amountOf(bill.lines, (id) => id === 'customer-charge'),
    );
    savings.facilities = round(
      amountOf(baselineBill.lines, (id) => id === 'facilities') - amountOf(bill.lines, (id) => id === 'facilities'),
    );
    savings.demand = round(
      amountOf(baselineBill.lines, (id) => id === 'demand') - amountOf(bill.lines, (id) => id === 'demand'),
    );
    savings.energy = round(
      amountOf(baselineBill.lines, (id) => id.startsWith('energy')) - amountOf(bill.lines, (id) => id.startsWith('energy')),
    );
    savings.total = round(baselineBill.total - bill.total);

    return savings;
  }

  public static peakInterval(intervals: IInterval[], bill: IBillBreakdown): IBacktestPeakInterval | null {
    const startUtc = bill.determinants.demandIntervalStartUtc;
    const interval = intervals.find((entry: IInterval) => entry.startUtc === startUtc);

    if (!startUtc || !interval) {
      return null;
    }

    return {
      index: interval.index,
      startUtc,
      localDate: interval.localDate,
      localHour: interval.localHour,
      localMinute: interval.localMinute,
      kw: bill.determinants.demandKw,
    };
  }

  public static cycles(input: IBacktestInput, intervals: IPlanInterval[]): IBacktestCycles {
    const { pulse, spin } = input.assets;
    const stepHours = input.intervals[0]?.hours ?? 0.25;
    const pulseThroughputKwh = intervals.reduce((sum: number, entry: IPlanInterval) => sum + entry.pulseDischargeKw * stepHours, 0);
    const spinThroughputKwh = intervals.reduce((sum: number, entry: IPlanInterval) => sum + entry.spinDischargeKw * stepHours, 0);
    const pulseUsableKwh = pulse.energyKwh * (pulse.maxSocFraction - pulse.minSocFraction);

    return {
      pulseThroughputKwh,
      spinThroughputKwh,
      pulseEquivalentFullCycles: pulseUsableKwh > 0 ? pulseThroughputKwh / pulseUsableKwh : 0,
      spinEquivalentFullCycles: spin.energyKwh > 0 ? spinThroughputKwh / spin.energyKwh : 0,
    };
  }

  public static wattsmart(input: IBacktestInput, intervals: IPlanInterval[]): IBacktestWattsmart {
    const pulseFloorKwh = input.assets.pulse.minSocFraction * input.assets.pulse.energyKwh;
    let minimumHeldKwh = Number.POSITIVE_INFINITY;

    intervals.forEach((entry: IPlanInterval, index: number) => {
      if (input.rushHourMask[index]) {
        const held = Math.max(0, entry.pulseSocKwh - pulseFloorKwh);
        minimumHeldKwh = Math.min(minimumHeldKwh, held);
      }
    });

    return {
      committedKwh: input.wattsmartReserveKwh,
      minimumHeldKwh: Number.isFinite(minimumHeldKwh) ? minimumHeldKwh : 0,
    };
  }

  public static traffic(input: IBacktestInput, intervals: IPlanInterval[]): IBacktestTraffic {
    const stepHours = input.intervals[0]?.hours ?? 0.25;
    let avoidedKwh = 0;
    let avoidedKgCo2 = 0;
    let netKgCo2Change = 0;

    intervals.forEach((entry: IPlanInterval, index: number) => {
      const deltaKwh = (entry.gridKw - input.loadKw[index]) * stepHours;
      netKgCo2Change += deltaKwh * input.marginalKgCo2PerKwh[index];

      if (input.rushHourMask[index]) {
        avoidedKwh -= deltaKwh;
        avoidedKgCo2 -= deltaKwh * input.marginalKgCo2PerKwh[index];
      }
    });

    return { avoidedKwh, avoidedKgCo2, netKgCo2Change };
  }

  public static assemble(input: IBacktestInput, results: IBacktestStrategyResult[]): IBacktestResult {
    const baseline = results.find((entry: IBacktestStrategyResult) => entry.strategy.role === 'baseline');

    if (!baseline) {
      throw new Error('A baseline strategy is required.');
    }

    const oracleRaw = results.find((entry: IBacktestStrategyResult) => entry.strategy.role === 'oracle') ?? null;
    const strategies = results
      .filter((entry: IBacktestStrategyResult) => entry.strategy.role !== 'baseline')
      .map((entry: IBacktestStrategyResult) => ({
        ...entry,
        captureRate: BacktestMetricsHelper.captureRate(entry, oracleRaw),
      }));
    const oracle = strategies.find((entry: IBacktestStrategyResult) => entry.strategy.role === 'oracle') ?? null;
    const perfectLoad = strategies.find((entry: IBacktestStrategyResult) => entry.strategy.role === 'perfect-load') ?? null;
    const shaver = strategies.find((entry: IBacktestStrategyResult) => entry.strategy.role === 'heuristic') ?? null;
    const lead =
      strategies.find((entry: IBacktestStrategyResult) => entry.strategy.role === 'realistic') ??
      strategies.find((entry: IBacktestStrategyResult) => entry.strategy.role === 'heuristic') ??
      baseline;

    return {
      summary: {
        month: input.month,
        throughDate: input.throughDate,
        siteId: input.site.id,
        siteName: input.site.name,
        nominalPeakKw: input.site.nominalPeakKw,
        scheduleId: input.schedule.id,
        scheduleName: input.schedule.name,
        wattsmartReserveKwh: input.wattsmartReserveKwh,
        naiveTargetKw: backtestSettings.NAIVE_TARGET_FRACTION * input.site.nominalPeakKw,
        seed: input.site.seed,
        pulseCycleLife: input.assets.pulse.cycleLife,
        spinCycleLife: input.assets.spin.cycleLife,
        co2WeightPerKg: planEngineSettings.DEFAULT_CO2_WEIGHT_PER_KG,
      },
      intervals: input.intervals,
      rushHourMask: input.rushHourMask,
      baseline,
      strategies,
      oracle,
      perfectLoad,
      shaver,
      lead,
      days: BacktestMetricsHelper.days(input, baseline, lead),
      provenance: BacktestMetricsHelper.provenance(input),
      sources: {
        tariff: input.schedule.provenance,
        site: input.site.provenance,
        carbon: input.marginalEmissions.provenance[0] ?? backtestProvenance.RUSH_HOUR_RULE,
        reserve: backtestProvenance.WATTSMART_RESERVE,
        rushHour: backtestProvenance.RUSH_HOUR_RULE,
        naiveTarget: backtestProvenance.NAIVE_TARGET,
        loadForecast: backtestProvenance.LOAD_FORECAST,
        oracle: backtestProvenance.ORACLE,
      },
    };
  }

  public static captureRate(result: IBacktestStrategyResult, oracle: IBacktestStrategyResult | null): number | null {
    if (!oracle || oracle.savings.total <= 0) {
      return null;
    }

    return result.savings.total / oracle.savings.total;
  }

  public static days(
    input: IBacktestInput,
    baseline: IBacktestStrategyResult,
    lead: IBacktestStrategyResult,
  ): IBacktestDay[] {
    const isOnPeakBasis = input.schedule.demandBasis === 'on-peak';
    const days: IBacktestDay[] = [];

    input.intervals.forEach((interval: IInterval, index: number) => {
      let day = days[days.length - 1];

      if (!day || day.localDate !== interval.localDate) {
        day = {
          localDate: interval.localDate,
          startIndex: index,
          endIndex: index,
          isWeekday: interval.isWeekday,
          isHoliday: interval.isHoliday,
          baselinePeakKw: 0,
          leadPeakKw: 0,
          rushStartIndex: null,
          rushEndIndex: null,
          hasBaselinePeak: false,
          hasLeadPeak: false,
        };
        days.push(day);
      }

      day.endIndex = index;

      if (input.rushHourMask[index]) {
        day.rushStartIndex = day.rushStartIndex ?? index;
        day.rushEndIndex = index;
      }

      if (!isOnPeakBasis || input.onPeakMask[index]) {
        day.baselinePeakKw = Math.max(day.baselinePeakKw, baseline.intervals[index].gridKw);
        day.leadPeakKw = Math.max(day.leadPeakKw, lead.intervals[index].gridKw);
      }
    });

    for (const day of days) {
      day.hasBaselinePeak = !!baseline.peakInterval && baseline.peakInterval.localDate === day.localDate;
      day.hasLeadPeak = !!lead.peakInterval && lead.peakInterval.localDate === day.localDate;
    }

    return days;
  }

  private static provenance(input: IBacktestInput): IProvenance[] {
    return [
      input.site.provenance,
      input.schedule.provenance,
      backtestProvenance.NAIVE_TARGET,
      backtestProvenance.WATTSMART_RESERVE,
      backtestProvenance.RUSH_HOUR_RULE,
      backtestProvenance.LOAD_FORECAST,
      backtestProvenance.ORACLE,
      ...input.marginalEmissions.provenance,
      ...Object.values(input.assets.sources),
    ];
  }
}
