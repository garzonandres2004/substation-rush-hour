import { IProvenance } from './provenance.interfaces';
import { DemandBasis, TariffScheduleId, TariffSeason } from './tariff.types';

export interface IOnPeakWindow {
  startHour: number;
  endHour: number;
}

export interface ISeasonRates {
  demandRatePerKw: number;
  energyOnPeakPerKwh: number;
  energyOffPeakPerKwh: number;
  onPeakWindows: IOnPeakWindow[];
}

export interface ITariffSchedule {
  id: TariffScheduleId;
  name: string;
  demandBasis: DemandBasis;
  demandIntervalMinutes: number;
  summerMonths: number[];
  customerChargePerMonth: number;
  facilitiesRatePerKw: number;
  seasons: Record<TariffSeason, ISeasonRates>;
  onPeakExcludesHolidays: boolean;
  provenance: IProvenance;
}

export interface IInterval {
  index: number;
  startUtc: string;
  localDate: string;
  localHour: number;
  localMinute: number;
  isWeekday: boolean;
  isHoliday: boolean;
  hours: number;
}

export interface IBillingDeterminants {
  month: string;
  scheduleId: TariffScheduleId;
  onPeakKwh: number;
  offPeakKwh: number;
  totalKwh: number;
  demandKw: number;
  demandIntervalStartUtc: string | null;
  facilitiesKw: number;
}

export interface IBillLine {
  id: string;
  label: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  provenance: IProvenance;
}

export interface IBillBreakdown {
  scheduleId: TariffScheduleId;
  month: string;
  determinants: IBillingDeterminants;
  lines: IBillLine[];
  total: number;
}
