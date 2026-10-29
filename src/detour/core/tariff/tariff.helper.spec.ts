import { siteArchetypes } from '../sites/sites.constants';
import { SiteGeneratorHelper } from '../sites/site-generator.helper';
import { TimeHelper } from '../helpers/time.helper';
import { tariffSchedules } from './tariff.constants';
import { TariffHelper } from './tariff.helper';

describe('tariff engine', () => {
  it('bills a battery-off dispatch identically to the baseline', () => {
    const intervals = TimeHelper.localDayIntervals('2026-07-15');
    const loadKw = intervals.map((_interval, i: number) => 800 + (i % 7) * 40);
    const batteryKw = intervals.map(() => 0);
    const gridKw = loadKw.map((kw: number, i: number) => kw + batteryKw[i]);

    for (const schedule of [tariffSchedules.SCHEDULE_8, tariffSchedules.SCHEDULE_6]) {
      const baseline = TariffHelper.monthlyBill(schedule, intervals, loadKw);
      const dispatched = TariffHelper.monthlyBill(schedule, intervals, gridKw);

      expect(dispatched.total).toBe(baseline.total);
    }
  });

  it('builds 92, 96 and 100 intervals on spring-forward, normal and fall-back days', () => {
    expect(TimeHelper.localDayIntervals('2026-03-08')).toHaveLength(92);
    expect(TimeHelper.localDayIntervals('2026-07-15')).toHaveLength(96);
    expect(TimeHelper.localDayIntervals('2026-11-01')).toHaveLength(100);
  });

  it('matches a hand-checked flat 1,000 kW Wednesday on Schedule 8', () => {
    const intervals = TimeHelper.localDayIntervals('2026-07-15');
    const loadKw = intervals.map(() => 1000);
    const bill = TariffHelper.monthlyBill(tariffSchedules.SCHEDULE_8, intervals, loadKw);
    const amounts = Object.fromEntries(bill.lines.map((line) => [line.id, line.amount]));

    expect(bill.determinants.onPeakKwh).toBe(7000);
    expect(bill.determinants.offPeakKwh).toBe(17000);
    expect(bill.determinants.demandKw).toBe(1000);
    expect(amounts['customer-charge']).toBe(73);
    expect(amounts['facilities']).toBe(5150);
    expect(amounts['demand']).toBe(16840);
    expect(amounts['energy-on-peak']).toBe(436.77);
    expect(amounts['energy-off-peak']).toBe(539.14);
    expect(bill.total).toBe(23038.91);
  });
  it('matches the independently recomputed simulated airport day (Wed 2026-07-15, Schedule 8)', () => {
    const intervals = TimeHelper.localDayIntervals('2026-07-15');
    const loadKw = SiteGeneratorHelper.generateDay(siteArchetypes.AIRPORT, '2026-07-15').map(
      (interval) => interval.kw
    );
    const bill = TariffHelper.monthlyBill(tariffSchedules.SCHEDULE_8, intervals, loadKw);
    const amounts = Object.fromEntries(bill.lines.map((line) => [line.id, line.amount]));

    expect(bill.determinants.onPeakKwh).toBeCloseTo(10502.2, 1);
    expect(bill.determinants.offPeakKwh).toBeCloseTo(14936.975, 2);
    expect(bill.determinants.demandKw).toBe(1926.2);
    expect(amounts['facilities']).toBe(9919.93);
    expect(amounts['demand']).toBe(32437.21);
    expect(amounts['energy-on-peak']).toBe(655.28);
    expect(amounts['energy-off-peak']).toBe(473.71);
    expect(bill.total).toBe(43559.13);
  });
});
