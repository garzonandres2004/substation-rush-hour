import {
  IBillBreakdown,
  IInterval,
  IMarginalEmissionsSeries,
  IPlanInterval,
  IPlanResult,
  IProvenance,
  ISiteArchetype,
  IStationAssets,
  ITariffSchedule,
} from '../models';
import { ILpInput } from '../plan/plan-engine.interfaces';
import { BacktestStrategyRole } from './backtest.types';

export interface IBacktestInput {
  month: string;
  throughDate: string | null;
  site: ISiteArchetype;
  schedule: ITariffSchedule;
  assets: IStationAssets;
  intervals: IInterval[];
  loadKw: number[];
  onPeakMask: boolean[];
  energyPricePerKwh: number[];
  edamLmpPerMwh: (number | null)[];
  marginalKgCo2PerKwh: number[];
  marginalEmissions: IMarginalEmissionsSeries;
  gridHours: Detour.Firestore.Snapshot.IGridHour[];
  rushHourMask: boolean[];
  wattsmartReserveKwh: number;
  initialPulseSocKwh: number;
  initialSpinSocKwh: number;
}

export interface IBacktestStrategy {
  id: string;
  label: string;
  description: string;
  role: BacktestStrategyRole;
  run(input: IBacktestInput): Promise<IPlanInterval[]>;
}

export interface IComponentSavings {
  customer: number;
  facilities: number;
  demand: number;
  energy: number;
  total: number;
}

export interface IBacktestPeakInterval {
  index: number;
  startUtc: string;
  localDate: string;
  localHour: number;
  localMinute: number;
  kw: number;
}

export interface IBacktestCycles {
  pulseEquivalentFullCycles: number;
  spinEquivalentFullCycles: number;
  pulseThroughputKwh: number;
  spinThroughputKwh: number;
}

export interface IBacktestWattsmart {
  committedKwh: number;
  minimumHeldKwh: number;
}

export interface IBacktestTraffic {
  avoidedKwh: number;
  avoidedKgCo2: number;
  netKgCo2Change: number;
}

export interface IBacktestValue {
  billSavings: number;
  carbonValue: number;
  wearCost: number;
  total: number;
}

export interface IBacktestStrategyResult {
  strategy: Pick<IBacktestStrategy, 'id' | 'label' | 'description' | 'role'>;
  intervals: IPlanInterval[];
  bill: IBillBreakdown;
  savings: IComponentSavings;
  peakInterval: IBacktestPeakInterval | null;
  facilitiesKw: number;
  cycles: IBacktestCycles;
  wattsmart: IBacktestWattsmart;
  traffic: IBacktestTraffic;
  value: IBacktestValue;
  captureRate: number | null;
}

export interface IBacktestDay {
  localDate: string;
  startIndex: number;
  endIndex: number;
  isWeekday: boolean;
  isHoliday: boolean;
  baselinePeakKw: number;
  leadPeakKw: number;
  rushStartIndex: number | null;
  rushEndIndex: number | null;
  hasBaselinePeak: boolean;
  hasLeadPeak: boolean;
}

export interface IBacktestInputSummary {
  month: string;
  throughDate: string | null;
  siteId: string;
  siteName: string;
  nominalPeakKw: number;
  scheduleId: string;
  scheduleName: string;
  wattsmartReserveKwh: number;
  naiveTargetKw: number;
  seed: number;
  pulseCycleLife: number;
  spinCycleLife: number;
  co2WeightPerKg: number;
}

export interface IBacktestSources {
  tariff: IProvenance;
  site: IProvenance;
  carbon: IProvenance;
  reserve: IProvenance;
  rushHour: IProvenance;
  naiveTarget: IProvenance;
  loadForecast: IProvenance;
  oracle: IProvenance;
}

export interface IBacktestSnapshotSources {
  manifest: Detour.Firestore.Snapshot.IManifest | null;
  gridMonth: Detour.Firestore.Snapshot.IGridMonth | null;
  priceMonth: Detour.Firestore.Snapshot.IPriceMonth | null;
  marginalEmissions: IMarginalEmissionsSeries | null;
}

export interface IBacktestResult {
  summary: IBacktestInputSummary;
  intervals: IInterval[];
  rushHourMask: boolean[];
  baseline: IBacktestStrategyResult;
  strategies: IBacktestStrategyResult[];
  oracle: IBacktestStrategyResult | null;
  perfectLoad: IBacktestStrategyResult | null;
  shaver: IBacktestStrategyResult | null;
  lead: IBacktestStrategyResult;
  days: IBacktestDay[];
  provenance: IProvenance[];
  sources: IBacktestSources;
}

export interface IBacktestYearRow {
  month: string;
  siteId: string;
  scheduleId: string;
  savedUsd: number;
  captureRate: number | null;
  demandShare: number;
  peakKw: number;
  wattsmartKwh: number;
}

export interface IBacktestYear {
  snapshotId: string;
  throughDate: string;
  rows: IBacktestYearRow[];
}

export interface IBacktestCalendar {
  snapshotId: string;
  months: string[];
  throughDate: string;
}

export interface ILpSolver {
  solve(input: ILpInput): Promise<IPlanResult>;
}

export interface IReplayState {
  pulseSocKwh: number;
  spinSocKwh: number;
  pulseNetKw: number;
  billedPeakKw: number;
  billedLoadPeakKw: number;
  facilitiesPeakKw: number;
  facilitiesLoadPeakKw: number;
}

export interface IReplayDayInput {
  assets: IStationAssets;
  loadKw: number[];
  planned: IPlanInterval[];
  billedMask: boolean[];
  rushHourMask: boolean[];
  wattsmartReserveKwh: number;
  stepHours: number;
  state: IReplayState;
}

export interface IReplayDayResult {
  intervals: IPlanInterval[];
  state: IReplayState;
}

export interface IReplayLimits {
  spinDischargeMaxKw: number;
  spinChargeMaxKw: number;
  pulseChargeMaxKw: number;
  pulseLowestNetKw: number;
  pulseHighestNetKw: number;
}
