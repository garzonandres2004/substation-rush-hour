import raw from '../../public/data/report.json';

export interface Slot {
  charge: number;
  discharge: number;
  soc: number;
  loadAfter: number;
}
export interface HourRow {
  hourLocal: number;
  t: string;
  co2: number;
  lmp: number;
  mcc: number;
  stress: number;
  congested: boolean;
  loadBefore: number;
  demandHat: number;
  solarHat: number;
  windHat: number;
  netLoadHat: number;
  comps: { demand: number; netLoad: number; ramp: number; price: number };
  aware: Slot;
  priceOnly: Slot;
  clean: Slot;
}
export interface Card {
  marketValue: number;
  cycleCost: number;
  netValue: number;
  congestedHours: number;
  congestedEnergyRelievedMWh: number;
  overloadBeforeMWh: number;
  overloadAfterMWh: number;
  overloadHoursBefore: number;
  overloadHoursAfter: number;
  avgStressWhenCharging: number;
  avgStressWhenDischarging: number;
  equivalentCycles: number;
  co2T: number;
  peakBeforeMW: number;
  peakAfterMW: number;
  checks: Record<string, boolean>;
}
export interface Scenario {
  capMW: number;
  hours: HourRow[];
  scorecards: { stressAware: Card; priceOnly: Card; clean: Card; naive: Card; none: Card };
  description?: string;
}
export interface Report {
  generatedAt: string;
  date: string;
  region: string;
  assumptions: string[];
  params: {
    asset: { powerMW: number; energyMWh: number };
    congestedThreshold: number;
    stressPremium: number;
    stressWeights: { demand: number; netLoad: number; ramp: number; price: number };
  };
  scenarios: { normal: Scenario; derate: Scenario };
  capacity: Capacity;
  summer: Summer | null;
  backtest: {
    summary: {
      days: number;
      firstDay: string;
      lastDay: string;
      maxForecastMissMW: number;
      meanNetValuePerDay: Record<string, number>;
      meanOverloadAfterMWh: Record<string, number>;
      totalOverloadMWh: Record<string, number>;
      daysCausingOverload: Record<string, number>;
      meanPeakReductionMW: Record<string, number>;
      meanCongestedEnergyRelievedMWh: Record<string, number>;
      allConstraintChecksPass: boolean;
      carbonDays: number;
      meanCo2TPerDay: Record<string, number>;
      demandForecastMapePct: { ours: number; eiaDayAhead: number };
      meanCo2MarginalTPerDay?: Record<string, number>;
      captureVsHindsight?: { valuePct: number | null; jamReliefPct: number | null };
      robust?: {
        eiaForecast: Record<'v1' | 'replan' | 'guard', Robust>;
        premium: (Robust & { premium: number })[];
        weights: (Robust & { name: string; w: { demand: number; netLoad: number; ramp: number; price: number } })[];
      };
    };
    days: { date: string; overB: number; overA: Record<string, number> }[];
  };
}
export interface CapacityLimit {
  withoutStorageMW: number;
  stations: {
    label: string;
    powerMW: number;
    energyMWh: number;
    awareMW: number;
    awareResidualMWh: number;
    shaverMW: number;
    awareDaysOverAtShaverMW?: string[]; // our planner at the simple rule's size: days over the limit
    capacityModeMW?: number; // the planner holding a reserve for forecast overload (capacity mode)
    shaverFullMW?: number; // the five line rule recharging to full instead of half
  }[];
}
export interface Robust {
  days: number;
  daysOver: number;
  totalOverMWh: number;
  jamReliefMWh: number;
  valuePerDay: number;
}
export interface Summer {
  days: number;
  firstDay: string;
  lastDay: string;
  summerPeakMW: number;
  forecastMapePct: number;
  ratedForSummerPeak: {
    capMW: number;
    stations: {
      label: string;
      powerMW: number;
      energyMWh: number;
      awareMW: number;
      shaverMW: number;
      capacityModeMW?: number;
      shaverFullMW?: number;
    }[];
  };
  autumnRating: {
    capMW: number;
    none: { daysOver: number; hours: number };
    withMain: { daysOver: number; hours: number };
  };
}
export interface Capacity {
  days: number;
  toleranceMWh: number;
  stepMW: number;
  fixedLimitMW: number;
  limits: { moving: CapacityLimit; fixed: CapacityLimit };
}
export const report = raw as unknown as Report;

export function hourLabel(h: number): string {
  const x = h % 12 === 0 ? 12 : h % 12;
  return `${x} ${h < 12 ? 'AM' : 'PM'}`;
}
export function rangeLabel(a: number, b: number): string {
  return a === b ? hourLabel(a) : `${hourLabel(a)} to ${hourLabel((b + 1) % 24)}`;
}
export function dateLabel(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
const stops: [number, [number, number, number]][] = [
  [0.38, [47, 163, 122]],
  [0.55, [232, 178, 48]],
  [0.7, [215, 38, 61]],
];
export function stressColor(s: number): string {
  if (s <= stops[0][0]) return `rgb(${stops[0][1].join(',')})`;
  for (let i = 1; i < stops.length; i++) {
    if (s <= stops[i][0]) {
      const [a, ca] = stops[i - 1],
        [b, cb] = stops[i];
      const k = (s - a) / (b - a);
      return `rgb(${ca.map((c, j) => Math.round(c + (cb[j] - c) * k)).join(',')})`;
    }
  }
  return `rgb(${stops[stops.length - 1][1].join(',')})`;
}
export function stressWord(s: number, jam: number): string {
  if (s >= jam) return 'Jam';
  if (s >= 0.52) return 'Slowing';
  return 'Free flowing';
}
