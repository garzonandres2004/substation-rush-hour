'use client';
import { useEffect, useMemo, useState } from 'react';
import { dateLabel, hourLabel, rangeLabel, report, stressColor } from '../lib/report';

export interface SavedDay {
  date: string;
  generatedAt: string;
  capMW: number;
  jamThreshold: number;
  hours: {
    h: number;
    stress: number;
    congested: boolean;
    loadMW: number;
    charge: number;
    discharge: number;
    afterMW: number;
  }[];
}
interface Graded {
  date: string;
  overB: number;
  overA: Record<string, number>;
  relieved: Record<string, number>;
  guardHours: number;
  maxMissMW: number;
  jamHours: number[];
}

const TOL = 0.1; // MWh over the limit that still counts as held, as in the backtest
const f1 = (x: number) => x.toFixed(1);
const denverDate = (offsetDays = 0) =>
  new Date(Date.now() + offsetDays * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
const shortDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

// Consecutive hours to readable ranges: [17, 18, 21] -> "5 PM to 7 PM, 9 PM".
function ranges(hours: number[]): string {
  if (!hours.length) return 'none';
  const out: [number, number][] = [];
  for (const h of [...hours].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && h === last[1] + 1) last[1] = h;
    else out.push([h, h]);
  }
  return out.map(([a, b]) => rangeLabel(a, b)).join(', ');
}

export default function History({ saved }: { saved: SavedDay[] }) {
  const graded = report.backtest.days as unknown as Graded[];
  const gradedBy = useMemo(() => new Map(graded.map(g => [g.date, g])), [graded]);
  const savedBy = useMemo(() => new Map(saved.map(s => [s.date, s])), [saved]);
  const allDates = useMemo(
    () => [...new Set([...saved.map(s => s.date), ...graded.map(g => g.date)])].sort().reverse(),
    [saved, graded],
  );
  // "Today" depends on the viewer's clock, so it is worked out after the page loads.
  const [today, setToday] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => {
    const t = denverDate();
    setToday(t);
    setPick(savedBy.has(t) ? t : (allDates[0] ?? null));
  }, [savedBy, allDates]);
  const tomorrow = today ? denverDate(1) : null;
  const yesterday = today ? denverDate(-1) : null;
  const name = (d: string) =>
    d === today ? 'Today' : d === tomorrow ? 'Tomorrow' : d === yesterday ? 'Yesterday' : shortDate(d);
  const quick = [tomorrow, today, yesterday].filter((d): d is string => !!d && (savedBy.has(d) || gradedBy.has(d)));
  const day = pick ? savedBy.get(pick) : undefined;
  const grade = pick ? gradedBy.get(pick) : undefined;
  const jam = day ? day.hours.filter(h => h.stress >= day.jamThreshold).map(h => h.h) : [];
  const charges = day ? day.hours.filter(h => h.charge > 0.05).map(h => h.h) : [];
  const discharges = day ? day.hours.filter(h => h.discharge > 0.05).map(h => h.h) : [];
  const held = (k: string) => (grade ? (grade.overA[k] ?? 0) <= grade.overB + TOL : true);
  const overText = (k: string) => {
    if (!grade) return '';
    const added = Math.max(0, (grade.overA[k] ?? 0) - grade.overB);
    return added <= TOL ? 'Held the limit' : `Pushed it over by ${f1(added)} MWh`;
  };

  return (
    <main className="page">
      <header className="top">
        <div>
          <p className="eyebrow">Like a weather report</p>
          <h1>Today, tomorrow and past days</h1>
          <p className="lede">
            Every afternoon the page forecasts the next day. Here you can still see today's forecast while the day runs,
            and look back: each past day gets a report card once its real demand is published, about two days later.
          </p>
        </div>
        <p className="meta">
          <a href="/">Back to the main page</a>
        </p>
      </header>

      <section className="route" aria-labelledby="hist-h">
        <h2 id="hist-h" className="sr">
          Pick a day
        </h2>
        <div className="seg" role="group" aria-label="Day">
          {quick.map(d => (
            <button type="button" key={d} className={pick === d ? 'on' : ''} onClick={() => setPick(d)}>
              {name(d)}
            </button>
          ))}
        </div>
        <label className="pastpick">
          Past day{' '}
          <select value={pick ?? ''} onChange={e => setPick(e.target.value)}>
            {allDates.map(d => (
              <option key={d} value={d}>
                {d === today || d === yesterday ? `${name(d)} · ${dateLabel(d)}` : dateLabel(d)}
              </option>
            ))}
          </select>
        </label>
      </section>

      {pick ? (
        <>
          <section className="route" aria-labelledby="day-h">
            <p className="eyebrow">{name(pick)}</p>
            <h2 id="day-h">
              {dateLabel(pick)}
              {day ? `: ${jam.length ? `jam ${ranges(jam)}` : 'no jam forecast'}` : ''}
            </h2>
            {day ? (
              <>
                <div className="road-wrap">
                  <div className="road">
                    {day.hours.map(h => (
                      <div
                        key={h.h}
                        className="cell"
                        role="img"
                        style={{ background: stressColor(h.stress), cursor: 'default' }}
                        aria-label={`${hourLabel(h.h)}: traffic ${Math.round(h.stress * 100)} of 100`}
                        title={`${hourLabel(h.h)}: traffic ${Math.round(h.stress * 100)} of 100`}
                      />
                    ))}
                  </div>
                  <div className="hours" aria-hidden="true">
                    {[0, 3, 6, 9, 12, 15, 18, 21].map(h => (
                      <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
                        {hourLabel(h)}
                      </span>
                    ))}
                  </div>
                </div>
                <ul className="notes">
                  <li>
                    <b>The plan:</b> charge {ranges(charges)}; discharge {ranges(discharges)}. Limit that day{' '}
                    {f1(day.capMW)} MW.
                  </li>
                  <li>
                    Forecast made{' '}
                    {new Date(day.generatedAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZone: 'America/Denver',
                      timeZoneName: 'short',
                    })}
                    , from EIA demand, solar and wind, and CAISO day ahead prices.
                  </li>
                </ul>
              </>
            ) : (
              <p className="sub">
                The forecast strip for this day was not saved: saving every day's forecast started on{' '}
                {saved.length ? dateLabel(saved[0].date) : 'the next refresh'}. Its report card is below.
              </p>
            )}
          </section>

          <section className="evidence" aria-labelledby="card-h">
            <p className="eyebrow">Report card</p>
            <h2 id="card-h">
              {grade
                ? `Graded on real demand: ${held('stressAware') ? 'our plan held the limit' : 'our plan went over the limit'}`
                : 'Not graded yet'}
            </h2>
            {grade ? (
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Planned the night before, run on real demand</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">Ours: replanned hourly, with the guard</th>
                      <td>{overText('stressAware')}</td>
                    </tr>
                    <tr>
                      <th scope="row">Planning once, no guard</th>
                      <td>{overText('awareV1')}</td>
                    </tr>
                    <tr>
                      <th scope="row">Follows price only</th>
                      <td>{overText('priceOnly')}</td>
                    </tr>
                    <tr>
                      <th scope="row">Biggest forecast miss in one hour</th>
                      <td>{f1(grade.maxMissMW)} MW</td>
                    </tr>
                    <tr>
                      <th scope="row">Hours the guard stepped in</th>
                      <td>{grade.guardHours}</td>
                    </tr>
                    <tr>
                      <th scope="row">Jam relief, ours vs price plus guard</th>
                      <td>
                        {f1(grade.relieved.stressAware ?? 0)} vs {f1(grade.relieved.priceLimit ?? 0)} MWh
                        {(grade.relieved.priceLimit ?? 0) < 0 || (grade.relieved.stressAware ?? 0) < 0
                          ? ' (negative adds load in the jam)'
                          : ''}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">Forecast jam hours</th>
                      <td>{ranges(grade.jamHours)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="sub">
                Real demand for this day is published about two days later. Then the day is replayed hour by hour and
                gets its report card here.
              </p>
            )}
          </section>
        </>
      ) : null}
      <footer>
        Same engine and data as the main page. The report card replays each day the way the backtest does.
      </footer>
    </main>
  );
}
