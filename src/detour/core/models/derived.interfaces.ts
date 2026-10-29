import { IAverageEmissionsPoint, IMarginalEmissionsSeries } from './emissions.interfaces';
import { IForecastScore, ILoadForecast } from './forecast.interfaces';

export interface IDerivedSignals {
  version: 1;
  derivedAt: string;
  marginalEmissions: IMarginalEmissionsSeries[];
  averageEmissions: IAverageEmissionsPoint[];
  forecastScore: IForecastScore;
  loadForecast: ILoadForecast | null;
}
