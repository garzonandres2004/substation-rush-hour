import { TimeHelper } from '../helpers/time.helper';
import { backtestSettings } from './backtest.constants';

export class BacktestMonthsHelper {
  public static throughDate(pulledAt: Date): string {
    const parts = TimeHelper.localParts(pulledAt.getTime());

    return TimeHelper.addDays(TimeHelper.formatLocalDate(parts.year, parts.month, parts.day), -1);
  }

  public static availableMonths(gridMonths: { month: string }[], throughDate: string): string[] {
    const lastMonth = throughDate.slice(0, 7);

    return gridMonths
      .map((entry: { month: string }) => entry.month)
      .filter((month: string) => month.startsWith(`${backtestSettings.YEAR}-`) && month <= lastMonth)
      .sort();
  }

  public static partialThrough(month: string, throughDate: string): string | null {
    if (throughDate.slice(0, 7) !== month) {
      return null;
    }

    const [year, monthNumber] = month.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

    return Number(throughDate.slice(8, 10)) < daysInMonth ? throughDate : null;
  }
}
