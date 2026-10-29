import { IPlanInterval } from '../models';
import { stationAssets } from '../sites/asset.constants';
import { IReplayDayInput } from './backtest.interfaces';
import { PlanReplayHelper } from './plan-replay.helper';

const assets = stationAssets['airport'];
const pulseMinKwh = assets.pulse.minSocFraction * assets.pulse.energyKwh;
const epsilon = 1e-6;

const plannedInterval = (gridKw: number, pulseDischargeKw = 0): IPlanInterval => ({
  startUtc: '2026-07-15T23:00:00.000Z',
  loadKw: gridKw + pulseDischargeKw,
  gridKw,
  spinChargeKw: 0,
  spinDischargeKw: 0,
  pulseChargeKw: 0,
  pulseDischargeKw,
  spinSocKwh: 0,
  pulseSocKwh: 0,
  isOnPeak: true,
  energyPricePerKwh: 0.05,
  marginalKgCo2PerKwh: 0.5,
});

const replayInput = (loadKw: number[], planned: IPlanInterval[], pulseSocKwh: number, spinSocKwh: number): IReplayDayInput => ({
  assets,
  loadKw,
  planned,
  billedMask: loadKw.map(() => true),
  rushHourMask: loadKw.map(() => false),
  wattsmartReserveKwh: 0,
  stepHours: 0.25,
  state: { pulseSocKwh, spinSocKwh, pulseNetKw: 0, billedPeakKw: 0, billedLoadPeakKw: 0, facilitiesPeakKw: 0, facilitiesLoadPeakKw: 0 },
});

describe('plan replay with a real-time cap', () => {
  it('holds the grid at the planned peak when the real load spikes and energy allows', () => {
    const loadKw = [1000, 1000, 1300, 1150, 1000, 1250, 1000];
    const planned = loadKw.map(() => plannedInterval(1000));
    const result = PlanReplayHelper.replayDay(replayInput(loadKw, planned, 2000, assets.spin.energyKwh));

    result.intervals.forEach((interval: IPlanInterval, index: number) => {
      expect(interval.loadKw).toBe(loadKw[index]);
      expect(interval.gridKw).toBeLessThanOrEqual(1000 + epsilon);
      expect(Math.abs(interval.pulseDischargeKw - interval.pulseChargeKw)).toBeLessThanOrEqual(assets.pulse.rampLimitKwPerStep * (index + 1) + epsilon);
    });
    expect(result.state.billedPeakKw).toBeLessThanOrEqual(1000 + epsilon);
  });

  it('clips the planned discharge when Pulse runs short and never goes below its floor', () => {
    const loadKw = new Array(8).fill(1500);
    const planned = loadKw.map(() => plannedInterval(1300, 200));
    const startSocKwh = pulseMinKwh + 60;
    const result = PlanReplayHelper.replayDay(replayInput(loadKw, planned, startSocKwh, 0));
    const dischargedKwh = result.intervals.reduce((sum: number, interval: IPlanInterval) => sum + interval.pulseDischargeKw * 0.25, 0);

    result.intervals.forEach((interval: IPlanInterval) => {
      expect(interval.pulseSocKwh).toBeGreaterThanOrEqual(pulseMinKwh - epsilon);
      expect(interval.gridKw).toBeLessThanOrEqual(interval.loadKw + epsilon);
    });
    expect(dischargedKwh).toBeLessThanOrEqual(60 * assets.pulse.dischargeEfficiency + epsilon);
    expect(dischargedKwh).toBeLessThan(200 * 0.25 * loadKw.length);
    expect(result.intervals[result.intervals.length - 1].gridKw).toBeGreaterThan(1300);
  });

  it('never lets charging in unbilled hours lift the grid above the highest load seen so far', () => {
    const loadKw = new Array(8).fill(1000);
    const planned = loadKw.map(() => ({ ...plannedInterval(1400), pulseChargeKw: 400 }));
    const input = replayInput(loadKw, planned, 1000, 0);
    const result = PlanReplayHelper.replayDay({
      ...input,
      billedMask: loadKw.map(() => false),
      state: { ...input.state, facilitiesLoadPeakKw: 1000 },
    });

    result.intervals.forEach((interval: IPlanInterval) => {
      expect(interval.gridKw).toBeLessThanOrEqual(1000 + epsilon);
    });
    expect(result.state.facilitiesPeakKw).toBeLessThanOrEqual(1000 + epsilon);
  });

  it('starts each month with no charging headroom beyond the load already seen this month', () => {
    const loadKw = [200, 180, 150, 150, 120, 100, 100, 100];
    const planned = loadKw.map(() => ({ ...plannedInterval(700), pulseChargeKw: 500 }));
    const result = PlanReplayHelper.replayDay(replayInput(loadKw, planned, 1000, 0));
    let loadPeakSoFarKw = 0;

    result.intervals.forEach((interval: IPlanInterval, index: number) => {
      loadPeakSoFarKw = Math.max(loadPeakSoFarKw, loadKw[index]);
      expect(interval.gridKw).toBeLessThanOrEqual(loadPeakSoFarKw + epsilon);
    });
  });
});
