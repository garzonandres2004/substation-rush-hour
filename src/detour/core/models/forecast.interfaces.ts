import { IProvenance } from './provenance.interfaces';

export interface IForecastScore {
  mapePercent: number;
  biasPercent: number;
  peakUnderForecastRate: number;
  meanPeakMissMw: number;
  hoursScored: number;
  daysScored: number;
  startDate: string;
  endDate: string;
  provenance: IProvenance[];
}

export interface ILoadForecastHour {
  hour: number;
  p10Mw: number;
  p50Mw: number;
  p90Mw: number;
}

export interface IForecastComparisonRow {
  id: string;
  label: string;
  score: IForecastScore;
  provenance: IProvenance;
}

export interface ILoadForecast {
  targetHours: ILoadForecastHour[];
  comparison: IForecastComparisonRow[];
  coveragePercent: number;
  lambda: number;
  featureCount: number;
  hoursScored: number;
  weatherPulledAt: string;
}
