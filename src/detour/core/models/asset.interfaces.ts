import { IProvenance } from './provenance.interfaces';

export interface ISpinParameters {
  powerKw: number;
  energyKwh: number;
  roundTripEfficiency: number;
  selfDischargePerStep: number;
  cycleLife: number;
  degradationCostPerKwh: number;
}

export interface IPulseParameters {
  powerKw: number;
  energyKwh: number;
  chargeEfficiency: number;
  dischargeEfficiency: number;
  minSocFraction: number;
  maxSocFraction: number;
  rampLimitKwPerStep: number;
  cycleLife: number;
  degradationCostPerKwh: number;
}

export interface IStationAssets {
  siteId: string;
  spin: ISpinParameters;
  pulse: IPulseParameters;
  sources: Record<string, IProvenance>;
}
