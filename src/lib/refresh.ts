// Decides whether the daily refresh needs to start. Used by the Vercel cron route (app/api/refresh).
// The page is fresh when it already shows tomorrow's forecast (Utah time), the same test the
// workflow's own first step uses, so a cron call and a GitHub schedule can never both deploy.

export const TZ = 'America/Denver';

export function tomorrowInUtah(now: Date): string {
  return new Date(now.getTime() + 864e5).toLocaleDateString('en-CA', { timeZone: TZ });
}

export type RefreshDecision =
  | { action: 'skip'; reason: 'fresh'; pageDate: string; tomorrow: string }
  | { action: 'skip'; reason: 'running'; pageDate: string | null; tomorrow: string }
  | { action: 'dispatch'; pageDate: string | null; tomorrow: string };

// pageDate: the date in the live report.json, or null if it could not be read (then refresh anyway).
// runActive: a refresh run is queued or in progress on GitHub.
export function decide(pageDate: string | null, runActive: boolean, now: Date): RefreshDecision {
  const tomorrow = tomorrowInUtah(now);
  if (pageDate !== null && pageDate >= tomorrow) return { action: 'skip', reason: 'fresh', pageDate, tomorrow };
  if (runActive) return { action: 'skip', reason: 'running', pageDate, tomorrow };
  return { action: 'dispatch', pageDate, tomorrow };
}
