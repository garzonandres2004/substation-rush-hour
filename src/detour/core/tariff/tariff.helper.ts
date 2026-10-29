import {
  IBillBreakdown,
  IBillingDeterminants,
  IBillLine,
  IInterval,
  IProvenance,
  ISeasonRates,
  ITariffSchedule,
  TariffSeason,
} from '../models';
import { IBillOptions, IPeakSoFar } from './tariff.interfaces';

export class TariffHelper {
  public static seasonOf(schedule: ITariffSchedule, month: number): TariffSeason {
    return schedule.summerMonths.includes(month) ? 'summer' : 'winter';
  }

  public static seasonRatesFor(schedule: ITariffSchedule, localDate: string): ISeasonRates {
    return schedule.seasons[TariffHelper.seasonOf(schedule, Number(localDate.slice(5, 7)))];
  }

  public static onPeakMask(schedule: ITariffSchedule, intervals: IInterval[]): boolean[] {
    return intervals.map((interval: IInterval) => {
      if (!interval.isWeekday) {
        return false;
      }

      if (interval.isHoliday && schedule.onPeakExcludesHolidays) {
        return false;
      }

      return TariffHelper.seasonRatesFor(schedule, interval.localDate).onPeakWindows.some(
        (window) => interval.localHour >= window.startHour && interval.localHour < window.endHour,
      );
    });
  }

  public static billingDeterminants(
    schedule: ITariffSchedule,
    intervals: IInterval[],
    loadKw: number[],
  ): IBillingDeterminants {
    const mask = TariffHelper.onPeakMask(schedule, intervals);
    const isOnPeakBasis = schedule.demandBasis === 'on-peak';
    let onPeakKwh = 0;
    let offPeakKwh = 0;
    let demandKw = 0;
    let demandIntervalStartUtc: string | null = null;
    let facilitiesKw = 0;

    for (let i = 0; i < intervals.length; i++) {
      const kwh = loadKw[i] * intervals[i].hours;
      const countsForDemand = isOnPeakBasis ? mask[i] : true;

      if (mask[i]) {
        onPeakKwh += kwh;
      } else {
        offPeakKwh += kwh;
      }

      if (countsForDemand && loadKw[i] > demandKw) {
        demandKw = loadKw[i];
        demandIntervalStartUtc = intervals[i].startUtc;
      }

      if (loadKw[i] > facilitiesKw) {
        facilitiesKw = loadKw[i];
      }
    }

    return {
      month: intervals.length > 0 ? intervals[0].localDate.slice(0, 7) : '',
      scheduleId: schedule.id,
      onPeakKwh,
      offPeakKwh,
      totalKwh: onPeakKwh + offPeakKwh,
      demandKw,
      demandIntervalStartUtc,
      facilitiesKw,
    };
  }

  public static runningPeaks(schedule: ITariffSchedule, intervals: IInterval[], loadKw: number[]): IPeakSoFar[] {
    const mask = TariffHelper.onPeakMask(schedule, intervals);
    let onPeakKw = 0;
    let allHoursKw = 0;

    return intervals.map((_interval: IInterval, i: number) => {
      onPeakKw = mask[i] ? Math.max(onPeakKw, loadKw[i]) : onPeakKw;
      allHoursKw = Math.max(allHoursKw, loadKw[i]);

      return { onPeakKw, allHoursKw };
    });
  }

  public static peakSoFar(schedule: ITariffSchedule, intervals: IInterval[], loadKw: number[]): IPeakSoFar {
    const peaks = TariffHelper.runningPeaks(schedule, intervals, loadKw);

    return peaks.length > 0 ? peaks[peaks.length - 1] : { onPeakKw: 0, allHoursKw: 0 };
  }

  public static monthlyBill(
    schedule: ITariffSchedule,
    intervals: IInterval[],
    loadKw: number[],
    options: IBillOptions = {},
  ): IBillBreakdown {
    const includeFixedCharges = options.includeFixedCharges ?? true;
    const determinants = TariffHelper.billingDeterminants(schedule, intervals, loadKw);
    const rates = TariffHelper.seasonRatesFor(schedule, intervals[0].localDate);
    const isOnPeakBasis = schedule.demandBasis === 'on-peak';
    const lines: IBillLine[] = [];

    if (includeFixedCharges) {
      lines.push(
        TariffHelper.line('customer-charge', 'Customer charge', 1, 'month', schedule.customerChargePerMonth, {
          ...schedule.provenance,
          note: 'Customer charge from the April 2025 PSC tariff sheet (P.S.C.U. No. 52); other rates are Sept 25, 2026 base rates.',
        }),
        TariffHelper.line(
          'facilities',
          'Facilities demand',
          determinants.facilitiesKw,
          'kW',
          schedule.facilitiesRatePerKw,
          schedule.provenance,
        ),
      );
    }

    lines.push(
      TariffHelper.line(
        'demand',
        isOnPeakBasis ? 'On-peak demand' : 'Demand (all hours)',
        determinants.demandKw,
        'kW',
        rates.demandRatePerKw,
        schedule.provenance,
      ),
    );

    if (isOnPeakBasis) {
      lines.push(
        TariffHelper.line(
          'energy-on-peak',
          'On-peak energy',
          determinants.onPeakKwh,
          'kWh',
          rates.energyOnPeakPerKwh,
          schedule.provenance,
        ),
        TariffHelper.line(
          'energy-off-peak',
          'Off-peak energy',
          determinants.offPeakKwh,
          'kWh',
          rates.energyOffPeakPerKwh,
          schedule.provenance,
        ),
      );
    } else {
      lines.push(
        TariffHelper.line(
          'energy',
          'Energy',
          determinants.totalKwh,
          'kWh',
          rates.energyOffPeakPerKwh,
          schedule.provenance,
        ),
      );
    }

    const total = Math.round(lines.reduce((sum: number, line: IBillLine) => sum + line.amount * 100, 0)) / 100;

    return { scheduleId: schedule.id, month: determinants.month, determinants, lines, total };
  }

  private static line(
    id: string,
    label: string,
    quantity: number,
    unit: string,
    rate: number,
    provenance: IProvenance,
  ): IBillLine {
    return { id, label, quantity, unit, rate, amount: Math.round(quantity * rate * 100) / 100, provenance };
  }
}
