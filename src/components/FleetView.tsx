'use client';
import { useEffect, useState } from 'react';

// Main page view of lab section K: customer batteries behind this substation. Pick how many businesses
// and how they are coordinated; the numbers are precomputed (scripts/merge-fleet.ts, built with DETOUR,
// Juan Lizarazo, MIT, used with his permission) and fetched only when this section loads.

interface Overload {
  overloadHours: number;
  overloadMWh: number;
  hoursCreatedByFleet: number;
  hoursRelievedByFleet: number;
  savedBeforeUsd?: number;
  savedAfterUsd?: number;
  worstSiteChangeUsd?: number;
}
interface FleetRow {
  sites: number;
  pulseMW: number;
  withFleet: Overload;
  withSiteGuard: Overload;
  tradedAndGuard: Overload;
}
interface Data {
  months: Record<string, { noFleet: Overload; fleets: FleetRow[] }>;
}
type ModeKey = 'withFleet' | 'withSiteGuard' | 'tradedAndGuard';
const MODES: [ModeKey, string, string][] = [
  ['withFleet', 'Each on its own', 'Every business plans its own bill and nobody watches the substation.'],
  [
    'withSiteGuard',
    'Guard on each meter',
    'Each plan runs as is, and a guard moves charging out of hours that would put the substation over, never past the business’s own monthly peak.',
  ],
  [
    'tradedAndGuard',
    'Room shared, then the guard',
    'The utility publishes its spare room the day before, the businesses that need it most get it, and the guard catches what is left.',
  ],
];

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const int = (x: number) => Math.round(x).toLocaleString('en-US');
const monthShort = (m: string) =>
  new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });

export function FleetView() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [size, setSize] = useState(2);
  const [mode, setMode] = useState<ModeKey>('tradedAndGuard');
  useEffect(() => {
    fetch('/data/merge-fleet.json')
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <p className="sub">The customer battery results could not be loaded.</p>;
  if (!data) return <p className="sub">Loading the customer battery results…</p>;

  const months = Object.keys(data.months).sort();
  const sizes = data.months[months[0]].fleets;
  const rows = months.map(m => data.months[m].fleets[size]);
  const base = months.map(m => data.months[m].noFleet);
  const pick = rows.map(r => r[mode]);
  const noneHours = sum(base.map(b => b.overloadHours));
  const hours = sum(pick.map(x => x.overloadHours));
  const created = sum(pick.map(x => x.hoursCreatedByFleet));
  const before = sum(pick.map(x => x.savedBeforeUsd ?? 0));
  const after = sum(pick.map(x => x.savedAfterUsd ?? 0));
  // The plans before any guard are the same in every mode, so their savings are the guard rows' "before".
  const savedAlone = sum(rows.map(r => r.withSiteGuard.savedBeforeUsd ?? 0));
  const kept = mode === 'withFleet' || before <= 0 ? 100 : (100 * after) / before;
  const worst = mode === 'withFleet' ? 0 : Math.min(0, ...pick.map(x => x.worstSiteChangeUsd ?? 0));
  const delta = hours - noneHours;
  const first = months[0];
  const last = months[months.length - 1];
  const span = `${new Date(`${first}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })} to ${new Date(`${last}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`;

  // Month by month: hours over with no customer batteries, and with the choice above.
  const W = 760;
  const H = 200;
  const left = 36;
  const bottom = 24;
  const top = 10;
  const max = Math.max(1, ...base.map(b => b.overloadHours), ...pick.map(x => x.overloadHours));
  const gw = (W - left - 8) / months.length;
  const bw = Math.min(22, (gw - 10) / 2);
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max);

  return (
    <>
      <div className="controls" style={{ marginTop: 14 }}>
        <div className="seg" role="group" aria-label="Number of businesses">
          {sizes.map((f, i) => (
            <button key={f.sites} type="button" className={size === i ? 'on' : ''} onClick={() => setSize(i)}>
              {f.sites} businesses
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Coordination">
          {MODES.map(([k, label]) => (
            <button key={k} type="button" className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="sub" aria-live="polite">
        {sizes[size].sites} businesses with {sizes[size].pulseMW} MW of batteries between them.{' '}
        {MODES.find(m => m[0] === mode)![2]}
      </p>
      <div className="figures">
        <div>
          <b>
            {int(hours)} h{' '}
            <small style={{ fontSize: '0.55em', fontWeight: 600 }}>
              ({delta > 0 ? '+' : delta < 0 ? '−' : '±'}
              {int(Math.abs(delta))})
            </small>
          </b>
          <span>over the substation limit, against {int(noneHours)} with no customer batteries</span>
        </div>
        <div>
          <b>{int(created)} h</b>
          <span>that were not over before: the batteries’ own charging caused them</span>
        </div>
        <div>
          <b>{mode === 'withFleet' ? '100%' : `${kept.toFixed(0)}%`}</b>
          <span>
            of their bill savings the businesses keep (${int(mode === 'withFleet' ? savedAlone : after)} in all)
            {worst < 0 ? `; the worst single business gives up $${int(-worst)}` : ''}
          </span>
        </div>
      </div>
      <div className="scroll">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="chart"
          role="img"
          aria-label={`Hours over the limit each month, ${span}: grey with no customer batteries, blue with the choice above`}
        >
          {[0, 0.5, 1].map(f => (
            <g key={f}>
              <line x1={left} x2={W - 8} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" />
              <text x={left - 6} y={y(max * f) + 4} textAnchor="end" className="axis">
                {Math.round(max * f)}
              </text>
            </g>
          ))}
          {months.map((m, i) => {
            const x0 = left + i * gw + (gw - 2 * bw - 2) / 2;
            const a = base[i].overloadHours;
            const b = pick[i].overloadHours;
            return (
              <g key={m}>
                <rect x={x0} y={y(a)} width={bw} height={Math.max(0.5, y(0) - y(a))} fill="var(--slate)" opacity={0.35}>
                  <title>{`${monthShort(m)}: ${a} h over with no customer batteries`}</title>
                </rect>
                <rect x={x0 + bw + 2} y={y(b)} width={bw} height={Math.max(0.5, y(0) - y(b))} fill="var(--charge)">
                  <title>{`${monthShort(m)}: ${b} h over with this choice (${pick[i].hoursCreatedByFleet} caused by the batteries)`}</title>
                </rect>
                <text x={left + i * gw + gw / 2} y={H - 6} textAnchor="middle" className="axis">
                  {monthShort(m)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="sub">
        Hours over the limit each month, {span}: grey with no customer batteries, blue with the choice above. The
        businesses, tariffs and bill planner come from{' '}
        <a href="https://detourgrid.com/" target="_blank" rel="noreferrer">
          DETOUR
        </a>{' '}
        (Juan Lizarazo, MIT license, used with his permission). Details and the full table are in the{' '}
        <a href="/lab#fl-h">lab, section K</a>.
      </p>
    </>
  );
}
