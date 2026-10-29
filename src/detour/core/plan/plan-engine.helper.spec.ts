import highsLoader, { Highs } from 'highs';
import {
  IMarginalEmissionsPoint,
  IMarginalEmissionsSeries,
  IPlanInterval,
  IStationAssets,
  ITariffSchedule,
} from '../models';
import { stationAssets } from '../sites/asset.constants';
import { siteArchetypes } from '../sites/sites.constants';
import { tariffSchedules } from '../tariff/tariff.constants';
import { LpBuilderHelper } from './lp-builder.helper';
import { placeholderMefSeries } from './placeholder-mef.constants';
import { PlanEngineHelper } from './plan-engine.helper';
import { ILpInput } from './plan-engine.interfaces';

const site = siteArchetypes.AIRPORT;
const airportAssets = stationAssets['airport'];
const scheduleEight = tariffSchedules.SCHEDULE_8 as ITariffSchedule;

const buildInput = (
  assets: IStationAssets,
  date: string,
  co2WeightPerKg: number,
  wattsmartReserveKwh: number,
  mef: IMarginalEmissionsSeries = placeholderMefSeries,
): ILpInput => {
  const request = {
    ...PlanEngineHelper.defaultRequest(site, assets, scheduleEight, date),
    co2WeightPerKg,
    wattsmartReserveKwh,
  };

  return PlanEngineHelper.buildInput(
    site,
    assets,
    scheduleEight,
    request,
    mef,
    PlanEngineHelper.rushHourWindows([], date),
  );
};

describe('plan engine', () => {
  let highs: Highs;

  beforeAll(async () => {
    highs = await highsLoader();
  });

  it('bills a battery-off plan identically to the baseline', () => {
    const offAssets: IStationAssets = {
      ...airportAssets,
      spin: { ...airportAssets.spin, powerKw: 0, energyKwh: 0 },
      pulse: { ...airportAssets.pulse, powerKw: 0, energyKwh: 0, rampLimitKwPerStep: 0 },
    };
    const result = PlanEngineHelper.solve(highs, buildInput(offAssets, '2026-07-15', 0.1, 0));

    expect(result.status).toBe('optimal');
    expect(result.plannedBill.total).toBe(result.baselineBill.total);
    expect(result.metrics?.rushPeakCutKw).toBe(0);
    result.intervals.forEach((planInterval: IPlanInterval) => {
      expect(planInterval.gridKw).toBeCloseTo(planInterval.loadKw, 6);
    });
  });

  it('flattens on-peak grid to the off-peak max with an unlimited battery', () => {
    const bigAssets: IStationAssets = {
      ...airportAssets,
      spin: { ...airportAssets.spin, powerKw: airportAssets.spin.powerKw * 100, energyKwh: airportAssets.spin.energyKwh * 100 },
      pulse: {
        ...airportAssets.pulse,
        powerKw: airportAssets.pulse.powerKw * 100,
        energyKwh: airportAssets.pulse.energyKwh * 100,
        rampLimitKwPerStep: 1e9,
      },
    };
    const input = buildInput(bigAssets, '2026-07-15', 0, 0);
    input.request = { ...input.request, peakSoFarOnPeakKw: 0, peakSoFarAllHoursKw: 0 };
    const result = PlanEngineHelper.solve(highs, input);
    const onPeak = result.intervals.filter((planInterval: IPlanInterval) => planInterval.isOnPeak);
    const offPeak = result.intervals.filter((planInterval: IPlanInterval) => !planInterval.isOnPeak);
    const maxOnPeakGrid = Math.max(...onPeak.map((planInterval: IPlanInterval) => planInterval.gridKw));
    const maxOffPeakGrid = Math.max(...offPeak.map((planInterval: IPlanInterval) => planInterval.gridKw));
    const maxOnPeakLoad = Math.max(...onPeak.map((planInterval: IPlanInterval) => planInterval.loadKw));

    expect(result.status).toBe('optimal');
    expect(maxOnPeakGrid).toBeLessThanOrEqual(maxOffPeakGrid + 1e-6);
    expect(maxOnPeakGrid).toBeLessThan(maxOnPeakLoad);
  });

  it('ignores the marginal emissions series entirely when lambda is zero', () => {
    const reversedMef: IMarginalEmissionsSeries = {
      ...placeholderMefSeries,
      points: placeholderMefSeries.points.map((point: IMarginalEmissionsPoint, i: number, points: IMarginalEmissionsPoint[]) => ({
        ...point,
        lbPerMwh: points[points.length - 1 - i].lbPerMwh,
      })),
    };
    const placeholderInput = buildInput(airportAssets, '2026-07-15', 0, 0);
    const reversedInput = buildInput(airportAssets, '2026-07-15', 0, 0, reversedMef);
    const placeholderResult = PlanEngineHelper.solve(highs, placeholderInput);
    const reversedResult = PlanEngineHelper.solve(highs, reversedInput);

    expect(LpBuilderHelper.build(placeholderInput).lpText).toBe(LpBuilderHelper.build(reversedInput).lpText);
    expect(reversedResult.intervals.map((planInterval: IPlanInterval) => planInterval.gridKw)).toEqual(
      placeholderResult.intervals.map((planInterval: IPlanInterval) => planInterval.gridKw),
    );
  });

  it('applies the hourly marginal emissions value to every quarter-hour interval', () => {
    const input = buildInput(airportAssets, '2026-07-15', 0.1, 0);
    const summerValues = input.marginalKgCo2PerKwh.slice(0, 96);

    for (let hour = 0; hour < 24; hour++) {
      const quarterHourValues = summerValues.slice(hour * 4, hour * 4 + 4);

      expect(new Set(quarterHourValues).size).toBe(1);
      expect(quarterHourValues[0]).toBeGreaterThan(0);
    }
  });

  it('keeps Spin and Pulse state of charge within bounds with a Wattsmart reserve', () => {
    const result = PlanEngineHelper.solve(highs, buildInput(airportAssets, '2026-07-15', 0.1, 500));
    const pulseMinKwh = airportAssets.pulse.minSocFraction * airportAssets.pulse.energyKwh;
    const pulseMaxKwh = airportAssets.pulse.maxSocFraction * airportAssets.pulse.energyKwh;

    expect(result.status).toBe('optimal');
    result.intervals.forEach((planInterval: IPlanInterval) => {
      expect(planInterval.pulseSocKwh).toBeGreaterThanOrEqual(pulseMinKwh - 1e-6);
      expect(planInterval.pulseSocKwh).toBeLessThanOrEqual(pulseMaxKwh + 1e-6);
      expect(planInterval.spinSocKwh).toBeGreaterThanOrEqual(-1e-6);
      expect(planInterval.spinSocKwh).toBeLessThanOrEqual(airportAssets.spin.energyKwh + 1e-6);
    });
  });
});
