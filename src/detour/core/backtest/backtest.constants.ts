import { IProvenance } from '../models';

export const backtestSettings = {
  DEFAULT_MONTH: '2026-07',
  YEAR: '2026',
  DEFAULT_SITE_ID: 'airport',
  NAIVE_TARGET_FRACTION: 0.8,
  WATTSMART_RESERVE_FRACTION: 0.25,
  INITIAL_PULSE_SOC_FRACTION: 0.5,
  INITIAL_SPIN_SOC_KWH: 0,
  KG_PER_KWH_PER_LB_PER_MWH: 0.45359237 / 1000,
  CENT_FACTOR: 100,
  FULL_DAY_HOURS: 24,
  LOAD_FORECAST_LAG_DAYS: [7, 14, 21, 28],
  FORECAST_TERMINAL_PULSE_FRACTION: 0.9,
};

export const backtestProvenance: Record<
  'NAIVE_TARGET' | 'WATTSMART_RESERVE' | 'RUSH_HOUR_RULE' | 'LOAD_FORECAST' | 'ORACLE',
  IProvenance
> = {
  NAIVE_TARGET: {
    id: 'backtest-naive-target',
    label: 'Fixed-threshold battery: discharges above 80% of the site nominal peak',
    kind: 'assumption',
    url: '',
    note: 'A fixed threshold. The fixed-threshold battery does not adapt to prices or forecasts.',
  },
  WATTSMART_RESERVE: {
    id: 'backtest-wattsmart-reserve',
    label: 'Wattsmart reserve: 25% of Pulse energy',
    kind: 'assumption',
    url: '',
    note: 'Energy held back in Pulse above its floor for utility dispatch. Labeled assumption.',
  },
  RUSH_HOUR_RULE: {
    id: 'backtest-rush-hour-rule',
    label: "Rush hour: each day's busiest 4-hour block of PACE demand",
    kind: 'assumption',
    url: '',
    note: 'Same rule as the Plan screen. Falls back to 5-9 p.m. on days without PACE data.',
  },
  LOAD_FORECAST: {
    id: 'backtest-load-forecast',
    label: "DETOUR's load forecast: the same weekday's highest load in the last four weeks",
    kind: 'derived',
    url: '',
    note: 'For each 15-minute slot, the highest site load on the same weekday 7, 14, 21 and 28 days earlier. Planning on the high side keeps Pulse ready for a peak the forecast missed; a live cap covers the rest.',
  },
  ORACLE: {
    id: 'backtest-oracle',
    label: 'Perfect hindsight: one LP over the whole month with the real load',
    kind: 'derived',
    url: '',
    note: 'Knows every interval of the month in advance and minimizes only the bill. No real controller can match it; capture rate is measured against it.',
  },
};
