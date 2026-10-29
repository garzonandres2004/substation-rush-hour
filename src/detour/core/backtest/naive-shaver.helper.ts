import { IPlanInterval, IPulseParameters } from '../models';
import { siteGeneratorSettings } from '../sites/sites.constants';
import { backtestSettings } from './backtest.constants';
import { IBacktestInput, IBacktestStrategy } from './backtest.interfaces';

export class NaiveShaverHelper {
  public static readonly noStorage: IBacktestStrategy = {
    id: 'no-storage',
    label: 'No storage',
    description: 'The site as metered today: every kW comes from the grid.',
    role: 'baseline',
    run: (input: IBacktestInput): Promise<IPlanInterval[]> => Promise.resolve(NaiveShaverHelper.runNoStorage(input)),
  };

  public static readonly naiveShaver: IBacktestStrategy = {
    id: 'naive-shaver',
    label: 'Fixed-threshold battery',
    description:
      'Discharges Spin first and then Pulse whenever the site load is above 80% of its nominal peak, and recharges off-peak under that line. It does not read prices or forecasts.',
    role: 'heuristic',
    run: (input: IBacktestInput): Promise<IPlanInterval[]> => Promise.resolve(NaiveShaverHelper.runShaver(input)),
  };

  public static targetKw(input: IBacktestInput): number {
    return backtestSettings.NAIVE_TARGET_FRACTION * input.site.nominalPeakKw;
  }

  public static runNoStorage(input: IBacktestInput): IPlanInterval[] {
    return input.intervals.map((interval, index: number) => ({
      startUtc: interval.startUtc,
      loadKw: input.loadKw[index],
      gridKw: input.loadKw[index],
      spinChargeKw: 0,
      spinDischargeKw: 0,
      pulseChargeKw: 0,
      pulseDischargeKw: 0,
      spinSocKwh: 0,
      pulseSocKwh: 0,
      isOnPeak: input.onPeakMask[index],
      energyPricePerKwh: input.energyPricePerKwh[index],
      marginalKgCo2PerKwh: input.marginalKgCo2PerKwh[index],
    }));
  }

  public static runShaver(input: IBacktestInput): IPlanInterval[] {
    const { spin, pulse } = input.assets;
    const stepHours = input.intervals[0]?.hours ?? 0.25;
    const target = NaiveShaverHelper.targetKw(input);
    const spinEfficiency = Math.sqrt(spin.roundTripEfficiency);
    const spinRetention = 1 - spin.selfDischargePerStep;
    const pulseFloorKwh = pulse.minSocFraction * pulse.energyKwh + input.wattsmartReserveKwh;
    const pulseCeilingKwh = pulse.maxSocFraction * pulse.energyKwh;
    const dischargeCapKw = Math.min(
      pulse.powerKw,
      pulse.rampLimitKwPerStep + siteGeneratorSettings.MIN_LOAD_FRACTION * input.site.nominalPeakKw,
    );
    let pulseSoc = input.initialPulseSocKwh;
    let spinSoc = input.initialSpinSocKwh;
    let pulseNet = 0;
    let peakSoFar = 0;

    return input.intervals.map((interval, index: number): IPlanInterval => {
      const load = input.loadKw[index];
      peakSoFar = Math.max(peakSoFar, load);
      const retainedSpin = spinSoc * spinRetention;
      let spinDischarge = 0;
      let spinCharge = 0;
      let pulseDischarge = 0;
      let pulseCharge = 0;

      if (load > target) {
        const need = load - target;
        spinDischarge = Math.min(need, spin.powerKw, (retainedSpin * spinEfficiency) / stepHours);
        const remaining = need - spinDischarge;
        const pulseMax = NaiveShaverHelper.maxPulseDischarge(
          pulse,
          pulseSoc,
          pulseFloorKwh,
          pulseNet,
          Math.min(dischargeCapKw, remaining),
          stepHours,
        );
        pulseDischarge = pulseMax;
      } else if (!input.onPeakMask[index]) {
        const headroom = Math.max(0, Math.min(target, peakSoFar) - load);
        spinCharge = Math.min(headroom, spin.powerKw, ((spin.energyKwh - retainedSpin) / (spinEfficiency * stepHours)));
        spinCharge = Math.max(0, spinCharge);
        pulseCharge = Math.max(
          0,
          Math.min(
            headroom - spinCharge,
            pulse.rampLimitKwPerStep,
            pulse.powerKw,
            (pulseCeilingKwh - pulseSoc) / (pulse.chargeEfficiency * stepHours),
          ),
        );
      }

      let net = pulseDischarge - pulseCharge;
      const forcedFloor = pulseNet - pulse.rampLimitKwPerStep;

      if (net < forcedFloor) {
        net = Math.min(forcedFloor, load);
      }

      if (net > pulseNet + pulse.rampLimitKwPerStep) {
        net = pulseNet + pulse.rampLimitKwPerStep;
      }

      pulseDischarge = Math.max(0, net);
      pulseCharge = Math.max(0, -net);
      pulseNet = net;

      pulseSoc =
        pulseSoc + pulse.chargeEfficiency * pulseCharge * stepHours - (pulseDischarge * stepHours) / pulse.dischargeEfficiency;
      spinSoc = retainedSpin + spinEfficiency * spinCharge * stepHours - (spinDischarge * stepHours) / spinEfficiency;

      return {
        startUtc: interval.startUtc,
        loadKw: load,
        gridKw: load - spinDischarge - pulseDischarge + spinCharge + pulseCharge,
        spinChargeKw: spinCharge,
        spinDischargeKw: spinDischarge,
        pulseChargeKw: pulseCharge,
        pulseDischargeKw: pulseDischarge,
        spinSocKwh: spinSoc,
        pulseSocKwh: pulseSoc,
        isOnPeak: input.onPeakMask[index],
        energyPricePerKwh: input.energyPricePerKwh[index],
        marginalKgCo2PerKwh: input.marginalKgCo2PerKwh[index],
      };
    });
  }

  public static maxPulseDischarge(
    pulse: IPulseParameters,
    socKwh: number,
    floorKwh: number,
    previousNetKw: number,
    wantedKw: number,
    stepHours: number,
  ): number {
    const rampCeilingKw = previousNetKw + pulse.rampLimitKwPerStep;
    let high = Math.min(wantedKw, pulse.powerKw, rampCeilingKw);

    if (high <= 0 || socKwh <= floorKwh) {
      return 0;
    }

    let low = 0;

    for (let iteration = 0; iteration < 24; iteration++) {
      const middle = (low + high) / 2;
      const tailKw = NaiveShaverHelper.rampDownTailKw(middle, pulse.rampLimitKwPerStep);
      const drawKwh = ((middle + tailKw) * stepHours) / pulse.dischargeEfficiency;

      if (socKwh - drawKwh >= floorKwh) {
        low = middle;
      } else {
        high = middle;
      }
    }

    return low;
  }

  private static rampDownTailKw(dischargeKw: number, rampLimitKw: number): number {
    let tailKw = 0;

    for (let remaining = dischargeKw - rampLimitKw; remaining > 0; remaining -= rampLimitKw) {
      tailKw += remaining;
    }

    return tailKw;
  }
}
