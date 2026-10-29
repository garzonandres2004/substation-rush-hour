// Builds DETOUR's grid month shape from our own EIA-930 pulls (data/lab-raw), so the vendored DETOUR
// code runs on the same public data our engine uses. Same conventions as DETOUR's ingest:
// EIA periods are UTC hour ending, localHourStart is the local start of that hour with its offset.
import { readFileSync } from 'node:fs';
import '../detour/types/firestore.d';

type GridHour = Detour.Firestore.Snapshot.IGridHour;
type GridMonth = Detour.Firestore.Snapshot.IGridMonth;
type EiaRow = { period: string; value: string | null; type?: string; fueltype?: string };

const HOUR_MS = 3_600_000;
const localFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Denver',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'longOffset',
});

function rows(path: string): EiaRow[] {
  const json = JSON.parse(readFileSync(path, 'utf8'));
  return json.response?.data ?? json;
}

function toLocalIso(ms: number): string {
  const parts: Record<string, string> = {};
  for (const part of localFormatter.formatToParts(new Date(ms))) parts[part.type] = part.value;
  const offset = parts.timeZoneName.replace('GMT', '') || '+00:00';
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}${offset}`;
}

function num(value: string | null): number | null {
  if (value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function loadGridMonths(dir = 'data/lab-raw'): GridMonth[] {
  const hours = new Map<string, GridHour>();
  const hourFor = (key: string): GridHour => {
    let hour = hours.get(key);
    if (!hour) {
      hour = {
        utcHourEnding: key,
        localHourStart: toLocalIso(Date.parse(`${key}:00:00Z`) - HOUR_MS),
        demandMw: null,
        dayAheadForecastMw: null,
        netGenerationMw: null,
        totalInterchangeMw: null,
        fuelMw: {},
        flags: [],
      };
      hours.set(key, hour);
    }
    return hour;
  };
  for (const row of rows(`${dir}/eia_demand.json`)) if (row.type === 'D') hourFor(row.period).demandMw = num(row.value);
  for (const row of rows(`${dir}/eia_demand_forecast.json`))
    if (row.type === 'DF') hourFor(row.period).dayAheadForecastMw = num(row.value);
  for (const row of rows(`${dir}/eia_fuel.json`))
    if (row.fueltype) hourFor(row.period).fuelMw[row.fueltype] = num(row.value);
  for (const hour of hours.values()) {
    const values = Object.values(hour.fuelMw).filter((v): v is number => v !== null);
    hour.netGenerationMw = values.length ? values.reduce((a, b) => a + b, 0) : null;
  }
  const byMonth = new Map<string, GridHour[]>();
  for (const hour of [...hours.values()].sort((a, b) => a.utcHourEnding.localeCompare(b.utcHourEnding))) {
    const month = hour.localHourStart.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), hour]);
  }
  return [...byMonth].map(([month, monthHours]) => ({ month, hours: monthHours }));
}
