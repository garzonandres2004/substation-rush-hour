import { ISiteArchetype } from '../models';

export interface ISiteLoadStats {
  peakKw: number;
  avgKw: number;
  loadFactor: number;
}

export interface IGeneratorContext {
  site: ISiteArchetype;
  month: number;
  isWeekend: boolean;
  localHours: number[];
  random: () => number;
}
