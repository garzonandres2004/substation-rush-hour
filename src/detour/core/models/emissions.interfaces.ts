import { IProvenance } from './provenance.interfaces';
import { MefMethod, MefSeason } from './emissions.types';

export interface IMarginalEmissionsPoint {
  hour: number;
  season: MefSeason;
  lbPerMwh: number;
  ciLowLbPerMwh: number;
  ciHighLbPerMwh: number;
  n: number;
}

export interface IMarginalEmissionsSeries {
  method: MefMethod;
  points: IMarginalEmissionsPoint[];
  provenance: IProvenance[];
}

export interface IEmissionFactor {
  fuelKey: string;
  label: string;
  lbPerMwh: number;
  provenance: IProvenance;
}

export interface IAverageEmissionsPoint {
  hour: number;
  season: MefSeason;
  lbPerMwh: number;
  n: number;
}
