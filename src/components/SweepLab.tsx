import sweepRaw from '../../public/data/lab-sweep.json';

interface Row {
  id: string;
  group: 'default' | 'weights' | 'premium' | 'station' | 'wear';
  label: string;
  days: number;
  pricedDays: number;
  oursDaysMadeWorse: number;
  substationOverDays: number;
  oursFullyCovered: number;
  priceOnlyDaysMadeWorse: number;
  priceGuardDaysMadeWorse: number;
  jamReliefPerDay: { ours: number; priceGuard: number };
  valuePerDay: { ours: number; priceGuard: number };
}
interface Sweep {
  first: string;
  last: string;
  settings: Row[];
  thresholds: { threshold: number; ours: number; priceGuard: number }[];
}
const sw = sweepRaw as unknown as Sweep;

const f1 = (x: number) => x.toFixed(1);
const longDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
const money = (x: number) => `${x < 0 ? '-' : ''}$${Math.abs(Math.round(x)).toLocaleString('en-US')}`;
const GROUPS: [Row['group'], string][] = [
  ['default', 'Main page settings'],
  ['weights', 'Traffic index weights (demand / net load / ramp / price)'],
  ['premium', 'Stress premium added to price in jam hours'],
  ['station', 'Station size'],
  ['wear', 'Battery wear cost'],
];

export default function SweepLab() {
  const rows = sw.settings;
  const n = rows.length;
  const safe = rows.filter(r => r.oursDaysMadeWorse === 0).length;
  const ahead = rows.filter(r => r.jamReliefPerDay.ours > r.jamReliefPerDay.priceGuard).length;
  const d0 = rows.find(r => r.id === 'default')!;
  const ratios = rows.map(r => r.jamReliefPerDay.ours / Math.max(1e-9, r.jamReliefPerDay.priceGuard));
  const minRatio = Math.min(...ratios);
  const maxRatio = Math.max(...ratios);
  const worstPriceOnly = Math.max(...rows.map(r => r.priceOnlyDaysMadeWorse));
  const bestPriceOnly = Math.min(...rows.map(r => r.priceOnlyDaysMadeWorse));
  const minCov = Math.min(...rows.map(r => r.oursFullyCovered));
  const maxCov = Math.max(...rows.map(r => r.oursFullyCovered));
  return (
    <section className="evidence" aria-labelledby="sw-h">
      <p className="eyebrow">E · Did we tune it to win?</p>
      <h2 id="sw-h">
        {n} different settings, the same full year: our plan pushed the substation over its limit on 0 days in {safe} of{' '}
        {n}, and beat price plus the same guard on jam relief in {ahead} of {n}.
      </h2>
      <p className="sub">
        The year walk forward above, rerun once per setting, changing one thing at a time from the main page defaults:
        the traffic index weights, the stress premium, the Station size and its wear cost. Every run is planned each
        night on the weather forecast as issued, battery charge carried day to day, graded on real demand (
        {longDate(sw.first)} to {longDate(sw.last)}). Jam relief is always measured on the default index's jam hours, so
        no setting can win by redefining what a jam is. Price comparisons use the {d0.pricedDays} days with day ahead
        prices.
      </p>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Setting</th>
              <th>Days our plan made worse</th>
              <th>Substation over days fully covered</th>
              <th>Jam relief a day, ours vs price plus guard</th>
              <th>Value a day, ours vs price plus guard</th>
            </tr>
          </thead>
          <tbody>
            {GROUPS.map(([g, title]) => [
              <tr key={`${g}-h`}>
                <th scope="colgroup" colSpan={5}>
                  {title}
                </th>
              </tr>,
              ...rows
                .filter(r => r.group === g)
                .map(r => (
                  <tr key={r.id}>
                    <th scope="row">{r.label}</th>
                    <td>
                      {r.oursDaysMadeWorse} of {r.days}
                    </td>
                    <td>
                      {r.oursFullyCovered} of {r.substationOverDays}
                    </td>
                    <td>
                      {f1(r.jamReliefPerDay.ours)} vs {f1(r.jamReliefPerDay.priceGuard)} MWh
                    </td>
                    <td>
                      {money(r.valuePerDay.ours)} vs {money(r.valuePerDay.priceGuard)}
                    </td>
                  </tr>
                )),
            ])}
          </tbody>
        </table>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Jam threshold used to measure relief (default 0.65)</th>
              <th>Ours, MWh a day</th>
              <th>Price plus guard, MWh a day</th>
            </tr>
          </thead>
          <tbody>
            {sw.thresholds.map(t => (
              <tr key={t.threshold}>
                <th scope="row">Index {Math.round(t.threshold * 100)} and up</th>
                <td>{f1(t.ours)}</td>
                <td>{f1(t.priceGuard)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="notes">
        <li>
          <b>Safety does not depend on the settings.</b> Our plan made the substation worse on 0 days in every setting,
          because the guard on the meter holds the limit whatever the index says. How many of the substation's own over
          days it fully covers depends mostly on Station size ({minCov} to {maxCov} of {d0.substationOverDays}). A
          battery that follows price only, with no guard, made the substation worse on {bestPriceOnly} to{' '}
          {worstPriceOnly} of the {d0.pricedDays} priced days, depending on Station size and wear cost.
        </li>
        <li>
          <b>The index's advantage is not one lucky setting.</b> Jam relief over price plus the same guard ranges from{' '}
          {f1(minRatio)} to {f1(maxRatio)} times across all {n} settings. The one tie is a premium of $0, which is price
          plus guard by construction: it is the control, not a loss.
        </li>
        <li>
          <b>Smaller than the main page shows.</b> Over the full year the index adds about{' '}
          {Math.round((d0.jamReliefPerDay.ours / d0.jamReliefPerDay.priceGuard - 1) * 100)} percent more jam relief than
          price plus the same guard ({f1(d0.jamReliefPerDay.ours)} vs {f1(d0.jamReliefPerDay.priceGuard)} MWh a day). On
          the main page's 30 autumn days the gap is about 2.6 times. The direction holds; the size depends on the
          season.
        </li>
        <li>
          <b>What it costs.</b> The value column is market value minus wear; the gap to price plus guard is the price of
          staying out of the jam, setting by setting.
        </li>
        <li>
          Limits: one setting changes at a time, not every combination; the substation is PacifiCorp East demand scaled
          to 100 MW with a modeled limit, and Station sizes are modeled, not Torus specs.
        </li>
      </ul>
    </section>
  );
}
