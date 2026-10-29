import { IProvenance, IStationAssets } from '../models';

const spinSpecUrl = 'https://interestingengineering.com/innovation/flywheel-energy-storage-power-ai-data-centers-grid';
const pulseSpecUrl = 'https://www.ess-news.com/2024/11/26/torus-unveils-flywheel-battery-energy-storage-ai-driven-cybersecurity-solutions/';

const spinCRateSource: IProvenance = {
  id: 'torus-spin-c-rate',
  label: 'Torus Spin 10C',
  kind: 'torus-spec',
  url: spinSpecUrl,
  note: 'Secondary article quoting Torus. 10C means energy = power / 10 kWh (6 minutes at full power). Wattsmart-approved band is 30 kW-1.2 MW per system.',
};

const pulseDurationSource: IProvenance = {
  id: 'torus-pulse-duration',
  label: 'Torus Pulse 4-8 h duration',
  kind: 'torus-spec',
  url: pulseSpecUrl,
  note: 'Published duration range 4-8 h; we size at 4 h. Wattsmart-approved band is 30 kW-1.2 MW per system.',
};

const buildAssumption = (id: string, label: string, note: string): IProvenance => ({
  id,
  label,
  kind: 'assumption',
  url: '',
  note,
});

const sizingNote = 'Unit size chosen for this simulated site; within the Wattsmart 30 kW-1.2 MW band per system.';
const cycleLifeNote = 'Assumption: vendor spec class';
const spinDegradationNote =
  'Assumed Spin replacement $590/kWh of rated energy, divided by 25,000 cycles x 1.0 usable = $0.0236/kWh. About 1/3 of Pulse.';
const pulseDegradationNote =
  'Assumed Pulse replacement $450/kWh, divided by 7,500 cycles x 0.85 usable kWh = $0.0706/kWh.';

const sharedSources: Record<string, IProvenance> = {
  'spin.energyKwh': spinCRateSource,
  'pulse.energyKwh': pulseDurationSource,
  'spin.roundTripEfficiency': buildAssumption('spin-rte', 'Spin round-trip efficiency', 'Assumed 0.90 round trip.'),
  'spin.selfDischargePerStep': buildAssumption(
    'spin-self-discharge',
    'Spin self-discharge per 15 min',
    'Assumed 0.3% of stored energy lost per step; a flywheel loses energy continuously.',
  ),
  'spin.cycleLife': buildAssumption('spin-cycle-life', 'Spin cycle life', cycleLifeNote),
  'spin.degradationCostPerKwh': buildAssumption('spin-degradation', 'Spin degradation cost', spinDegradationNote),
  'pulse.chargeEfficiency': buildAssumption('pulse-charge-eff', 'Pulse charge efficiency', 'Assumed 0.95 (about 90% round trip).'),
  'pulse.dischargeEfficiency': buildAssumption('pulse-discharge-eff', 'Pulse discharge efficiency', 'Assumed 0.95 (about 90% round trip).'),
  'pulse.minSocFraction': buildAssumption('pulse-min-soc', 'Pulse minimum charge left', 'Assumed 10% floor: Pulse never drops below this much charge left.'),
  'pulse.maxSocFraction': buildAssumption('pulse-max-soc', 'Pulse maximum charge', 'Assumed 95% ceiling on charge.'),
  'pulse.rampLimitKwPerStep': buildAssumption('pulse-ramp', 'Pulse ramp limit', 'Assumed 25% of rated power per 15-minute step: a smoothness limit so fast transients go to Spin (LFP cells can ramp faster, but smooth dispatch limits wear).'),
  'pulse.cycleLife': buildAssumption('pulse-cycle-life', 'Pulse cycle life', cycleLifeNote),
  'pulse.degradationCostPerKwh': buildAssumption('pulse-degradation', 'Pulse degradation cost', pulseDegradationNote),
};

const buildAssets = (
  siteId: string,
  spinPowerKw: number,
  pulsePowerKw: number,
  pulseEnergyKwh: number,
): IStationAssets => ({
  siteId,
  spin: {
    powerKw: spinPowerKw,
    energyKwh: spinPowerKw / 10,
    roundTripEfficiency: 0.9,
    selfDischargePerStep: 0.003,
    cycleLife: 25000,
    degradationCostPerKwh: 0.0236,
  },
  pulse: {
    powerKw: pulsePowerKw,
    energyKwh: pulseEnergyKwh,
    chargeEfficiency: 0.95,
    dischargeEfficiency: 0.95,
    minSocFraction: 0.1,
    maxSocFraction: 0.95,
    rampLimitKwPerStep: pulsePowerKw * 0.25,
    cycleLife: 7500,
    degradationCostPerKwh: 0.0706,
  },
  sources: {
    ...sharedSources,
    'spin.powerKw': buildAssumption(`spin-power-${siteId}`, 'Spin rated power', sizingNote),
    'pulse.powerKw': buildAssumption(`pulse-power-${siteId}`, 'Pulse rated power', sizingNote),
  },
});

export const stationAssets: Record<string, IStationAssets> = {
  'cement-plant': buildAssets('cement-plant', 1000, 1000, 4000),
  airport: buildAssets('airport', 500, 800, 3200),
  'ski-resort': buildAssets('ski-resort', 300, 300, 1200),
};
