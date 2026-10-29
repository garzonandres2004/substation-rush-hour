import raw from '../../public/data/lab.json';
import LabOverview from './LabOverview';
import SecondsLab from './SecondsLab';
import SweepLab from './SweepLab';
import FleetLab from './FleetLab';
import FlexLab from './FlexLab';
import ThermalLab from './ThermalLab';
import YearLab from './YearLab';

interface Range {
  mean: number;
  lo: number;
  hi: number;
}
interface Heat {
  maxHotSpotC: number;
  agingDays: number;
  calendarDays: number;
}
interface LimitResult {
  withoutStorageMW: number;
  stationMW: number;
  fiveLineRuleMW: number;
  heatAtStationMax: Heat;
  heatWithoutStorageMax: Heat;
}
interface LabData {
  generatedAt: string;
  days: number;
  firstDay: string;
  lastDay: string;
  confidence: {
    days: number;
    resamples: number;
    jamReliefMWh: { ours: Range; priceOnlyWithGuard: Range; difference: Range; shareOfResamplesOursAhead: number };
    valuePerDay: Range;
    costOfIndexPerDay: Range;
    overloadDayRate: {
      planOnce: { days: number; lo: number; hi: number };
      priceOnly: { days: number; lo: number; hi: number };
      oursUpper95: number;
      oursDays: number;
    };
  };
  events: {
    hours: number;
    requestMWh: number;
    byStrategy: Record<string, { meanReadyPct: number; fullDays: number; worstPct: number }>;
    reserve?: {
      reserveMWh: number;
      valuePerDay: Record<'ours' | 'oursWithReserve', number>;
      jamReliefMWh: Record<'ours' | 'oursWithReserve', number>;
      overloadDays: Record<'ours' | 'oursWithReserve', number>;
    };
  };
  frontier: {
    label: string;
    guard: boolean;
    meanMarginMW: number;
    daysOver: number;
    totalOverMWh: number;
    valuePerDay: number;
    jamReliefMWh: number;
  }[];
  thermal: {
    nameplateMW: number;
    transformer: Record<string, number>;
    ambientC: { min: number; mean: number; max: number };
    ratingMW: { min: number; mean: number; max: number };
    ratingAtTightestHourMW: { min: number; mean: number };
    results: { fixed: LimitResult; temperature: LimitResult };
  };
}
const lab = raw as unknown as LabData;

const f1 = (x: number) => x.toFixed(1);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const money = (x: number) => `${x < 0 ? '-' : ''}$${Math.abs(Math.round(x)).toLocaleString('en-US')}`;
const NAMES: Record<string, string> = {
  ours: 'Stays out of traffic, with the guard (ours)',
  oursWithReserve: 'Ours, holding a reserve for the event hour',
  priceOnlyWithGuard: 'Price plus the guard',
  priceOnly: 'Follows price only',
  fiveLineRule: 'Five line rule',
};

export default function Lab() {
  const c = lab.confidence;
  const guardRow = lab.frontier.find(r => r.guard)!;
  const margins = lab.frontier.filter(r => !r.guard);
  const zeroMargin = margins.find(r => r.daysOver === 0);
  return (
    <main className="page">
      <header className="top">
        <div>
          <p className="eyebrow">The deeper checks behind the main page</p>
          <h1>The lab</h1>
          <p className="lede">
            We tried to break our own results with more real, open data: a full year planned on weather forecasts as
            they were issued, 17 different settings, real GPU power second by second, a heat based transformer limit,
            flexible data centers and a fleet of customer batteries built with DETOUR. Every number is labeled measured,
            modeled or assumed.
          </p>
        </div>
        <p className="meta">
          <a href="/">Back to the main page</a>
        </p>
      </header>

      <LabOverview />
      <YearLab />
      <SecondsLab />
      <SweepLab />
      <FlexLab />
      <ThermalLab />
      <FleetLab />

      <section className="evidence" aria-labelledby="conf-h">
        <p className="eyebrow">H · On the main page's 30 days: confidence</p>
        <h2 id="conf-h">How sure can 30 days make us?</h2>
        <p className="sub">
          We resampled the {c.days} days {c.resamples.toLocaleString('en-US')} times (bootstrap) and report the middle
          90 percent of outcomes. Day to day variation is large, so ranges matter more than single numbers.
        </p>
        <div className="figures">
          <div>
            <b>
              {f1(c.jamReliefMWh.difference.lo)} to {f1(c.jamReliefMWh.difference.hi)} MWh
            </b>
            <span>
              More jam relief a day from the traffic index than price alone, both with the guard (average{' '}
              {f1(c.jamReliefMWh.difference.mean)}). Ahead in {pct(c.jamReliefMWh.shareOfResamplesOursAhead)} of
              resamples.
            </span>
          </div>
          <div>
            <b>
              {money(c.costOfIndexPerDay.lo)} to {money(c.costOfIndexPerDay.hi)}
            </b>
            <span>
              What the traffic index costs a day in value at day ahead prices (average {money(c.costOfIndexPerDay.mean)}
              ).
            </span>
          </div>
          <div>
            <b>under {pct(c.overloadDayRate.oursUpper95)}</b>
            <span>
              {c.overloadDayRate.oursDays} of {c.days} days over the limit with the guard. At 95 percent confidence the
              true rate of overload days is below this. More days would tighten it.
            </span>
          </div>
          <div>
            <b>
              {pct(c.overloadDayRate.planOnce.lo)} to {pct(c.overloadDayRate.planOnce.hi)}
            </b>
            <span>
              Overload days when the plan is made once and never adjusted ({c.overloadDayRate.planOnce.days} of {c.days}
              ), 95 percent range. Follows price only: {pct(c.overloadDayRate.priceOnly.lo)} to{' '}
              {pct(c.overloadDayRate.priceOnly.hi)}.
            </span>
          </div>
        </div>
      </section>

      <section className="evidence" aria-labelledby="ev2-h">
        <p className="eyebrow">I · Utility events</p>
        <h2 id="ev2-h">If the utility calls in the jam, is the energy there?</h2>
        <p className="sub">
          Assumed event: full power for {lab.events.hours} hours ({lab.events.requestMWh} MWh) starting at each day's
          busiest traffic hour. We measure what the Station could deliver from the energy it held at that moment, under
          each plan as it actually ran. Real Wattsmart events are rarer and set by the utility; this is a readiness
          test.
        </p>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Average share delivered</th>
                <th>Days fully ready</th>
                <th>Worst day</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(lab.events.byStrategy).map(([k, v]) => (
                <tr key={k} className={k === (lab.events.reserve ? 'oursWithReserve' : 'ours') ? 'best' : ''}>
                  <th scope="row">{NAMES[k] ?? k}</th>
                  <td>{Math.round(v.meanReadyPct)}%</td>
                  <td>
                    {v.fullDays} of {lab.days}
                  </td>
                  <td>{Math.round(v.worstPct)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {lab.events.reserve && (
          <ul className="notes">
            <li>
              The reserve: the busiest hour is on the day ahead forecast, so the planner is told to hold{' '}
              {lab.events.reserve.reserveMWh.toFixed(1)} MWh at the start of it (enough for the full request after
              losses), and replans every hour as before.
            </li>
            <li>
              What it costs on ordinary days: value falls from ${Math.round(lab.events.reserve.valuePerDay.ours)} to $
              {Math.round(lab.events.reserve.valuePerDay.oursWithReserve)} a day, because some energy waits instead of
              selling at the best price. Jam relief goes from {lab.events.reserve.jamReliefMWh.ours.toFixed(1)} to{' '}
              {lab.events.reserve.jamReliefMWh.oursWithReserve.toFixed(1)} MWh a day, since the held energy is there for
              the jam. Days over the limit: {lab.events.reserve.overloadDays.ours} without,{' '}
              {lab.events.reserve.overloadDays.oursWithReserve} with.
            </li>
          </ul>
        )}
      </section>

      <section className="evidence" aria-labelledby="fr-h">
        <p className="eyebrow">J · Margin versus guard</p>
        <h2 id="fr-h">Could a bigger safety margin replace the guard?</h2>
        <p className="sub">
          Instead of reacting to the meter, plan as if load will run above the forecast by a margin taken from the last
          14 days of forecast misses, at higher and higher percentiles. Same days, same battery, graded on real demand.
        </p>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>What runs</th>
                <th>Average margin</th>
                <th>Days over the limit</th>
                <th>Total over</th>
                <th>Jam relief a day</th>
                <th>Value a day</th>
              </tr>
            </thead>
            <tbody>
              {lab.frontier.map(r => (
                <tr key={r.label} className={r.guard ? 'best' : ''}>
                  <th scope="row">{r.label}</th>
                  <td>{f1(r.meanMarginMW)} MW</td>
                  <td>
                    {r.daysOver} of {lab.days}
                  </td>
                  <td>{f1(r.totalOverMWh)} MWh</td>
                  <td>{f1(r.jamReliefMWh)} MWh</td>
                  <td>{money(r.valuePerDay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="notes">
          <li>
            {zeroMargin
              ? `A margin reaches zero overload days only at ${zeroMargin.label.replace('margin at the ', 'the ')}, costing ${money(guardRow.valuePerDay - zeroMargin.valuePerDay)} a day more than the guard.`
              : `No margin we tried reaches zero overload days; the widest still fails on ${Math.min(...margins.map(r => r.daysOver))} days.`}{' '}
            The guard: {guardRow.daysOver} days over at {money(guardRow.valuePerDay)} a day.
          </li>
        </ul>
      </section>

      <section className="honest" aria-labelledby="next-h">
        <h2 id="next-h">Not done yet</h2>
        <ul className="notes">
          <li>One real feeder: its load trace, its rating and a real Station's limits. That is the validation step.</li>
          <li>Settings changed together, not one at a time (section E).</li>
          <li>Battery aging from cycle depth and temperature instead of a flat cost per MWh.</li>
          <li>Flywheel response below one second; the data here is 100 ms GPU power averaged to 1 s.</li>
          <li>
            Where to run: other regions' grid traffic and clean power, the other half of the bounty's second question.
          </li>
        </ul>
      </section>
      <footer>
        Lab data generated {new Date(lab.generatedAt).toLocaleString('en-US', { timeZone: 'America/Denver' })}.
      </footer>
    </main>
  );
}
