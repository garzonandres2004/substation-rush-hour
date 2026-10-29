import { ISiteArchetype, ISiteLoadInterval } from '../models';
import { TimeHelper } from '../helpers/time.helper';
import { SiteGeneratorHelper } from '../sites/site-generator.helper';
import { backtestSettings } from './backtest.constants';

export class SiteLoadForecastHelper {
  public static forecastDay(site: ISiteArchetype, localDate: string): number[] {
    const intervalCount = SiteGeneratorHelper.generateDay(site, localDate).length;
    const pastDays = backtestSettings.LOAD_FORECAST_LAG_DAYS.map((lagDays: number) =>
      SiteGeneratorHelper.generateDay(site, TimeHelper.addDays(localDate, -lagDays)).map(
        (interval: ISiteLoadInterval) => interval.kw,
      ),
    );
    const matching = pastDays.filter((day: number[]) => day.length === intervalCount);
    const sources = matching.length > 0 ? matching : pastDays;

    return Array.from({ length: intervalCount }, (_: unknown, index: number) => {
      const values = sources.map((day: number[]) => day[Math.min(index, day.length - 1)]);

      return Math.max(...values);
    });
  }
}
