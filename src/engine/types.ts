export interface Hour {
  t: string;
  demand?: number;
  demandEiaFcst?: number;
  solar?: number;
  wind?: number;
  coal?: number;
  gas?: number;
  genTotal?: number;
  temp?: number;
  rad?: number;
  cloud?: number;
  lmp?: number;
  mcc?: number;
  mce?: number;
}

export interface Asset {
  powerMW: number;
  energyMWh: number;
  socMinFrac: number;
  socMaxFrac: number;
  startSocFrac: number;
  roundTripEff: number;
  cycleCostPerMWh: number;
}

export interface Params {
  asset: Asset;
  stressPremium: number;
  stressWeights: { demand: number; netLoad: number; ramp: number; price: number };
  congestedThreshold: number;
  capacityPercentile: number;
  overloadPenalty: number;
  cleanOverloadPenalty: number;
  substationPeakMW: number;
  historyDays: number;
}

export interface Schedule {
  charge: number[];
  discharge: number[];
  soc: number[];
}

export interface DayInputs {
  date: string;
  hourLocal: number[];
  t: string[];
  lmp: number[];
  mcc: number[];
  mce: number[];
  demandHat: number[];
  solarHat: number[];
  windHat: number[];
  netLoadHat: number[];
  loadMW: number[];
  capMW: number;
  stress: number[];
  comps: { demand: number[]; netLoad: number[]; ramp: number[]; price: number[] };
  actual?: { demand: (number | undefined)[]; eiaFcst: (number | undefined)[] };
}

export interface Scorecard {
  marketValue: number;
  cycleCost: number;
  netValue: number;
  congestedHours: number;
  congestedEnergyRelievedMWh: number;
  peakBeforeMW: number;
  peakAfterMW: number;
  peakReductionMW: number;
  overloadBeforeMWh: number;
  overloadAfterMWh: number;
  overloadHoursBefore: number;
  overloadHoursAfter: number;
  avgStressWhenCharging: number;
  avgStressWhenDischarging: number;
  throughputMWh: number;
  equivalentCycles: number;
  checks: Record<string, boolean>;
}
