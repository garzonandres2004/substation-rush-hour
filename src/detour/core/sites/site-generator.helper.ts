import { ISiteArchetype, ISiteLoadInterval } from '../models';
import { siteGeneratorSettings } from './sites.constants';
import { IGeneratorContext, ISiteLoadStats } from './sites.interfaces';

const intervalMilliseconds = siteGeneratorSettings.INTERVAL_MINUTES * 60 * 1000;
const hourMinuteFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: siteGeneratorSettings.TIME_ZONE,
  hourCycle: 'h23',
  hour: 'numeric',
  minute: 'numeric',
});
const offsetFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: siteGeneratorSettings.TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
});

export class SiteGeneratorHelper {
  public static generateDay(site: ISiteArchetype, localDate: string): ISiteLoadInterval[] {
    const startTimes = SiteGeneratorHelper.buildLocalDayStarts(localDate);
    const localHours = startTimes.map((startMs: number) => SiteGeneratorHelper.getLocalHour(startMs));
    const [year, month, day] = localDate.split('-').map(Number);
    const isWeekend = [0, 6].includes(new Date(Date.UTC(year, month - 1, day)).getUTCDay());
    const random = SiteGeneratorHelper.createMulberry32(SiteGeneratorHelper.hashString(`${site.seed}|${site.id}|${localDate}`));
    const context = { site, month, isWeekend, localHours, random };
    const rawLoads = SiteGeneratorHelper.buildRawLoads(context);
    const minimumKw = site.nominalPeakKw * siteGeneratorSettings.MIN_LOAD_FRACTION;
    const maximumKw = site.nominalPeakKw * siteGeneratorSettings.MAX_PEAK_FRACTION;

    return startTimes.map((startMs: number, index: number) => ({
      startUtc: new Date(startMs).toISOString(),
      kw: Math.round(Math.min(maximumKw, Math.max(minimumKw, rawLoads[index])) * 10) / 10,
    }));
  }

  public static generateMonth(site: ISiteArchetype, yearMonth: string): ISiteLoadInterval[] {
    const [year, month] = yearMonth.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const intervals: ISiteLoadInterval[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const localDate = `${yearMonth}-${String(day).padStart(2, '0')}`;
      intervals.push(...SiteGeneratorHelper.generateDay(site, localDate));
    }

    return intervals;
  }

  public static loadStats(intervals: ISiteLoadInterval[]): ISiteLoadStats {
    if (intervals.length === 0) {
      return { peakKw: 0, avgKw: 0, loadFactor: 0 };
    }

    const peakKw = intervals.reduce((highest: number, interval: ISiteLoadInterval) => Math.max(highest, interval.kw), 0);
    const avgKw = intervals.reduce((sum: number, interval: ISiteLoadInterval) => sum + interval.kw, 0) / intervals.length;

    return {
      peakKw,
      avgKw: Math.round(avgKw * 10) / 10,
      loadFactor: peakKw > 0 ? Math.round((avgKw / peakKw) * 1000) / 1000 : 0,
    };
  }

  private static buildRawLoads(context: IGeneratorContext): number[] {
    if (context.site.kind === 'cement-plant') {
      return SiteGeneratorHelper.buildCementLoads(context);
    }

    if (context.site.kind === 'airport') {
      return SiteGeneratorHelper.buildAirportLoads(context);
    }

    return SiteGeneratorHelper.buildSkiLoads(context);
  }

  private static buildCementLoads(context: IGeneratorContext): number[] {
    const { localHours, random, isWeekend, month } = context;
    const winterFactor = [12, 1, 2].includes(month) ? 0.97 : 1;
    const dayFactor = (isWeekend ? 0.94 : 1) * winterFactor * (0.98 + random() * 0.04);
    const noise = SiteGeneratorHelper.buildNoise(localHours.length, random, 0.015);
    const loads = localHours.map((_hour: number, index: number) => 2200 * dayFactor * (1 + noise[index]));
    const spikeCount = (isWeekend ? 1 : 3) + Math.floor(random() * (isWeekend ? 3 : 4));

    for (let spike = 0; spike < spikeCount; spike++) {
      const startIndex = Math.floor(random() * loads.length);
      const length = 1 + Math.floor(random() * 3);
      const targetKw = 3200 + random() * 800;

      for (let offset = 0; offset < length && startIndex + offset < loads.length; offset++) {
        loads[startIndex + offset] = Math.max(loads[startIndex + offset], targetKw * (0.96 + random() * 0.04));
      }
    }

    return loads;
  }

  private static buildAirportLoads(context: IGeneratorContext): number[] {
    const { localHours, random, isWeekend, month } = context;
    const isSummer = month >= 6 && month <= 9;
    const coolingKw = isSummer ? 520 : 90;
    const dayFactor = (isWeekend ? 0.95 : 1) * (0.97 + random() * 0.06);
    const noise = SiteGeneratorHelper.buildNoise(localHours.length, random, 0.025);

    return localHours.map((hour: number, index: number) => {
      const baseKw = 650 + 120 * SiteGeneratorHelper.bell(hour, 12, 6);
      const cooling = coolingKw * SiteGeneratorHelper.bell(hour, 15.5, 3.2);
      const terminalOps = 280 * SiteGeneratorHelper.bell(hour, 11, 4.5);
      const eveningBank = 950 * SiteGeneratorHelper.plateau(hour, 17, 21, 1.2);

      return (baseKw + cooling + terminalOps + eveningBank) * dayFactor * (1 + noise[index]);
    });
  }

  private static buildSkiLoads(context: IGeneratorContext): number[] {
    const { localHours, random, isWeekend, month } = context;
    const intensity = SiteGeneratorHelper.getSkiSeasonIntensity(month);
    const dayFactor = (isWeekend ? 1.08 : 1) * (0.95 + random() * 0.1);
    const noise = SiteGeneratorHelper.buildNoise(localHours.length, random, 0.03);

    return localHours.map((hour: number, index: number) => {
      const baseKw = 150 + 40 * intensity * SiteGeneratorHelper.bell(hour, 12, 5);
      const lifts = 600 * intensity * SiteGeneratorHelper.plateau(hour, 8, 16, 0.5);
      const snowmakingHour = hour >= 12 ? hour : hour + 24;
      const snowmaking = 520 * intensity * SiteGeneratorHelper.plateau(snowmakingHour, 22, 29, 0.5);

      return (baseKw + lifts + snowmaking) * dayFactor * (1 + noise[index]);
    });
  }

  private static getSkiSeasonIntensity(month: number): number {
    const intensityByMonth: Record<number, number> = { 12: 1, 1: 1, 2: 1, 3: 0.7, 11: 0.6, 4: 0.3 };

    return intensityByMonth[month] ?? 0;
  }

  private static bell(hour: number, centerHour: number, widthHours: number): number {
    const distance = (hour - centerHour) / widthHours;

    return Math.exp(-distance * distance);
  }

  private static plateau(hour: number, startHour: number, endHour: number, edgeHours: number): number {
    const rise = 1 / (1 + Math.exp(-(hour - startHour) / (edgeHours / 3)));
    const fall = 1 / (1 + Math.exp((hour - endHour) / (edgeHours / 3)));

    return rise * fall;
  }

  private static buildNoise(length: number, random: () => number, scale: number): number[] {
    const noise: number[] = [];
    let previous = 0;

    for (let index = 0; index < length; index++) {
      const gaussian = Math.sqrt(-2 * Math.log(random() + 1e-12)) * Math.cos(2 * Math.PI * random());
      previous = 0.7 * previous + 0.7 * gaussian * scale;
      noise.push(previous);
    }

    return noise;
  }

  private static buildLocalDayStarts(localDate: string): number[] {
    const [year, month, day] = localDate.split('-').map(Number);
    const startMs = SiteGeneratorHelper.getLocalMidnightMs(year, month, day);
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
    const endMs = SiteGeneratorHelper.getLocalMidnightMs(
      nextDay.getUTCFullYear(),
      nextDay.getUTCMonth() + 1,
      nextDay.getUTCDate(),
    );
    const starts: number[] = [];

    for (let currentMs = startMs; currentMs < endMs; currentMs += intervalMilliseconds) {
      starts.push(currentMs);
    }

    return starts;
  }

  private static getLocalMidnightMs(year: number, month: number, day: number): number {
    const probeMs = Date.UTC(year, month - 1, day, 7);
    const parts = offsetFormatter.formatToParts(new Date(probeMs));
    const read = (type: string): number => Number(parts.find((part) => part.type === type)?.value);
    const localAsUtcMs = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'));
    const offsetMs = localAsUtcMs - probeMs;

    return Date.UTC(year, month - 1, day) - offsetMs;
  }

  private static getLocalHour(startMs: number): number {
    const parts = hourMinuteFormatter.formatToParts(new Date(startMs));
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);

    return hour + minute / 60;
  }

  private static hashString(text: string): number {
    let hash = 2166136261;

    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
  }

  private static createMulberry32(seed: number): () => number {
    let state = seed;

    return (): number => {
      state = (state + 0x6d2b79f5) | 0;
      let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
      mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;

      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
  }
}
