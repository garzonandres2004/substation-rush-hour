import { IAverageEmissionsPoint, IMarginalEmissionsPoint, IMarginalEmissionsSeries, IProvenance } from '../models';
import { MefMethod, MefSeason } from '../models/emissions.types';
import { emissionFactors, mefSeasonMonths, signalsConfig } from './signals.constants';
import { IEmissionsRow, IIntensityTotals, IRegressionResult, IRegressionSamples } from './signals.interfaces';

export class EmissionsHelper {
  private static readonly _hourMs = 3_600_000;
  private static readonly _seasons: MefSeason[] = ['summer', 'winter'];

  public static buildRows(hours: Detour.Firestore.Snapshot.IGridHour[]): IEmissionsRow[] {
    const sorted = [...hours].sort((first, second) => EmissionsHelper._utcMs(first) - EmissionsHelper._utcMs(second));

    return sorted.map((hour) => {
      const coal = hour.fuelMw?.['COL'] ?? null;
      const gas = hour.fuelMw?.['NG'] ?? null;
      const fossilKnown = coal !== null && gas !== null;
      const generationValues = Object.values(hour.fuelMw ?? {}).filter((value): value is number => value !== null);
      const localDate = hour.localHourStart.slice(0, 10);

      return {
        utcMs: EmissionsHelper._utcMs(hour),
        localDate,
        localHour: Number(hour.localHourStart.slice(11, 13)),
        season: EmissionsHelper.seasonOf(Number(hour.localHourStart.slice(5, 7))),
        demandMw: hour.demandMw,
        fossilMw: fossilKnown ? coal + gas : null,
        emissionsLbPerHour: fossilKnown
          ? coal * emissionFactors.COAL.lbPerMwh + gas * emissionFactors.GAS.lbPerMwh
          : null,
        generationMw: generationValues.length > 0 ? generationValues.reduce((sum, value) => sum + value, 0) : null,
      };
    });
  }

  public static seasonOf(month: number): MefSeason {
    return mefSeasonMonths.SUMMER.includes(month) ? 'summer' : 'winter';
  }

  public static ols(predictors: number[], responses: number[]): IRegressionResult {
    const sampleCount = predictors.length;

    if (sampleCount < 2) {
      return { slope: 0, intercept: sampleCount === 1 ? responses[0] : 0, slopeStandardError: NaN, n: sampleCount };
    }

    const meanPredictor = predictors.reduce((sum, value) => sum + value, 0) / sampleCount;
    const meanResponse = responses.reduce((sum, value) => sum + value, 0) / sampleCount;
    let sumSquaresX = 0;
    let sumCross = 0;

    for (let i = 0; i < sampleCount; i++) {
      sumSquaresX += (predictors[i] - meanPredictor) ** 2;
      sumCross += (predictors[i] - meanPredictor) * (responses[i] - meanResponse);
    }

    if (sumSquaresX === 0) {
      return { slope: 0, intercept: meanResponse, slopeStandardError: NaN, n: sampleCount };
    }

    const slope = sumCross / sumSquaresX;
    const intercept = meanResponse - slope * meanPredictor;

    if (sampleCount < 3) {
      return { slope, intercept, slopeStandardError: NaN, n: sampleCount };
    }

    let residualSumSquares = 0;

    for (let i = 0; i < sampleCount; i++) {
      residualSumSquares += (responses[i] - (intercept + slope * predictors[i])) ** 2;
    }

    return { slope, intercept, slopeStandardError: Math.sqrt(residualSumSquares / (sampleCount - 2) / sumSquaresX), n: sampleCount };
  }

  public static marginalSeries(rows: IEmissionsRow[], method: MefMethod): IMarginalEmissionsSeries {
    const strata = new Map<string, IRegressionSamples>();

    for (let i = 1; i < rows.length; i++) {
      const previous = rows[i - 1];
      const current = rows[i];
      const previousLoad = method === 'demand' ? previous.demandMw : previous.fossilMw;
      const currentLoad = method === 'demand' ? current.demandMw : current.fossilMw;

      if (
        current.utcMs - previous.utcMs !== EmissionsHelper._hourMs ||
        previousLoad === null ||
        currentLoad === null ||
        previous.emissionsLbPerHour === null ||
        current.emissionsLbPerHour === null
      ) {
        continue;
      }

      const key = `${current.season}-${current.localHour}`;
      const stratum = strata.get(key) ?? { predictors: [], responses: [] };
      stratum.predictors.push(currentLoad - previousLoad);
      stratum.responses.push(current.emissionsLbPerHour - previous.emissionsLbPerHour);
      strata.set(key, stratum);
    }

    const points: IMarginalEmissionsPoint[] = [];

    for (const season of EmissionsHelper._seasons) {
      for (let hour = 0; hour < 24; hour++) {
        const stratum = strata.get(`${season}-${hour}`);

        if (!stratum || stratum.predictors.length < 3) {
          continue;
        }

        const fit = EmissionsHelper.ols(stratum.predictors, stratum.responses);
        const margin = signalsConfig.Z_95 * fit.slopeStandardError;

        points.push({
          hour,
          season,
          lbPerMwh: fit.slope,
          ciLowLbPerMwh: fit.slope - margin,
          ciHighLbPerMwh: fit.slope + margin,
          n: fit.n,
        });
      }
    }

    return { method, points, provenance: EmissionsHelper._provenance() };
  }

  public static averageIntensity(rows: IEmissionsRow[]): IAverageEmissionsPoint[] {
    const totals = new Map<string, IIntensityTotals>();

    for (const row of rows) {
      if (row.emissionsLbPerHour === null || row.generationMw === null) {
        continue;
      }

      const key = `${row.season}-${row.localHour}`;
      const total = totals.get(key) ?? { emissions: 0, generation: 0, count: 0 };
      total.emissions += row.emissionsLbPerHour;
      total.generation += row.generationMw;
      total.count += 1;
      totals.set(key, total);
    }

    const points: IAverageEmissionsPoint[] = [];

    for (const season of EmissionsHelper._seasons) {
      for (let hour = 0; hour < 24; hour++) {
        const total = totals.get(`${season}-${hour}`);

        if (!total || total.generation <= 0) {
          continue;
        }

        points.push({ hour, season, lbPerMwh: total.emissions / total.generation, n: total.count });
      }
    }

    return points;
  }

  private static _utcMs(hour: Detour.Firestore.Snapshot.IGridHour): number {
    return Date.parse(`${hour.utcHourEnding.slice(0, 13)}:00:00Z`);
  }

  private static _provenance(): IProvenance[] {
    return [
      {
        id: 'eia930-fuel-type',
        label: 'EIA-930 hourly generation by fuel type, PACE balancing authority',
        kind: 'eia-930',
        url: 'https://www.eia.gov/opendata/browser/electricity/rto/fuel-type-data',
      },
      {
        id: 'eia930-region-data',
        label: 'EIA-930 hourly demand, PACE balancing authority',
        kind: 'eia-930',
        url: 'https://www.eia.gov/opendata/browser/electricity/rto/region-data',
      },
      emissionFactors.COAL.provenance,
      emissionFactors.GAS.provenance,
    ];
  }
}
