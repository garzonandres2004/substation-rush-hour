import { IInterval } from '../models';
import { ILocalParts } from './time.interfaces';

export class TimeHelper {
  public static readonly timeZone = 'America/Denver';
  public static readonly intervalMinutes = 15;

  private static readonly _formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });

  private static readonly _weekdayIndex: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  public static localParts(instantMs: number): ILocalParts {
    const parts: Record<string, string> = {};

    for (const part of TimeHelper._formatter.formatToParts(new Date(instantMs))) {
      parts[part.type] = part.value;
    }

    return {
      year: Number(parts['year']),
      month: Number(parts['month']),
      day: Number(parts['day']),
      hour: Number(parts['hour']),
      minute: Number(parts['minute']),
      weekday: TimeHelper._weekdayIndex[parts['weekday']],
    };
  }

  public static formatLocalDate(year: number, month: number, day: number): string {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  public static addDays(localDate: string, days: number): string {
    const [year, month, day] = localDate.split('-').map(Number);
    const shifted = new Date(Date.UTC(year, month - 1, day + days));

    return TimeHelper.formatLocalDate(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth() + 1,
      shifted.getUTCDate(),
    );
  }

  public static localMidnightUtcMs(localDate: string): number {
    const [year, month, day] = localDate.split('-').map(Number);
    const candidates = [6, 7].map((offsetHours: number) => Date.UTC(year, month - 1, day, offsetHours));

    for (const candidate of candidates) {
      const parts = TimeHelper.localParts(candidate);

      if (parts.day === day && parts.hour === 0 && parts.minute === 0) {
        return candidate;
      }
    }

    throw new Error(`Cannot resolve local midnight for ${localDate}`);
  }

  public static localDayIntervals(localDate: string): IInterval[] {
    const startMs = TimeHelper.localMidnightUtcMs(localDate);
    const endMs = TimeHelper.localMidnightUtcMs(TimeHelper.addDays(localDate, 1));
    const stepMs = TimeHelper.intervalMinutes * 60000;
    const intervals: IInterval[] = [];

    for (let instantMs = startMs; instantMs < endMs; instantMs += stepMs) {
      const parts = TimeHelper.localParts(instantMs);
      const intervalDate = TimeHelper.formatLocalDate(parts.year, parts.month, parts.day);

      intervals.push({
        index: intervals.length,
        startUtc: new Date(instantMs).toISOString(),
        localDate: intervalDate,
        localHour: parts.hour,
        localMinute: parts.minute,
        isWeekday: parts.weekday >= 1 && parts.weekday <= 5,
        isHoliday: TimeHelper.isUtahTariffHoliday(intervalDate),
        hours: TimeHelper.intervalMinutes / 60,
      });
    }

    return intervals;
  }

  public static localMonthIntervals(month: string): IInterval[] {
    const [year, monthNumber] = month.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const intervals: IInterval[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dayIntervals = TimeHelper.localDayIntervals(TimeHelper.formatLocalDate(year, monthNumber, day));

      for (const interval of dayIntervals) {
        intervals.push({ ...interval, index: intervals.length });
      }
    }

    return intervals;
  }

  public static isUtahTariffHoliday(localDate: string): boolean {
    const year = Number(localDate.slice(0, 4));

    return [year, year + 1].some((holidayYear: number) =>
      TimeHelper.observedHolidays(holidayYear).includes(localDate),
    );
  }

  public static observedHolidays(year: number): string[] {
    const fixedDates = [
      Date.UTC(year, 0, 1),
      Date.UTC(year, 6, 4),
      Date.UTC(year, 6, 24),
      Date.UTC(year, 11, 25),
    ].map((dateMs: number) => TimeHelper.observe(dateMs));
    const floatingDates = [
      TimeHelper.nthWeekday(year, 1, 1, 3),
      TimeHelper.lastWeekday(year, 4, 1),
      TimeHelper.nthWeekday(year, 8, 1, 1),
      TimeHelper.nthWeekday(year, 10, 4, 4),
    ].map((dateMs: number) => TimeHelper.formatUtcMs(dateMs));

    return [...fixedDates, ...floatingDates];
  }

  private static observe(dateMs: number): string {
    const weekday = new Date(dateMs).getUTCDay();
    const shiftDays = weekday === 6 ? -1 : weekday === 0 ? 1 : 0;

    return TimeHelper.formatUtcMs(dateMs + shiftDays * 86400000);
  }

  private static nthWeekday(year: number, monthIndex: number, weekday: number, occurrence: number): number {
    const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
    const offset = (weekday - firstWeekday + 7) % 7;

    return Date.UTC(year, monthIndex, 1 + offset + (occurrence - 1) * 7);
  }

  private static lastWeekday(year: number, monthIndex: number, weekday: number): number {
    const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0));
    const offset = (lastDay.getUTCDay() - weekday + 7) % 7;

    return Date.UTC(year, monthIndex + 1, 0 - offset);
  }

  private static formatUtcMs(dateMs: number): string {
    const date = new Date(dateMs);

    return TimeHelper.formatLocalDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
}
