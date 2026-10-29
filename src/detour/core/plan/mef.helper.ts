import { IMarginalEmissionsPoint, MefSeason } from '../models';

export class MefHelper {
  public static hourlyPoints(season: MefSeason, lbPerMwhByHour: number[]): IMarginalEmissionsPoint[] {
    return lbPerMwhByHour.map((lbPerMwh: number, hour: number) => ({
      hour,
      season,
      lbPerMwh,
      ciLowLbPerMwh: lbPerMwh,
      ciHighLbPerMwh: lbPerMwh,
      n: 0,
    }));
  }
}
