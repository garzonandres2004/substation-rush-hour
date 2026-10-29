import fleetRaw from '../../public/data/merge-fleet.json';

// Section K: many customer batteries behind one substation. Built with DETOUR (Juan Lizarazo, MIT,
// used with his permission): its Rocky Mountain Power tariffs, simulated businesses and bill planner,
// run behind this project's real substation. Numbers are read from public/data/merge-fleet.json
// (scripts/merge-fleet.ts).

interface Overload {
  overloadHours: number;
  overloadDays: number;
  overloadMWh: number;
  peakMW: number;
  hoursCreatedByFleet: number;
  daysWithCreatedHours: number;
  hoursRelievedByFleet: number;
}
interface SiteGuard extends Overload {
  movedMWh: number;
  unmovedMWh: number;
  maxShiftHours: number;
  savedBeforeUsd: number;
  savedAfterUsd: number;
  savingsKeptPct: number;
  worstSiteKeptPct: number;
}
interface FleetRow {
  copiesPerType: number;
  sites: number;
  pulseMW: number;
  withFleet: Overload;
  withSiteGuard: SiteGuard;
  avgByLocalHour: number[];
}
interface Month {
  noFleet: Overload;
  fleets: FleetRow[];
}
const fleet = fleetRaw as unknown as { generatedAt: string; months: Record<string, Month> };
const months = Object.keys(fleet.months).sort();
const WINTER = ['11', '12', '01', '02', '03'];
const SUMMER = ['06', '07', '08'];

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const monthName = (m: string) =>
  new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const hourLabel = (h: number) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);

function total(i: number) {
  const rows = months.map(m => fleet.months[m].fleets[i]);
  const base = months.map(m => fleet.months[m].noFleet);
  return {
    sites: rows[0].sites,
    pulseMW: rows[0].pulseMW,
    noFleetHours: sum(base.map(b => b.overloadHours)),
    aloneHours: sum(rows.map(r => r.withFleet.overloadHours)),
    aloneCreated: sum(rows.map(r => r.withFleet.hoursCreatedByFleet)),
    aloneCreatedDays: sum(rows.map(r => r.withFleet.daysWithCreatedHours)),
    aloneRelieved: sum(rows.map(r => r.withFleet.hoursRelievedByFleet)),
    guardHours: sum(rows.map(r => r.withSiteGuard.overloadHours)),
    guardCreated: sum(rows.map(r => r.withSiteGuard.hoursCreatedByFleet)),
    moved: sum(rows.map(r => r.withSiteGuard.movedMWh)),
    unmoved: sum(rows.map(r => r.withSiteGuard.unmovedMWh)),
    kept: (100 * sum(rows.map(r => r.withSiteGuard.savedAfterUsd))) / sum(rows.map(r => r.withSiteGuard.savedBeforeUsd)),
    worstKept: Math.min(...rows.map(r => r.withSiteGuard.worstSiteKeptPct)),
    maxShift: Math.max(...rows.map(r => r.withSiteGuard.maxShiftHours)),
  };
}

function profile(i: number, monthsOfYear: string[]): number[] {
  const rows = months.filter(m => monthsOfYear.includes(m.slice(5))).map(m => fleet.months[m].fleets[i]);
  return Array.from({ length: 24 }, (_, h) => sum(rows.map(r => r.avgByLocalHour[h])) / Math.max(1, rows.length));
}

function ProfileChart({ winter, summer }: { winter: number[]; summer: number[] }) {
  const W = 760;
  const panelH = 120;
  const gap = 46;
  const left = 44;
  const bw = (W - left - 8) / 24;
  const max = Math.max(...winter.map(Math.abs), ...summer.map(Math.abs), 1);
  const panel = (vals: number[], y0: number, title: string) => {
    const mid = y0 + panelH / 2;
    const scale = (panelH / 2 - 6) / max;
    return (
      <g key={title}>
        <text x={left} y={y0 - 8} className="axis" style={{ fontWeight: 600 }}>
          {title}
        </text>
        <line x1={left} x2={W - 8} y1={mid} y2={mid} stroke="var(--line)" />
        {vals.map((v, h) => (
          <rect
            key={h}
            x={left + h * bw + 1}
            width={bw - 2}
            y={v >= 0 ? mid - v * scale : mid}
            height={Math.max(0.5, Math.abs(v) * scale)}
            fill={v >= 0 ? 'var(--charge)' : 'var(--discharge)'}
          >
            <title>{`${hourLabel(h)}: ${v >= 0 ? 'charging' : 'discharging'} ${Math.abs(v).toFixed(1)} MW on average`}</title>
          </rect>
        ))}
        <text x={left - 6} y={mid - panelH / 2 + 10} textAnchor="end" className="axis">
          +{max.toFixed(0)}
        </text>
        <text x={left - 6} y={mid + 4} textAnchor="end" className="axis">
          0
        </text>
        <text x={left - 6} y={mid + panelH / 2} textAnchor="end" className="axis">
          −{max.toFixed(0)}
        </text>
        {[0, 6, 12, 18, 22].map(h => (
          <text key={h} x={left + h * bw + bw / 2} y={y0 + panelH + 14} textAnchor="middle" className="axis">
            {hourLabel(h)}
          </text>
        ))}
      </g>
    );
  };
  const H = 2 * panelH + gap + 40;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="chart"
      role="img"
      aria-label="Average fleet battery power by hour, winter and summer: discharge in the on-peak window, then a charging spike from 10 PM"
    >
      {panel(winter, 20, 'November to March, MW (up: charging, down: discharging)')}
      {panel(summer, 20 + panelH + gap, 'June to August, MW')}
    </svg>
  );
}

export default function FleetLab() {
  const big = fleet.months[months[0]].fleets.length - 1;
  const t = fleet.months[months[0]].fleets.map((_, i) => total(i));
  const b = t[big];
  const winter = profile(big, WINTER);
  const summer = profile(big, SUMMER);
  const peakHour = winter.indexOf(Math.max(...winter));
  const worstMonth = months
    .map(m => ({ m, d: fleet.months[m].fleets[big].withFleet.overloadHours - fleet.months[m].noFleet.overloadHours }))
    .sort((x, y) => y.d - x.d)[0];
  const wm = fleet.months[worstMonth.m];
  return (
    <section className="evidence" aria-labelledby="fl-h">
      <p className="eyebrow">K · Many customer batteries behind one substation, built with DETOUR</p>
      <h2 id="fl-h">
        {b.sites} businesses each cutting their own bill made this substation go over its limit {b.aloneCreated} more
        hours. The guard brought that to {b.guardCreated}, and{' '}
        {b.worstKept >= 99.5
          ? `every customer kept their savings (${Math.min(100, b.kept).toFixed(0)}%).`
          : `customers kept ${b.kept.toFixed(0)}% of their savings.`}
      </h2>
      <p className="sub">
        A Torus Station behind a business answers to two bosses: the customer's bill and the substation's limit.{' '}
        <a href="https://detourgrid.com">DETOUR</a>, by Juan Lizarazo for the same bounty, plans for the bill: Rocky
        Mountain Power's real Schedule 8 and 6 rates, simulated businesses (a regional airport, a cement plant and a ski
        resort, each with its own Spin and Pulse), and a day ahead plan solved as a linear program. We put copies of his
        businesses, each running his planner on its own bill, behind this project's substation (PacifiCorp East demand
        scaled to 100 MW, limit at the 95th percentile of the last 30 days), from {monthName(months[0])} to{' '}
        {monthName(months[months.length - 1])}. Only what the batteries change is added to the substation load. Used
        with Juan's permission under the MIT license.
      </p>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Behind the substation</th>
              <th>Hours over the limit</th>
              <th>New hours over, caused by the batteries</th>
              <th>Hours the batteries relieved</th>
              <th>With the guard: hours over (new ones)</th>
              <th>Customers keep</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">No customer batteries</th>
              <td>{t[0].noFleetHours}</td>
              <td>n/a</td>
              <td>n/a</td>
              <td>n/a</td>
              <td>n/a</td>
            </tr>
            {t.map(r => (
              <tr key={r.sites}>
                <th scope="row">
                  {r.sites} businesses, {r.pulseMW} MW of batteries
                </th>
                <td>{r.aloneHours}</td>
                <td>
                  <b>{r.aloneCreated}</b> on {r.aloneCreatedDays} days
                </td>
                <td>{r.aloneRelieved}</td>
                <td>
                  <b>{r.guardHours}</b> ({r.guardCreated})
                </td>
                <td>{r.kept.toFixed(1)}% of savings</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ProfileChart winter={winter} summer={summer} />
      <ul className="notes">
        <li>
          <b>Every battery follows the same clock.</b> Each business discharges in its tariff's on-peak window and starts
          charging the moment it ends: on average {winter[peakHour].toFixed(1)} MW at {hourLabel(peakHour)} in winter
          for {b.sites} businesses. In {monthName(worstMonth.m)} the substation went over its limit{' '}
          {wm.fleets[big].withFleet.overloadHours} hours instead of {wm.noFleet.overloadHours}, and its peak rose from{' '}
          {wm.noFleet.peakMW.toFixed(1)} to {wm.fleets[big].withFleet.peakMW.toFixed(1)} MW. The same lesson as the main
          page, at fleet scale: storage that chases the cheapest hour without watching traffic can cause the jam.
        </li>
        <li>
          <b>Small fleets help, big ones hurt.</b> With {t[0].sites} businesses the batteries relieve more hours than
          they create ({t[0].aloneRelieved} against {t[0].aloneCreated}). With {b.sites}, they create{' '}
          {b.aloneCreated} and relieve {b.aloneRelieved}.
        </li>
        <li>
          <b>The guard, site by site.</b> When the fleet's charging would push the substation over, each charging
          business moves its share to the nearest 15 minutes that are off-peak on its own tariff, inside the same
          off-peak block, that its battery can take, and that never lift its own monthly peak. Each business is then
          billed again on its real tariff. With {b.sites} businesses it moved {b.moved.toFixed(0)} MWh of charging, up to{' '}
          {b.maxShift} hours, and customers kept {b.kept.toFixed(1)}% of their savings (the least any one kept:{' '}
          {b.worstKept.toFixed(0)}%). Off-peak energy is one flat rate on Schedule 8, so moving inside it costs
          nothing.
        </li>
        <li>
          <b>What is left.</b> {b.unmoved.toFixed(0)} MWh of fleet charging found no room within 12 hours and stayed,
          which is why {b.guardCreated} new hours remain with {b.sites} businesses. A guard that could also ask for a
          little less discharge, or a substation limit inside each business's own plan, would close that gap.
        </li>
        <li>
          Limits: simulated businesses, as in DETOUR; their copies differ only in day to day noise, which makes them
          more alike than real customers; carbon weight set to zero (each business plans for its bill only); hourly
          substation data against 15 minute plans.
        </li>
      </ul>
    </section>
  );
}
