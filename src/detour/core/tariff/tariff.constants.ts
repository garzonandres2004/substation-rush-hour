import { IProvenance, ITariffSchedule } from '../models';

const rateSheetUrl =
  'https://www.rockymountainpower.net/content/dam/pcorp/documents/en/rockymountainpower/rates-regulation/utah/Utah_Price_Summary.pdf';

const rateVintageNote =
  'Base rates from the Sept 25, 2026 price summary, riders excluded. Customer charge from the April 2025 Utah PSC tariff sheet (pscdocs.utah.gov, docket 25-035-T05).';

const schedule8Provenance: IProvenance = {
  id: 'rmp-schedule-8',
  label: 'Rocky Mountain Power Schedule 8',
  kind: 'rmp-tariff',
  url: rateSheetUrl,
  note: rateVintageNote,
};

const schedule6Provenance: IProvenance = {
  id: 'rmp-schedule-6',
  label: 'Rocky Mountain Power Schedule 6',
  kind: 'rmp-tariff',
  url: rateSheetUrl,
  note: rateVintageNote,
};

export const tariffSchedules = {
  SCHEDULE_8: {
    id: 'schedule-8',
    name: 'Schedule 8 (demand on-peak only)',
    demandBasis: 'on-peak',
    demandIntervalMinutes: 15,
    summerMonths: [6, 7, 8, 9],
    customerChargePerMonth: 73.0,
    facilitiesRatePerKw: 5.15,
    onPeakExcludesHolidays: true,
    seasons: {
      summer: {
        demandRatePerKw: 16.84,
        energyOnPeakPerKwh: 0.062395,
        energyOffPeakPerKwh: 0.031714,
        onPeakWindows: [{ startHour: 15, endHour: 22 }],
      },
      winter: {
        demandRatePerKw: 14.9,
        energyOnPeakPerKwh: 0.055217,
        energyOffPeakPerKwh: 0.02807,
        onPeakWindows: [
          { startHour: 6, endHour: 9 },
          { startHour: 18, endHour: 22 },
        ],
      },
    },
    provenance: schedule8Provenance,
  },
  SCHEDULE_6: {
    id: 'schedule-6',
    name: 'Schedule 6 (demand on all hours)',
    demandBasis: 'all-hours',
    demandIntervalMinutes: 15,
    summerMonths: [6, 7, 8, 9],
    customerChargePerMonth: 55.0,
    facilitiesRatePerKw: 4.36,
    onPeakExcludesHolidays: true,
    seasons: {
      summer: {
        demandRatePerKw: 14.49,
        energyOnPeakPerKwh: 0.040175,
        energyOffPeakPerKwh: 0.040175,
        onPeakWindows: [],
      },
      winter: {
        demandRatePerKw: 12.82,
        energyOnPeakPerKwh: 0.035527,
        energyOffPeakPerKwh: 0.035527,
        onPeakWindows: [],
      },
    },
    provenance: schedule6Provenance,
  },
} satisfies Record<string, ITariffSchedule>;
