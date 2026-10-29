import gpuRaw from '../../lab-data/gpu-stats.json';
import capRaw from '../../public/data/lab-capacity-year.json';
import yearRaw from '../../public/data/lab-year.json';

interface Strat {
  daysMadeWorse: number;
  addedOverMWh: number;
  daysOver: number;
  substationDaysFullyCovered: number;
  totalOverMWh: number;
  jamReliefMWh: number;
  valuePerDay: number | null;
}
interface Summary {
  days: number;
  first: string;
  last: string;
  substationOverDays: number;
  substationOverMWh: number;
  mapePct: { oursIssuedWeather: number; eiaDayAhead: number };
  maxMissMW: number;
  guardHoursPerDay: number;
  daysOursEndedBelowHalf: number;
  physicalChecksPass: boolean;
  byStrategy: Record<string, Strat>;
}
interface Year {
  method: string;
  priced: Summary;
  trafficOnly: Summary;
  byMonth: (Summary & { month: string })[];
}
interface CapRes {
  mw: number;
  bindingDays: { date: string; mw: number }[];
  winterMW: number;
  springMW: number;
  summerMW: number;
  autumnMW: number;
  medianDayMW: number;
}
interface Cap {
  days: number;
  first: string;
  last: string;
  pricedDays: number;
  peakDay: string;
  withoutStorage: CapRes;
  stations: { label: string; ours: CapRes; rule: CapRes; capacityMode?: CapRes; ruleFull?: CapRes }[];
}
interface Gpu {
  jobs: number;
  models: string[];
  gpusMedian: number;
  minutesMedian: number;
  acrossJobsMedian: Record<string, number>;
  acrossJobsP90: Record<string, number>;
  fleetIndependentJobs: Record<string, { medianMaxMinuteStepOfPeak: number; p90: number }>;
}
const year = yearRaw as unknown as Year;
const cap = capRaw as unknown as Cap;
const gpu = gpuRaw as unknown as Gpu;

const f1 = (x: number) => x.toFixed(1);
const mwCap = (x: number) => (x >= 23.75 ? '24+ MW' : `${x} MW`); // 24 MW is the search ceiling
const pct = (x: number) => `${Math.round(x * 100)}%`;
const money = (x: number) => `${x < 0 ? '-' : ''}$${Math.abs(Math.round(x)).toLocaleString('en-US')}`;
const shortDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
const monthName = (m: string) =>
  new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const STRATS: [string, string][] = [
  ['ours', 'Stays out of traffic, replans hourly, real time guard (ours)'],
  ['priceWithGuard', 'Price plus the same guard'],
  ['fiveLineRule', 'Five line rule'],
  ['replanNoGuard', 'Replans hourly, no guard'],
  ['planOnce', 'Plans once the night before'],
  ['priceOnly', 'Follows price only'],
];

// Simulated load at the time of the main page, measured the same way as the real jobs.
const SIM = { share30: 0.36, maxStep: 0.65, minuteStepP95: 0.46, period: '1 to 7 minutes' };

export default function YearLab() {
  const P = year.priced;
  const W = year.trafficOnly;
  const totalDays = P.days + W.days;
  const subOver = P.substationOverDays + W.substationOverDays;
  const covered = P.byStrategy.ours.substationDaysFullyCovered + W.byStrategy.ours.substationDaysFullyCovered;
  const main = cap.stations.find(s => s.label === '10 MW, 4 h')!;
  // Capacity mode when the data has it, else the everyday planner (older runs).
  const best = (s: (typeof cap.stations)[number]) => s.capacityMode ?? s.ours;
  const g = gpu.acrossJobsMedian;
  const peakPerAvg = 1 / g.meanOfPeak;
  const dcAvg = 5.75;
  const swingP95MW = (dcAvg * peakPerAvg * g.withinMinuteRangeP95) / 2;
  const swingP50MW = (dcAvg * peakPerAvg * g.withinMinuteRangeP50) / 2;
  const kWhPerSwing = (swingP95MW * 1000 * (g.repeatPeriodS / 2)) / 3600;
  const fleet = gpu.fleetIndependentJobs;
  const table = (s: Summary, priced: boolean) => (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>What runs</th>
            <th>Days it pushed the substation over</th>
            <th>Substation over days fully covered</th>
            <th>Energy over the limit</th>
            <th>Jam relief a day</th>
            {priced && <th>Value a day</th>}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">No storage</th>
            <td>none</td>
            <td>0 of {s.substationOverDays}</td>
            <td>{Math.round(s.substationOverMWh).toLocaleString('en-US')} MWh</td>
            <td>0 MWh</td>
            {priced && <td>$0</td>}
          </tr>
          {STRATS.filter(([k]) => s.byStrategy[k]).map(([k, name]) => {
            const v = s.byStrategy[k];
            return (
              <tr key={k} className={k === 'ours' ? 'best' : ''}>
                <th scope="row">{name}</th>
                <td>
                  {v.daysMadeWorse} of {s.days}
                </td>
                <td>
                  {v.substationDaysFullyCovered} of {s.substationOverDays}
                </td>
                <td>{Math.round(v.totalOverMWh).toLocaleString('en-US')} MWh</td>
                <td>{f1(v.jamReliefMWh)} MWh</td>
                {priced && <td>{v.valuePerDay === null ? 'n/a' : money(v.valuePerDay)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
  return (
    <>
      <section className="evidence" aria-labelledby="yr-h">
        <p className="eyebrow">A · {totalDays} days, real forecasts, battery carried day to day</p>
        <h2 id="yr-h">
          A year of real days: our plan never pushed the substation over its limit, and covered {covered} of the{' '}
          {subOver} days it was over on its own.
        </h2>
        <p className="sub">
          {shortDate(W.first)} to {shortDate(P.last)}. Each night the plan is built only from data available then, on
          the Salt Lake City weather forecast issued the day before (Open-Meteo previous runs), and graded on real
          PacifiCorp East demand. The battery's charge carries into the next day. Main page settings, nothing tuned. The
          limit is the 95th percentile of the last 30 days, so when load climbs into a new season the substation itself
          runs over it: those are the days below marked "over on its own".
        </p>
        <h3>May to October, with CAISO day ahead prices ({P.days} days)</h3>
        {table(P, true)}
        <h3 style={{ marginTop: 26 }}>
          November to April, before day ahead prices existed: traffic only ({W.days} days)
        </h3>
        <p className="sub">
          PacifiCorp joined CAISO's day ahead market in 2026, so earlier days have no day ahead price. Here every plan
          uses grid traffic alone, with the no price weights the main page already tests. Value is not scored.
        </p>
        {table(W, false)}
        <ul className="notes">
          <li>
            <b>Forecast, honestly:</b> on the weather forecast as issued, our demand forecast missed by{' '}
            {f1(P.mapePct.oursIssuedWeather)} percent on average from May to October, against{' '}
            {f1(P.mapePct.eiaDayAhead)} for EIA's own day ahead forecast;
            {` ${f1(W.mapePct.oursIssuedWeather)} against ${f1(W.mapePct.eiaDayAhead)}`} in winter and spring. This
            replaces the main page's observed weather upper bound.
          </li>
          <li>
            The guard acted {f1(P.guardHoursPerDay)} hours a day in summer and {f1(W.guardHoursPerDay)} in winter. On{' '}
            {P.daysOursEndedBelowHalf + W.daysOursEndedBelowHalf} days it spent the reserve holding the limit and ended
            the day below half charge; the next day starts from there. Every physical check passed: power, stored
            energy, energy balance.
          </li>
          <li>
            Uncovered days are a 10 MW, 4 h Station meeting load that grew past a limit set by last month. Ours covers
            more of them than the five line rule in both seasons ({P.byStrategy.ours.substationDaysFullyCovered} vs{' '}
            {P.byStrategy.fiveLineRule.substationDaysFullyCovered} in summer,{' '}
            {W.byStrategy.ours.substationDaysFullyCovered} vs {W.byStrategy.fiveLineRule.substationDaysFullyCovered} in
            winter). Price plus the same guard covers about as many in summer (
            {P.byStrategy.priceWithGuard.substationDaysFullyCovered}) but moves less energy out of the jam (
            {f1(P.byStrategy.priceWithGuard.jamReliefMWh)} vs {f1(P.byStrategy.ours.jamReliefMWh)} MWh a day).
          </li>
        </ul>
        <details>
          <summary>Month by month</summary>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Days</th>
                  <th>Substation over on its own</th>
                  <th>Our plan pushed it over</th>
                  <th>Covered by ours</th>
                  <th>Forecast miss, ours</th>
                  <th>Forecast miss, EIA</th>
                </tr>
              </thead>
              <tbody>
                {year.byMonth
                  .filter(m => m.days >= 5)
                  .map(m => (
                    <tr key={m.month}>
                      <th scope="row">{monthName(m.month)}</th>
                      <td>{m.days}</td>
                      <td>{m.substationOverDays}</td>
                      <td>{m.byStrategy.ours?.daysMadeWorse ?? 'n/a'}</td>
                      <td>{m.byStrategy.ours?.substationDaysFullyCovered ?? 'n/a'}</td>
                      <td>{f1(m.mapePct.oursIssuedWeather)}%</td>
                      <td>{f1(m.mapePct.eiaDayAhead)}%</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="capacity" aria-labelledby="yc-h">
        <p className="eyebrow">B · Capacity over a full year</p>
        <h2 id="yc-h">
          Rated for its own annual peak, the substation has {cap.withoutStorage.mw} MW of room. With a 10 MW, 4 h
          Station: {best(main).mw} MW, every day of the year.
        </h2>
        <p className="sub">
          The interconnection question over {cap.days} days ({shortDate(cap.first)} to {shortDate(cap.last)}). One fixed
          scale for the year: 100 MW is the highest demand hour ({shortDate(cap.peakDay)}), and the rating is exactly
          100 MW. We add a constant block of new load to every hour and find the largest one that never goes over on any
          day, planned on issued weather forecasts
          {main.capacityMode
            ? ', with the Station in capacity mode (on days at risk it holds a reserve and shaves exactly what is over)'
            : ''}
          .
        </p>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Station</th>
                {main.capacityMode && <th>Capacity mode</th>}
                <th>Everyday planner</th>
                <th>Five line rule</th>
                {main.ruleFull && <th>Rule, recharging to full</th>}
                <th>Winter</th>
                <th>Spring</th>
                <th>Summer</th>
                <th>Autumn</th>
                <th>Days that bind</th>
              </tr>
            </thead>
            <tbody>
              {cap.stations.map(s => (
                <tr key={s.label} className={s.label === '10 MW, 4 h' ? 'best' : ''}>
                  <th scope="row">{s.label}</th>
                  {main.capacityMode && <td>{best(s).mw} MW</td>}
                  <td>{s.ours.mw} MW</td>
                  <td>{s.rule.mw} MW</td>
                  {main.ruleFull && <td>{s.ruleFull?.mw} MW</td>}
                  <td>{mwCap(best(s).winterMW)}</td>
                  <td>{mwCap(best(s).springMW)}</td>
                  <td>{mwCap(best(s).summerMW)}</td>
                  <td>{mwCap(best(s).autumnMW)}</td>
                  <td>
                    {best(s)
                      .bindingDays.slice(0, 3)
                      .map(b => shortDate(b.date).replace(/, \d{4}/, ''))
                      .join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="notes">
          <li>
            The season columns show how much new load each season alone would allow: the year is set by its hardest
            days. On a median day the 10 MW, 4 h Station could carry {mwCap(best(main).medianDayMW)}; 24 MW is where the
            search stops.
          </li>
          <li>
            The substation is PacifiCorp East's demand shape scaled to 100 MW; real feeder ratings are not public.
          </li>
        </ul>
      </section>

      <section className="inside" aria-labelledby="gpu-h">
        <p className="eyebrow">C · Real AI training power</p>
        <h2 id="gpu-h">
          Real GPU training power swings every {g.repeatPeriodS} seconds. Our simulation had the size right and the
          speed wrong.
        </h2>
        <p className="sub">
          {gpu.jobs} labelled training jobs from the MIT Supercloud Dataset ({gpu.models.length} model types, from
          ResNet and VGG to U-Nets and graph networks), GPU power measured by nvidia-smi every 100 ms. We publish
          summary statistics only; the traces stay with MIT (license CC BY-NC-ND 4.0). Median job: {gpu.gpusMedian}{' '}
          GPUs, {Math.round(gpu.minutesMedian)} minutes.
        </p>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Share of peak power</th>
                <th>Real jobs (median job)</th>
                <th>Our simulated load (main page)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">How often power repeats its swing</th>
                <td>every {g.repeatPeriodS} seconds</td>
                <td>every {SIM.period}</td>
              </tr>
              <tr>
                <th scope="row">Minutes with a swing of 30 percent of peak or more</th>
                <td>{pct(g.shareMinutesSwing30pct)}</td>
                <td>{pct(SIM.share30)}</td>
              </tr>
              <tr>
                <th scope="row">Largest one second step</th>
                <td>{pct(g.secondStepMax)}</td>
                <td>not modeled (1 minute steps)</td>
              </tr>
              <tr>
                <th scope="row">Swing inside a minute, typical and 95th percentile</th>
                <td>
                  {pct(g.withinMinuteRangeP50)} and {pct(g.withinMinuteRangeP95)}
                </td>
                <td>not modeled</td>
              </tr>
              <tr>
                <th scope="row">Change of the minute average, 95th percentile</th>
                <td>{pct(g.minuteStepP95)}</td>
                <td>{pct(SIM.minuteStepP95)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <ul className="notes">
          <li>
            <b>What it changes:</b> real swings are as large as we simulated and just as frequent in minutes, but they
            happen in seconds. A battery chasing them would reverse direction about{' '}
            {Math.round(2 * (86400 / g.repeatPeriodS)).toLocaleString('en-US')} times a day. That is the flywheel's job,
            and it is a power job, not an energy job.
          </li>
          <li>
            <b>Sizing, as an estimate:</b> for a {dcAvg} MW synchronized training load shaped like these jobs, holding
            grid draw flat inside the minute takes about {f1(swingP50MW)} MW of fast power in a typical minute and{' '}
            {f1(swingP95MW)} MW in the busiest 5 percent of minutes, with only about {f1(kWhPerSwing)} kWh moved per
            swing. Section D below replays it second by second: fast swings take a few MW of flywheel, and minutes long
            stretches above the hour's average still need the battery.
          </li>
          <li>
            <b>Many jobs smooth out, one big job does not.</b> Adding independent jobs at random times, the largest
            minute step falls from {pct(fleet['1'].medianMaxMinuteStepOfPeak)} of peak for one job to{' '}
            {pct(fleet['48'].medianMaxMinuteStepOfPeak)} for 48. One large training run spread over thousands of GPUs
            moves them together, so it swings like a single job. That is the AI data center case.
          </li>
          <li>
            Limits: these are small academic jobs (median {gpu.gpusMedian} GPUs). The sizing above scales their measured
            shape to a {dcAvg} MW site and assumes the whole site is synchronized; it is labeled an estimate.
          </li>
        </ul>
      </section>
    </>
  );
}
