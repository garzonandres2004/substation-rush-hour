import { IForecastScore, IProvenance } from '../models';
import { IScoredHour } from './signals.interfaces';
import { signalsConfig } from './signals.constants';

export class ForecastScoreHelper {
  public static score(hours: Detour.Firestore.Snapshot.IGridHour[]): IForecastScore {
    return ForecastScoreHelper.scorePoints(ForecastScoreHelper._scoredHours(hours), [
      {
        id: 'eia930-day-ahead-forecast',
        label: 'EIA-930 day-ahead demand forecast (DF) vs actual demand (D), PACE',
        kind: 'eia-930',
        url: 'https://www.eia.gov/opendata/browser/electricity/rto/region-data',
        seriesId: 'DF,D',
        note: `Hours flagged ${signalsConfig.EXCLUDED_FORECAST_FLAGS.join(', ')} are excluded from scoring`,
      },
    ]);
  }

  public static scorePoints(scored: IScoredHour[], provenance: IProvenance[]): IForecastScore {
    const byDate = new Map<string, IScoredHour[]>();

    for (const hour of scored) {
      byDate.set(hour.localDate, [...(byDate.get(hour.localDate) ?? []), hour]);
    }

    const peakHours: IScoredHour[] = [];

    for (const dayHours of byDate.values()) {
      if (dayHours.length < signalsConfig.MIN_SCORED_HOURS_PER_DAY) {
        continue;
      }

      peakHours.push(dayHours.reduce((peak, hour) => (hour.demandMw > peak.demandMw ? hour : peak)));
    }

    const dates = scored.map((hour) => hour.localDate).sort();

    return {
      mapePercent: ForecastScoreHelper._mean(scored.map((hour) => Math.abs(hour.forecastMw - hour.demandMw) / hour.demandMw)) * 100,
      biasPercent: ForecastScoreHelper._mean(scored.map((hour) => (hour.forecastMw - hour.demandMw) / hour.demandMw)) * 100,
      peakUnderForecastRate:
        ForecastScoreHelper._mean(peakHours.map((hour) => (hour.forecastMw < hour.demandMw ? 1 : 0))) * 100,
      meanPeakMissMw: ForecastScoreHelper._mean(peakHours.map((hour) => hour.demandMw - hour.forecastMw)),
      hoursScored: scored.length,
      daysScored: peakHours.length,
      startDate: dates[0] ?? '',
      endDate: dates[dates.length - 1] ?? '',
      provenance,
    };
  }

  private static _scoredHours(hours: Detour.Firestore.Snapshot.IGridHour[]): IScoredHour[] {
    const scored: IScoredHour[] = [];

    for (const hour of hours) {
      const excluded = hour.flags.some((flag) => signalsConfig.EXCLUDED_FORECAST_FLAGS.includes(flag));

      if (excluded || hour.demandMw === null || hour.dayAheadForecastMw === null || hour.demandMw <= 0) {
        continue;
      }

      scored.push({
        localDate: hour.localHourStart.slice(0, 10),
        demandMw: hour.demandMw,
        forecastMw: hour.dayAheadForecastMw,
      });
    }

    return scored;
  }

  private static _mean(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
}
