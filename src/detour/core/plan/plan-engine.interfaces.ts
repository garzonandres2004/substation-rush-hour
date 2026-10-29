import { IInterval, ILpStats, IPlanRequest, IRushHourWindow, ISiteArchetype, IStationAssets, ITariffSchedule } from '../models';

export interface ILpInput {
  request: IPlanRequest;
  schedule: ITariffSchedule;
  assets: IStationAssets;
  intervals: IInterval[];
  loadKw: number[];
  actualLoadKw?: number[];
  onPeakMask: boolean[];
  energyPricePerKwh: number[];
  marginalKgCo2PerKwh: number[];
  rushHourMask: boolean[];
  rushHourWindows: IRushHourWindow[];
  monthToDateIntervals: IInterval[];
  monthToDateLoadKw: number[];
  site?: ISiteArchetype;
}

export interface ILpModel {
  lpText: string;
  columnNames: string[];
  stats: ILpStats;
}

export interface ILpTerm {
  coefficient: number;
  variable: string;
}

export interface IMonthToDate {
  intervals: IInterval[];
  loadKw: number[];
}

export interface IShaverComparison {
  gridKw: number[];
  chargeKw: number[];
}

export interface IRushPeaks {
  baselineRushPeakKw: number;
  plannedRushPeakKw: number;
}

export interface ISolarDay {
  date: string;
  sharesByHour: Map<number, number>;
}
