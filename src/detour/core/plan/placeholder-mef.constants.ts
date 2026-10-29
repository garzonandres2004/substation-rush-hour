import { IMarginalEmissionsSeries } from '../models';
import { MefHelper } from './mef.helper';

const summerLbPerMwh = [
  1880, 1900, 1910, 1910, 1900, 1860, 1700, 1500, 1320, 1200, 1140, 1110,
  1100, 1100, 1120, 1180, 1300, 1450, 1560, 1580, 1540, 1480, 1400, 1300,
];

const winterLbPerMwh = [
  1900, 1920, 1930, 1930, 1910, 1820, 1600, 1520, 1420, 1300, 1220, 1180,
  1160, 1170, 1210, 1300, 1450, 1580, 1600, 1560, 1500, 1420, 1360, 1300,
];

export const placeholderMefSeries: IMarginalEmissionsSeries = {
  method: 'fossil-generation',
  points: [...MefHelper.hourlyPoints('summer', summerLbPerMwh), ...MefHelper.hourlyPoints('winter', winterLbPerMwh)],
  provenance: [
    {
      id: 'placeholder-mef',
      label: 'Typical hourly carbon (used until grid data loads)',
      kind: 'assumption',
      url: '',
      note: "Typical hourly carbon, used until grid data loads. Hand-shaped: coal on the margin overnight (~1,900 lb/MWh), gas at midday (~1,100), evening ramp (~1,500). Not a measurement.",
    },
  ],
};

export const mefConversions = {
  KG_PER_KWH_PER_LB_PER_MWH: 0.45359237 / 1000,
};
