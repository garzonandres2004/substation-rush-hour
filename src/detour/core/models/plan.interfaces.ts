import { TariffScheduleId } from './tariff.types';
import { IBillBreakdown } from './tariff.interfaces';

export interface IPlanRequest {
  siteId: string;
  scheduleId: TariffScheduleId;
  date: string;
  horizonDays: number;
  co2WeightPerKg: number;
  wattsmartReserveKwh: number;
  gridReliefPerKw?: number;
  peakSoFarOnPeakKw: number;
  peakSoFarAllHoursKw: number;
  initialSpinSocKwh: number;
  initialPulseSocKwh: number;
  initialPulseNetKw?: number;
  terminalPulseSocKwh?: number;
}

export interface IPlanInterval {
  startUtc: string;
  loadKw: number;
  gridKw: number;
  spinChargeKw: number;
  spinDischargeKw: number;
  pulseChargeKw: number;
  pulseDischargeKw: number;
  spinSocKwh: number;
  pulseSocKwh: number;
  isOnPeak: boolean;
  energyPricePerKwh: number;
  marginalKgCo2PerKwh: number;
}

export interface IRushHourWindow {
  startUtc: string;
  endUtc: string;
  startLocalHour: number;
  endLocalHour: number;
  isAssumption: boolean;
}

export interface IPlanMetrics {
  baselineCo2Kg: number;
  plannedCo2Kg: number;
  baselineRushHourKwh: number;
  plannedRushHourKwh: number;
  trafficAvoidedKwh: number;
  baselineRushPeakKw: number;
  plannedRushPeakKw: number;
  rushPeakCutKw: number;
  chargeSolarShare: number | null;
  shaverChargeSolarShare: number | null;
  solarShareProxyDate: string | null;
  reboundPeakKw: number;
  shaverReboundPeakKw: number;
  shaverGridKw?: number[];
  shaverChargeKw?: number[];
  rushHourWindows: IRushHourWindow[];
  wattsmartHeldKwh: number;
  rushHourPulseMinKwh: number;
  spinBurstCount: number;
  spinThroughputKwh: number;
  pulseThroughputKwh: number;
  objectiveValue: number;
  value: IPlanValue;
  realized: IPlanRealized | null;
}

export interface IPlanRealized {
  rushPeakCutKw: number;
  peakCutKw: number;
  baselinePeakKw: number;
  realizedPeakKw: number;
  forecastErrorPeakKw: number;
  baselineRushPeakKw: number;
  realizedRushPeakKw: number;
  rushKwhMoved: number;
  value: IPlanValue;
}

export interface IPlanValue {
  baselinePeakKw: number;
  plannedPeakKw: number;
  peakCutKw: number;
  baselineFacilitiesKw: number;
  plannedFacilitiesKw: number;
  facilitiesCutKw: number;
  demandRatePerKw: number;
  facilitiesRatePerKw: number;
  demandWorthPerMonth: number;
  facilitiesWorthPerMonth: number;
  worthPerMonth: number;
  baselineEnergyCost: number;
  plannedEnergyCost: number;
  energyCostChange: number;
  co2ChangeKg: number;
}

export interface ILpStats {
  intervalCount: number;
  variableCount: number;
  constraintCount: number;
  solveMs: number;
}

export interface IPlanResult {
  request: IPlanRequest;
  status: 'optimal' | 'infeasible' | 'error';
  intervals: IPlanInterval[];
  demandKw: number;
  baselineBill: IBillBreakdown;
  plannedBill: IBillBreakdown;
  lpText: string;
  solveMs: number;
  lpStats: ILpStats;
  metrics?: IPlanMetrics;
  errorMessage?: string;
}
