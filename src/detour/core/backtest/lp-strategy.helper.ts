import { IInterval, IPlanInterval, IPlanResult } from '../models';
import { PlanEngineHelper } from '../plan/plan-engine.helper';
import { ILpInput } from '../plan/plan-engine.interfaces';
import { TariffHelper } from '../tariff/tariff.helper';
import { backtestSettings } from './backtest.constants';
import { IBacktestInput, IBacktestStrategy, ILpSolver, IReplayState } from './backtest.interfaces';
import { PlanReplayHelper } from './plan-replay.helper';
import { SiteLoadForecastHelper } from './site-load-forecast.helper';

export class LpStrategyHelper {
  public static detour(solver: ILpSolver): IBacktestStrategy {
    return {
      id: 'detour',
      label: 'DETOUR',
      description:
        "Plans each day the afternoon before on a load forecast (the highest load on the same weekday over the last four weeks), then runs it against the real load with a live cap: when the site would pass the planned peak or the month's peak so far, Spin and then Pulse discharge more, without touching the Wattsmart reserve.",
      role: 'realistic',
      run: (input: IBacktestInput): Promise<IPlanInterval[]> => LpStrategyHelper.runForecastRolling(solver, input),
    };
  }

  public static rollingLp(solver: ILpSolver): IBacktestStrategy {
    return {
      id: 'rolling-lp-perfect-load',
      label: 'DETOUR with a perfect load forecast',
      description:
        "Solves one day at a time knowing that day's real site load in advance, holding the peak already set this month and carrying Pulse and Spin charge into the next day. Prices and carbon are what was known the day before.",
      role: 'perfect-load',
      run: (input: IBacktestInput): Promise<IPlanInterval[]> => LpStrategyHelper.runRolling(solver, input),
    };
  }

  public static oracle(solver: ILpSolver): IBacktestStrategy {
    return {
      id: 'oracle',
      label: 'Perfect-hindsight oracle',
      description:
        'Solves the whole month at once knowing every interval in advance and minimizing only the bill, without carbon or wear costs. No real controller can do this; it is the ceiling on bill savings the others are measured against.',
      role: 'oracle',
      run: (input: IBacktestInput): Promise<IPlanInterval[]> => LpStrategyHelper.runOracle(solver, input),
    };
  }

  public static async runRolling(solver: ILpSolver, input: IBacktestInput): Promise<IPlanInterval[]> {
    const planned: IPlanInterval[] = [];
    let pulseSocKwh = input.initialPulseSocKwh;
    let spinSocKwh = input.initialSpinSocKwh;
    let pulseNetKw = 0;

    for (const [startIndex, endIndex] of LpStrategyHelper.dayRanges(input.intervals)) {
      const peakSoFar = TariffHelper.peakSoFar(
        input.schedule,
        input.intervals.slice(0, startIndex),
        planned.map((interval: IPlanInterval) => interval.gridKw),
      );
      const lpInput = LpStrategyHelper.lpInput(input, startIndex, endIndex, {
        peakSoFarOnPeakKw: peakSoFar.onPeakKw,
        peakSoFarAllHoursKw: peakSoFar.allHoursKw,
        initialPulseSocKwh: pulseSocKwh,
        initialSpinSocKwh: spinSocKwh,
        initialPulseNetKw: pulseNetKw,
      });
      const dayIntervals = LpStrategyHelper.solvedIntervals(await solver.solve(lpInput), lpInput);
      const lastInterval = dayIntervals[dayIntervals.length - 1];
      pulseSocKwh = lastInterval.pulseSocKwh;
      spinSocKwh = lastInterval.spinSocKwh;
      pulseNetKw = lastInterval.pulseDischargeKw - lastInterval.pulseChargeKw;
      planned.push(...dayIntervals);
    }

    return planned;
  }

  public static async runForecastRolling(solver: ILpSolver, input: IBacktestInput): Promise<IPlanInterval[]> {
    const replayed: IPlanInterval[] = [];
    const isOnPeakBasis = input.schedule.demandBasis === 'on-peak';
    const stepHours = input.intervals[0]?.hours ?? 0.25;
    const terminalPulseSocKwh =
      Math.min(input.assets.pulse.maxSocFraction, backtestSettings.FORECAST_TERMINAL_PULSE_FRACTION) *
      input.assets.pulse.energyKwh;
    let state: IReplayState = {
      pulseSocKwh: input.initialPulseSocKwh,
      spinSocKwh: input.initialSpinSocKwh,
      pulseNetKw: 0,
      billedPeakKw: 0,
      billedLoadPeakKw: 0,
      facilitiesPeakKw: 0,
      facilitiesLoadPeakKw: 0,
    };

    for (const [startIndex, endIndex] of LpStrategyHelper.dayRanges(input.intervals)) {
      const forecastKw = SiteLoadForecastHelper.forecastDay(input.site, input.intervals[startIndex].localDate);
      const planInput = LpStrategyHelper.lpInput(input, startIndex, endIndex, {
        peakSoFarOnPeakKw: isOnPeakBasis ? state.billedPeakKw : 0,
        peakSoFarAllHoursKw: state.facilitiesPeakKw,
        initialPulseSocKwh: state.pulseSocKwh,
        initialSpinSocKwh: state.spinSocKwh,
        initialPulseNetKw: state.pulseNetKw,
      });
      const lpInput: ILpInput = {
        ...planInput,
        request: { ...planInput.request, terminalPulseSocKwh: Math.max(state.pulseSocKwh, terminalPulseSocKwh) },
        loadKw: planInput.loadKw.map((actualKw: number, index: number) => forecastKw[index] ?? actualKw),
      };
      const planned = await LpStrategyHelper.solveWithFallback(solver, lpInput);
      const onPeakMask = input.onPeakMask.slice(startIndex, endIndex);
      const day = PlanReplayHelper.replayDay({
        assets: input.assets,
        loadKw: input.loadKw.slice(startIndex, endIndex),
        planned,
        billedMask: onPeakMask.map((isOnPeak: boolean) => !isOnPeakBasis || isOnPeak),
        rushHourMask: input.rushHourMask.slice(startIndex, endIndex),
        wattsmartReserveKwh: input.wattsmartReserveKwh,
        stepHours,
        state,
      });
      state = day.state;
      replayed.push(...day.intervals);
    }

    return replayed;
  }

  public static async solveWithFallback(solver: ILpSolver, lpInput: ILpInput): Promise<IPlanInterval[]> {
    const result = await solver.solve(lpInput);

    if (result.status === 'optimal') {
      return result.intervals;
    }

    const relaxed: ILpInput = {
      ...lpInput,
      request: { ...lpInput.request, initialPulseNetKw: undefined, terminalPulseSocKwh: undefined },
    };

    return LpStrategyHelper.solvedIntervals(await solver.solve(relaxed), relaxed);
  }

  public static async runOracle(solver: ILpSolver, input: IBacktestInput): Promise<IPlanInterval[]> {
    const monthInput = LpStrategyHelper.lpInput(input, 0, input.intervals.length, {
      peakSoFarOnPeakKw: 0,
      peakSoFarAllHoursKw: 0,
      initialPulseSocKwh: input.initialPulseSocKwh,
      initialSpinSocKwh: input.initialSpinSocKwh,
      initialPulseNetKw: 0,
    });
    const { spin, pulse } = monthInput.assets;
    const lpInput: ILpInput = {
      ...monthInput,
      request: { ...monthInput.request, co2WeightPerKg: 0 },
      assets: {
        ...monthInput.assets,
        spin: { ...spin, degradationCostPerKwh: 0 },
        pulse: { ...pulse, degradationCostPerKwh: 0 },
      },
    };

    return LpStrategyHelper.solvedIntervals(await solver.solve(lpInput), lpInput);
  }

  public static dayRanges(intervals: IInterval[]): [number, number][] {
    const ranges: [number, number][] = [];

    for (let i = 0; i < intervals.length; i++) {
      if (i === 0 || intervals[i].localDate !== intervals[i - 1].localDate) {
        ranges.push([i, i + 1]);
      } else {
        ranges[ranges.length - 1][1] = i + 1;
      }
    }

    return ranges;
  }

  private static lpInput(
    input: IBacktestInput,
    startIndex: number,
    endIndex: number,
    state: Pick<
      ILpInput['request'],
      'peakSoFarOnPeakKw' | 'peakSoFarAllHoursKw' | 'initialPulseSocKwh' | 'initialSpinSocKwh' | 'initialPulseNetKw'
    >,
  ): ILpInput {
    const intervals = input.intervals
      .slice(startIndex, endIndex)
      .map((interval: IInterval, index: number) => ({ ...interval, index }));
    const firstDate = intervals[0].localDate;
    const dayCount = new Set(intervals.map((interval: IInterval) => interval.localDate)).size;

    return {
      request: {
        ...PlanEngineHelper.defaultRequest(input.site, input.assets, input.schedule, firstDate),
        horizonDays: dayCount,
        wattsmartReserveKwh: input.wattsmartReserveKwh,
        ...state,
      },
      schedule: input.schedule,
      assets: input.assets,
      intervals,
      loadKw: input.loadKw.slice(startIndex, endIndex),
      onPeakMask: input.onPeakMask.slice(startIndex, endIndex),
      energyPricePerKwh: input.energyPricePerKwh.slice(startIndex, endIndex),
      marginalKgCo2PerKwh: input.marginalKgCo2PerKwh.slice(startIndex, endIndex),
      rushHourMask: input.rushHourMask.slice(startIndex, endIndex),
      rushHourWindows: [],
      monthToDateIntervals: [],
      monthToDateLoadKw: [],
    };
  }

  private static solvedIntervals(result: IPlanResult, lpInput: ILpInput): IPlanInterval[] {
    if (result.status !== 'optimal') {
      throw new Error(
        `The LP could not plan ${lpInput.request.date} (${lpInput.request.horizonDays} days): ${result.errorMessage ?? result.status}`,
      );
    }

    return result.intervals;
  }
}
