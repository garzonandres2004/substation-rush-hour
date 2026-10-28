import raw from '../../public/data/lab.json';
import SecondsLab from './SecondsLab';
import SweepLab from './SweepLab';
import FlexLab from './FlexLab';
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
  priceOnlyWithGuard: 'Price plus the guard',
  priceOnly: 'Follows price only',
  fiveLineRule: 'Five line rule',
};

export default function Lab() {
  const c = lab.confidence;
  const t = lab.thermal;
  const fx = t.results.fixed;
  const tm = t.results.temperature;
  const guardRow = lab.frontier.find(r => r.guard)!;
  const margins = lab.frontier.filter(r => !r.guard);
  const zeroMargin = margins.find(r => r.daysOver === 0);
  return (
    <main className="page">
      <header className="top">
        <div>
          <p className="eyebrow">Work in progress · separate from the main page</p>
          <h1>The lab</h1>
          <p className="lede">
            Deeper checks with more real, open data: a full year walked forward on issued weather forecasts, capacity
            over a full year, and real GPU power from AI training jobs. Every number is labeled measured, modeled or
            assumed.
          </p>
        </div>
        <p className="meta">
          <a href="/">Back to the main page</a>
        </p>
      </header>

      <YearLab />
      <SecondsLab />
      <SweepLab />
      <FlexLab />

      <section className="evidence" aria-labelledby="conf-h">
        <p className="eyebrow">D · On the main page's 30 days: confidence</p>
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
        <p className="eyebrow">E · Utility events</p>
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
                <tr key={k} className={k === 'ours' ? 'best' : ''}>
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
      </section>

      <section className="evidence" aria-labelledby="fr-h">
        <p className="eyebrow">F · Margin versus guard</p>
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

      <section className="evidence" aria-labelledby="th-h">
        <p className="eyebrow">G · Transformer heat</p>
        <h2 id="th-h">A limit set by temperature, not a fixed MW number</h2>
        <p className="sub">
          A transformer's real limit is how hot its windings get. We model it with the IEEE C57.91 method: nameplate{' '}
          {f1(t.nameplateMW)} MW (the fixed rating from the capacity test) gives a 110 C hot spot at 30 C air. Salt Lake
          City air on these days ran {f1(t.ambientC.min)} to {f1(t.ambientC.max)} C, so the hourly rating ran{' '}
          {f1(t.ratingMW.min)} to {f1(t.ratingMW.max)} MW. Transformer parameters are assumed typical values, not a real
          substation.
        </p>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Limit</th>
                <th>New load, no storage</th>
                <th>New load, 10 MW, 4 h Station</th>
                <th>New load, five line rule</th>
                <th>Hottest hot spot with the Station</th>
                <th>Insulation aging with the Station</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['Fixed rating', fx],
                  ['Temperature based rating', tm],
                ] as [string, LimitResult][]
              ).map(([name, r]) => (
                <tr key={name} className={name.startsWith('Temperature') ? 'best' : ''}>
                  <th scope="row">{name}</th>
                  <td>{r.withoutStorageMW} MW</td>
                  <td>{r.stationMW} MW</td>
                  <td>{r.fiveLineRuleMW} MW</td>
                  <td>{f1(r.heatAtStationMax.maxHotSpotC)} C</td>
                  <td>
                    {f1(r.heatAtStationMax.agingDays)} days in {r.heatAtStationMax.calendarDays}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="notes">
          <li>
            Aging is equivalent days of insulation life used: 1 day per calendar day at a steady 110 C hot spot. Below 1
            means the transformer aged slower than its design rate.
          </li>
          <li>
            The rating depends on the warmest busy hour, not the average. Autumn air averaged {f1(t.ambientC.mean)} C,
            so the average hourly rating was {f1(t.ratingMW.mean)} MW, but the tightest hour of the warmest days dropped
            it to {f1(t.ratingAtTightestHourMW.min)} MW. Without storage that costs room; with the Station, the planner
            uses the cool hours.
          </li>
          <li>
            The planner here knew each hour's real temperature. Day ahead temperature forecasts are usually within a few
            degrees, but that error is not modeled yet. The hourly rating is steady state, which ignores the oil's heat
            inertia, so it is conservative.
          </li>
        </ul>
      </section>

      <section className="honest" aria-labelledby="next-h">
        <h2 id="next-h">Not done yet</h2>
        <ul className="notes">
          <li>
            Weather forecasts as they were issued (Open-Meteo archive), to remove the observed weather upper bound.
          </li>
          <li>Summer with the heat model, and a full year walk forward test including winter peaks.</li>
          <li>Battery aging from cycle depth and temperature instead of a flat cost per MWh.</li>
        </ul>
      </section>
      <footer>
        Lab data generated {new Date(lab.generatedAt).toLocaleString('en-US', { timeZone: 'America/Denver' })}.
      </footer>
    </main>
  );
}
