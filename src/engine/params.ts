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
  overloadPenalty: 100000,
  cleanOverloadPenalty: 100000,
  substationPeakMW: 100,
  historyDays: 30,
};

export const ASSUMPTIONS = [
  'Storage asset is a modeled 10 MW / 40 MWh battery, 4 hours. The current Torus Pulse page lists 0.5C (2 hours) and 7,500 cycles; 4 to 8 hours appears in 2024 launch coverage. Both 2 and 4 hour sizes are tested in the capacity section. It is not Torus hardware data, and a real deployment would likely be several Stations dispatched together.',
  'Round trip efficiency 88 percent, usable state of charge 10 to 95 percent, start and end of day at 50 percent. Assumed. NREL ATB 2024 uses 85 percent and EIA measured 82 percent for the US fleet in 2019, so 88 percent is on the optimistic side. To be replaced by Torus specs.',
  'Inside the hour section: the data center load is SIMULATED at 1 minute steps (compute bursts, sync dips, checkpoint drops), averaging the capacity unlocked level each hour. Base substation load is held at its real hourly value. The flywheel follows Torus Spin claims (6 minute full discharge, 25,000 cycles) with an assumed 90 percent round trip efficiency; standby losses are not modeled. Power and energy per unit are not published, so 3 MW is a modeled size.',
  'Cycling cost of 3 dollars per MWh throughput is an assumption standing in for battery wear.',
  'The substation is modeled as 100 MW at its peak, with a load shape equal to the PacifiCorp East system demand shape. Real feeder data is not public.',
  'The substation has a modeled capacity limit equal to the 95th percentile of its load over the previous 30 days. Real feeder ratings are not public. Load above the limit is overload.',
  'The substation limit is a hard rule in the planner (a penalty of 100,000 per MWh over, so no price can justify crossing it). A real time guard also reacts to the meter during the hour.',
  'Stays clean plans against forecast grid CO2 per MWh (the last 7 days by hour) instead of price, with the substation limit as a hard rule. It is scored at real prices like the others.',
  'Stress premium of 20 dollars per MWh at index 1.0 is an assumption that tells the dispatcher how much avoiding a jammed hour is worth beyond price.',
  'Carbon uses the hourly average emissions of the PacifiCorp East fuel mix: coal 2.31 and gas 0.96 lb CO2 per kWh (EIA, 2023), hydro, wind, solar and other count as zero, imports ignored. Marginal emissions would be the better measure but are not public. Tomorrow uses the average of the last 7 days by hour.',
  'Dollar values use CAISO day ahead (DAM) prices at the PacifiCorp East trading hub. Real time prices are not used. They are settlement style values, not a forecast of profit.',
];
