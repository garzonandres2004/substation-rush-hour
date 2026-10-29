import { EmissionsHelper } from './emissions.helper';
import { ForecastScoreHelper } from './forecast-score.helper';

const pad = (value: number): string => String(value).padStart(2, '0');

const makeHour = (
  utcMs: number,
  localHourStart: string,
  overrides: Partial<Detour.Firestore.Snapshot.IGridHour> = {},
): Detour.Firestore.Snapshot.IGridHour => ({
  utcHourEnding: new Date(utcMs).toISOString().slice(0, 13),
  localHourStart,
  demandMw: 1000,
  dayAheadForecastMw: 1000,
  netGenerationMw: null,
  totalInterchangeMw: null,
  fuelMw: { COL: 100, NG: 100 },
  flags: [],
  ...overrides,
});

describe('signals helpers', () => {
  it('fits an exact line with ols', () => {
    const fit = EmissionsHelper.ols([1, 2, 3, 4], [5, 8, 11, 14]);

    expect(fit.slope).toBeCloseTo(3, 10);
    expect(fit.intercept).toBeCloseTo(2, 10);
    expect(fit.slopeStandardError).toBeCloseTo(0, 8);
  });

  it('matches a hand-computed slope standard error', () => {
    const fit = EmissionsHelper.ols([1, 2, 3, 4], [2, 4, 5, 8]);

    expect(fit.slope).toBeCloseTo(1.9, 10);
    expect(fit.intercept).toBeCloseTo(0, 10);
    expect(fit.slopeStandardError).toBeCloseTo(Math.sqrt(0.7 / 2 / 5), 10);
  });

  it('buckets the local hour across both daylight saving transitions', () => {
    const springUtc = Date.parse('2026-03-08T08:00:00Z');
    const fallUtc = Date.parse('2026-11-01T07:00:00Z');
    const rows = EmissionsHelper.buildRows([
      makeHour(fallUtc, '2026-11-01T01:00-06:00'),
      makeHour(springUtc, '2026-03-08T01:00-07:00'),
    ]);

    expect(rows[0].localHour).toBe(1);
    expect(rows[1].localHour).toBe(1);
    expect(rows[0].localDate).toBe('2026-03-08');
  });

  it('assigns July to summer and October to winter', () => {
    expect(EmissionsHelper.seasonOf(7)).toBe('summer');
    expect(EmissionsHelper.seasonOf(10)).toBe('winter');
  });

  it('breaks the difference chain at a utc gap', () => {
    const base = Date.parse('2026-07-15T00:00:00Z');
    const hours = Array.from({ length: 120 }, (_unused, index) =>
      makeHour(base + index * 3_600_000, `2026-07-${pad(15 + Math.floor(index / 24))}T${pad(index % 24)}:00-06:00`, {
        fuelMw: { COL: 100 + index * 10 + ((index * index) % 11) * 7, NG: 100 },
      }),
    );
    const withGap = hours.filter((_hour, index) => index !== 58);
    const full = EmissionsHelper.marginalSeries(EmissionsHelper.buildRows(hours), 'fossil-generation');
    const gapped = EmissionsHelper.marginalSeries(EmissionsHelper.buildRows(withGap), 'fossil-generation');
    const countAt = (series: typeof full, hour: number): number | undefined =>
      series.points.find((point) => point.hour === hour && point.season === 'summer')?.n;

    expect(countAt(full, 10)).toBe(5);
    expect(countAt(gapped, 10)).toBe(4);
    expect(countAt(gapped, 11)).toBe(4);
    expect(countAt(gapped, 12)).toBe(5);
    expect(full.points[0].lbPerMwh).toBeCloseTo(2260, 6);
  });

  it('scores mape, bias and peak under-forecast on a two-day fixture', () => {
    const dayOne = Date.parse('2026-07-15T06:00:00Z');
    const dayTwo = Date.parse('2026-07-16T06:00:00Z');
    const build = (date: string, startMs: number, forecastFactor: number): Detour.Firestore.Snapshot.IGridHour[] =>
      Array.from({ length: 24 }, (_unused, hour) => {
        const demand = hour === 17 ? 1200 : 1000;
        const factor = hour === 17 ? forecastFactor : 1.1;

        return makeHour(startMs + hour * 3_600_000, `${date}T${pad(hour)}:00-06:00`, {
          demandMw: demand,
          dayAheadForecastMw: demand * factor,
        });
      });
    const score = ForecastScoreHelper.score([...build('2026-07-15', dayOne, 0.9), ...build('2026-07-16', dayTwo, 1.1)]);

    expect(score.hoursScored).toBe(48);
    expect(score.daysScored).toBe(2);
    expect(score.mapePercent).toBeCloseTo(10, 8);
    expect(score.biasPercent).toBeCloseTo((46 * 10 + 10 - 10) / 48, 8);
    expect(score.peakUnderForecastRate).toBeCloseTo(50, 8);
    expect(score.meanPeakMissMw).toBeCloseTo((120 - 120) / 2, 8);
    expect(score.startDate).toBe('2026-07-15');
    expect(score.endDate).toBe('2026-07-16');
  });
});
