import { IEmissionFactor } from '../models';

const eiaFaqUrl = 'https://www.eia.gov/tools/faqs/faq.php?id=74&t=11';

export const emissionFactors: Record<'COAL' | 'GAS', IEmissionFactor> = {
  COAL: {
    fuelKey: 'COL',
    label: 'Coal',
    lbPerMwh: 2260,
    provenance: {
      id: 'ef-coal',
      label: 'Coal emission factor, 2.26 lb CO2/kWh (assumption: national annual average)',
      kind: 'assumption',
      url: eiaFaqUrl,
      note: 'EIA FAQ national average, not a Utah plant rate',
    },
  },
  GAS: {
    fuelKey: 'NG',
    label: 'Natural gas',
    lbPerMwh: 970,
    provenance: {
      id: 'ef-gas',
      label: 'Natural gas emission factor, 0.97 lb CO2/kWh (assumption: national annual average)',
      kind: 'assumption',
      url: eiaFaqUrl,
      note: 'One factor for combined-cycle and combustion turbines',
    },
  },
};

export const mefSeasonMonths = {
  SUMMER: [6, 7, 8, 9],
  WINTER: [1, 2, 3, 4, 5, 10, 11, 12],
};

export const signalsConfig = {
  Z_95: 1.96,
  RENEWABLE_FUEL_KEYS: ['WND', 'SUN'],
  EXCLUDED_FORECAST_FLAGS: ['df-oasis', 'implausible-df', 'implausible-demand'],
  MIN_SCORED_HOURS_PER_DAY: 23,
};
