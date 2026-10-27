import type { Params } from './types.js';

export const PARAMS: Params = {
  asset: {
    powerMW: 10,
    energyMWh: 40,
    socMinFrac: 0.1,
    socMaxFrac: 0.95,
    startSocFrac: 0.5,
    roundTripEff: 0.88,
    cycleCostPerMWh: 3,
  },
  stressPremium: 20,
  stressWeights: { demand: 0.3, netLoad: 0.3, ramp: 0.2, price: 0.2 },
  congestedThreshold: 0.65,
  capacityPercentile: 0.95,
  overloadPenalty: 150,
  substationPeakMW: 100,
  historyDays: 30,
};

export const ASSUMPTIONS = [
  'Storage asset is a modeled 10 MW / 40 MWh battery energy layer (4 hour duration, in the 4 to 8 hour range Torus lists for its Nova Pulse). It is not Torus hardware data.',
  'Round trip efficiency 88 percent, usable state of charge 10 to 95 percent, start and end of day at 50 percent. Assumed typical lithium values, to be replaced by Torus specs.',
  'The flywheel layer (sub second response) is not modeled in the hourly dispatch. Its role in the real product is sub hour ramp support and reducing battery cycling. Not simulated this week.',
  'Cycling cost of 3 dollars per MWh throughput is an assumption standing in for battery wear.',
  'The substation is modeled as 100 MW at its peak, with a load shape equal to the PacifiCorp East system demand shape. Real feeder data is not public.',
  'The substation has a modeled capacity limit equal to the 95th percentile of its load over the previous 30 days. Real feeder ratings are not public. Load above the limit is overload.',
  'Overload is penalized at 150 dollars per MWh in the dispatcher so it prefers to clear overloads before chasing price.',
  'Stress premium of 20 dollars per MWh at index 1.0 is an assumption that tells the dispatcher how much avoiding a jammed hour is worth beyond price.',
  'Dollar values use CAISO day ahead (DAM) prices at the PacifiCorp East trading hub. Real time prices are not used. They are settlement style values, not a forecast of profit.',
];
