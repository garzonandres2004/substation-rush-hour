// Phase 0 check: the ported DETOUR tariff and site code must reproduce DETOUR's published numbers.
// DETOUR (MIT, Juan Lizarazo): July 2026 airport, no storage: peak 1,952 kW at 6:00 p.m. Jul 2, bill $74,891.
import { TimeHelper } from '../src/detour/core/helpers/time.helper';
import { siteArchetypes } from '../src/detour/core/sites/sites.constants';
import { SiteGeneratorHelper } from '../src/detour/core/sites/site-generator.helper';
import { tariffSchedules } from '../src/detour/core/tariff/tariff.constants';
import { TariffHelper } from '../src/detour/core/tariff/tariff.helper';

const month = process.argv[2] ?? '2026-07';
for (const site of Object.values(siteArchetypes)) {
  const intervals = TimeHelper.localMonthIntervals(month);
  const load = SiteGeneratorHelper.generateMonth(site, month);
  if (load.length !== intervals.length) throw new Error(`length mismatch ${load.length} vs ${intervals.length}`);
  const kw = load.map(l => l.kw);
  const schedule = site.scheduleId === 'schedule-8' ? tariffSchedules.SCHEDULE_8 : tariffSchedules.SCHEDULE_6;
  const bill = TariffHelper.monthlyBill(schedule, intervals, kw);
  const d = bill.determinants;
  const at = d.demandIntervalStartUtc
    ? new Date(d.demandIntervalStartUtc).toLocaleString('en-US', { timeZone: 'America/Denver' })
    : '';
  console.log(
    `${site.id.padEnd(13)} ${schedule.id}  billed peak ${d.demandKw.toFixed(0)} kW at ${at}  facilities ${d.facilitiesKw.toFixed(0)} kW  bill $${bill.total.toFixed(0)}`,
  );
}
