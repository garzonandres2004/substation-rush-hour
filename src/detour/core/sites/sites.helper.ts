import { IStationAssets, ISiteArchetype } from '../models';
import { stationAssets } from './asset.constants';
import { siteArchetypes } from './sites.constants';

export class SitesHelper {
  public static listArchetypes(): ISiteArchetype[] {
    return Object.values(siteArchetypes);
  }

  public static getArchetype(siteId: string): ISiteArchetype | undefined {
    return SitesHelper.listArchetypes().find((archetype: ISiteArchetype) => archetype.id === siteId);
  }

  public static getAssets(siteId: string): IStationAssets | undefined {
    return stationAssets[siteId];
  }
}
