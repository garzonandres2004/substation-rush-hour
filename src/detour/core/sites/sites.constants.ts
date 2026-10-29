import { IProvenance, ISiteArchetype } from '../models';

const simulatedProvenance: IProvenance = {
  id: 'simulated-site-seed-42',
  label: 'Simulated site load (seed 42)',
  kind: 'simulated',
  url: '',
  note: 'Synthetic load, seed 42 — not a real customer',
};

export const siteArchetypes: Record<'CEMENT_PLANT' | 'AIRPORT' | 'SKI_RESORT', ISiteArchetype> = {
  CEMENT_PLANT: {
    id: 'cement-plant',
    kind: 'cement-plant',
    name: 'Simulated Cement Plant (Wasatch Front)',
    description:
      'Continuous kiln and preheater base load near 2.2 MW, with raw mill and crusher motor starts that spike the meter to about 4 MW for one to three intervals several times a day, more often on weekdays. Peak-driven demand charges make single-interval spikes the expensive part of the bill.',
    scheduleId: 'schedule-8',
    nominalPeakKw: 4000,
    seed: 42,
    provenance: simulatedProvenance,
  },
  AIRPORT: {
    id: 'airport',
    kind: 'airport',
    name: 'Simulated Regional Airport',
    description:
      'Terminal HVAC base load with an afternoon cooling lift in summer, and an evening bank of baggage handling, boarding systems and lighting from roughly 5 to 9 p.m. that drives a 2 MW nominal peak right inside the Schedule 8 on-peak window.',
    scheduleId: 'schedule-8',
    nominalPeakKw: 2000,
    seed: 42,
    provenance: simulatedProvenance,
  },
  SKI_RESORT: {
    id: 'ski-resort',
    kind: 'ski-resort',
    name: 'Simulated Ski Resort (Cottonwood Canyons)',
    description:
      'In winter, chairlift motors run from 8 a.m. to 4 p.m. and a snowmaking block runs overnight from about 10 p.m. to 5 a.m. on top of lodge load. In summer only a small lodge and maintenance base load remains. Billed on Schedule 6.',
    scheduleId: 'schedule-6',
    nominalPeakKw: 900,
    seed: 42,
    provenance: simulatedProvenance,
  },
};

export const siteGeneratorSettings = {
  TIME_ZONE: 'America/Denver',
  INTERVAL_MINUTES: 15,
  MIN_LOAD_FRACTION: 0.15,
  MAX_PEAK_FRACTION: 1.05,
};
