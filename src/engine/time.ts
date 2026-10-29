const TZ = 'America/Denver';
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' });

export function localDate(t: string): string {
  return dateFmt.format(new Date(t));
}
export function localHour(t: string): number {
  return parseInt(hourFmt.format(new Date(t)), 10);
}
export function dayOfWeek(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}
export function isWeekend(date: string): boolean {
  const d = dayOfWeek(date);
  return d === 0 || d === 6;
}

// EIA-930 hourly values are hour ending: period "2026-07-02T18" (UTC) covers 17:00 to 18:00 UTC.
// https://www.eia.gov/electricity/930-content/about.html. This returns the hour's start, the
// convention every other series here uses (CAISO prices and Open-Meteo weather are hour starting).
export function eiaHourStart(period: string): string {
  return new Date(Date.parse(`${period.slice(0, 13)}:00:00Z`) - 3_600_000).toISOString().replace('.000Z', 'Z');
}
