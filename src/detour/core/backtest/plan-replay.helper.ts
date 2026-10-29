import { IPlanInterval, IPulseParameters } from '../models';
import { IReplayDayInput, IReplayDayResult, IReplayLimits, IReplayState } from './backtest.interfaces';
import { NaiveShaverHelper } from './naive-shaver.helper';

export class PlanReplayHelper {
  public static replayDay(input: IReplayDayInput): IReplayDayResult {
    const { assets, planned, loadKw, billedMask, stepHours } = input;
    const { spin, pulse } = assets;
    const spinEfficiency = Math.sqrt(spin.roundTripEfficiency);
    const spinRetention = 1 - spin.selfDischargePerStep;
    const pulseMinKwh = pulse.minSocFraction * pulse.energyKwh;
    const pulseMaxKwh = pulse.maxSocFraction * pulse.energyKwh;
    const guardFloorKwh = pulseMinKwh + input.wattsmartReserveKwh;
    const state: IReplayState = { ...input.state };
    let billedCapKw = Math.max(
      state.billedPeakKw,
      ...planned.filter((_: IPlanInterval, t: number) => billedMask[t]).map((entry: IPlanInterval) => entry.gridKw),
    );
    let facilitiesCapKw = Math.max(state.facilitiesPeakKw, ...planned.map((entry: IPlanInterval) => entry.gridKw));
    const intervals: IPlanInterval[] = [];

    for (let t = 0; t < planned.length; t++) {
      const plan = planned[t];
      const load = loadKw[t];
      const retainedSpinKwh = state.spinSocKwh * spinRetention;
      const pulseChargeMaxKw = PlanReplayHelper.maxPulseCharge(
        pulse,
        pulseMaxKwh - state.pulseSocKwh,
        stepHours,
      );
      const limits: IReplayLimits = {
        spinDischargeMaxKw: Math.max(0, Math.min(spin.powerKw, (retainedSpinKwh * spinEfficiency) / stepHours)),
        spinChargeMaxKw: Math.max(0, Math.min(spin.powerKw, (spin.energyKwh - retainedSpinKwh) / (spinEfficiency * stepHours))),
        pulseChargeMaxKw,
        pulseLowestNetKw: Math.max(state.pulseNetKw - pulse.rampLimitKwPerStep, -pulseChargeMaxKw),
        pulseHighestNetKw: state.pulseNetKw + pulse.rampLimitKwPerStep,
      };
      const plannedFloorKwh = pulseMinKwh + (input.rushHourMask[t] ? input.wattsmartReserveKwh : 0);
      let spinNetKw = Math.min(limits.spinDischargeMaxKw, Math.max(-limits.spinChargeMaxKw, plan.spinDischargeKw - plan.spinChargeKw));
      let pulseNetKw = PlanReplayHelper.plannedPulseNet(input, state, limits, plan, plannedFloorKwh);
      if (billedMask[t]) {
        state.billedLoadPeakKw = Math.max(state.billedLoadPeakKw, load);
      }

      state.facilitiesLoadPeakKw = Math.max(state.facilitiesLoadPeakKw, load);
      const facilitiesChargeCapKw = Math.max(state.facilitiesPeakKw, state.facilitiesLoadPeakKw, billedCapKw);
      const chargeCapKw = billedMask[t]
        ? Math.min(Math.max(state.billedPeakKw, state.billedLoadPeakKw), facilitiesChargeCapKw)
        : facilitiesChargeCapKw;
      let chargeExcessKw = load - spinNetKw - pulseNetKw - chargeCapKw;

      if (chargeExcessKw > 0 && spinNetKw < 0) {
        const cutKw = Math.min(chargeExcessKw, -spinNetKw);
        spinNetKw += cutKw;
        chargeExcessKw -= cutKw;
      }

      if (chargeExcessKw > 0 && pulseNetKw < 0) {
        pulseNetKw += Math.max(0, Math.min(chargeExcessKw, -pulseNetKw, limits.pulseHighestNetKw - pulseNetKw));
      }

      const capKw = billedMask[t] ? Math.min(billedCapKw, facilitiesCapKw) : facilitiesCapKw;
      let excessKw = load - spinNetKw - pulseNetKw - capKw;

      if (excessKw > 0 && spinNetKw < 0) {
        const cutKw = Math.min(excessKw, -spinNetKw);
        spinNetKw += cutKw;
        excessKw -= cutKw;
      }

      if (excessKw > 0 && pulseNetKw < 0) {
        const cutKw = Math.max(0, Math.min(excessKw, -pulseNetKw, limits.pulseHighestNetKw - pulseNetKw));
        pulseNetKw += cutKw;
        excessKw -= cutKw;
      }

      if (excessKw > 0 && billedMask[t]) {
        const guardKw = NaiveShaverHelper.maxPulseDischarge(
          pulse,
          state.pulseSocKwh,
          guardFloorKwh,
          state.pulseNetKw,
          pulseNetKw + excessKw,
          stepHours,
        );
        const pulseExtraKw = Math.max(0, guardKw - pulseNetKw);
        pulseNetKw += pulseExtraKw;
        excessKw -= pulseExtraKw;
      }

      if (excessKw > 0 && billedMask[t]) {
        const spinExtraKw = Math.max(0, Math.min(excessKw, limits.spinDischargeMaxKw - spinNetKw));
        spinNetKw += spinExtraKw;
        excessKw -= spinExtraKw;
      }

      let facilitiesExcessKw = load - spinNetKw - pulseNetKw - facilitiesChargeCapKw;

      if (facilitiesExcessKw > 0) {
        const guardKw = NaiveShaverHelper.maxPulseDischarge(
          pulse,
          state.pulseSocKwh,
          guardFloorKwh,
          state.pulseNetKw,
          pulseNetKw + facilitiesExcessKw,
          stepHours,
        );
        const pulseExtraKw = Math.max(0, guardKw - pulseNetKw);
        pulseNetKw += pulseExtraKw;
        facilitiesExcessKw -= pulseExtraKw;
      }

      if (facilitiesExcessKw > 0) {
        spinNetKw += Math.max(0, Math.min(facilitiesExcessKw, limits.spinDischargeMaxKw - spinNetKw));
      }

      [spinNetKw, pulseNetKw] = PlanReplayHelper.avoidExport(load, spinNetKw, pulseNetKw, limits);
      pulseNetKw = Math.max(pulseNetKw, -limits.pulseChargeMaxKw);

      const spinDischargeKw = Math.max(0, spinNetKw);
      const spinChargeKw = Math.max(0, -spinNetKw);
      const pulseDischargeKw = Math.max(0, pulseNetKw);
      const pulseChargeKw = Math.max(0, -pulseNetKw);
      const gridKw = load - spinNetKw - pulseNetKw;
      state.spinSocKwh = Math.max(
        0,
        retainedSpinKwh + spinEfficiency * spinChargeKw * stepHours - (spinDischargeKw * stepHours) / spinEfficiency,
      );
      state.pulseSocKwh =
        state.pulseSocKwh + pulse.chargeEfficiency * pulseChargeKw * stepHours - (pulseDischargeKw * stepHours) / pulse.dischargeEfficiency;
      state.pulseNetKw = pulseNetKw;
      state.facilitiesPeakKw = Math.max(state.facilitiesPeakKw, gridKw);
      facilitiesCapKw = Math.max(facilitiesCapKw, gridKw);

      if (billedMask[t]) {
        state.billedPeakKw = Math.max(state.billedPeakKw, gridKw);
        billedCapKw = Math.max(billedCapKw, gridKw);
      }

      intervals.push({
        ...plan,
        loadKw: load,
        gridKw,
        spinChargeKw,
        spinDischargeKw,
        pulseChargeKw,
        pulseDischargeKw,
        spinSocKwh: state.spinSocKwh,
        pulseSocKwh: state.pulseSocKwh,
      });
    }

    return { intervals, state };
  }

  public static maxPulseCharge(pulse: IPulseParameters, headroomKwh: number, stepHours: number): number {
    let low = 0;
    let high = pulse.powerKw;

    if (headroomKwh <= 0) {
      return 0;
    }

    for (let iteration = 0; iteration < 24; iteration++) {
      const middle = (low + high) / 2;
      let tailKw = 0;

      for (let remaining = middle - pulse.rampLimitKwPerStep; remaining > 0; remaining -= pulse.rampLimitKwPerStep) {
        tailKw += remaining;
      }

      if ((middle + tailKw) * stepHours * pulse.chargeEfficiency <= headroomKwh) {
        low = middle;
      } else {
        high = middle;
      }
    }

    return low;
  }

  private static plannedPulseNet(
    input: IReplayDayInput,
    state: IReplayState,
    limits: IReplayLimits,
    plan: IPlanInterval,
    floorKwh: number,
  ): number {
    const plannedNetKw = Math.max(limits.pulseLowestNetKw, plan.pulseDischargeKw - plan.pulseChargeKw);

    if (plannedNetKw <= 0) {
      return Math.min(plannedNetKw, limits.pulseHighestNetKw);
    }

    return NaiveShaverHelper.maxPulseDischarge(
      input.assets.pulse,
      state.pulseSocKwh,
      floorKwh,
      state.pulseNetKw,
      plannedNetKw,
      input.stepHours,
    );
  }

  private static avoidExport(loadKw: number, spinNetKw: number, pulseNetKw: number, limits: IReplayLimits): [number, number] {
    let exportKw = spinNetKw + pulseNetKw - loadKw;

    if (exportKw <= 0) {
      return [spinNetKw, pulseNetKw];
    }

    const pulseCutKw = Math.max(0, Math.min(exportKw, pulseNetKw - Math.max(0, limits.pulseLowestNetKw)));
    pulseNetKw -= pulseCutKw;
    exportKw -= pulseCutKw;
    const spinCutKw = Math.max(0, Math.min(exportKw, spinNetKw + limits.spinChargeMaxKw));
    spinNetKw -= spinCutKw;
    exportKw -= spinCutKw;

    if (exportKw > 0) {
      pulseNetKw -= Math.min(exportKw, Math.max(0, pulseNetKw));
    }

    return [spinNetKw, pulseNetKw];
  }
}
