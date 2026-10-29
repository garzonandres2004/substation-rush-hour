import thRaw from '../../public/data/lab-thermal-year.json';

interface Cap {
  yearMW: number;
  bindingDays: { date: string; mw: number }[];
  months: { month: string; mw: number }[];
  medianDayMW: number;
}
interface Limit {
  nameplateMW: number;
  tightestHour: { date: string; hour: number; tempC: number; loadMW: number };
  ratingMW: { min: number; mean: number; max: number };
  tempC: { min: number; max: number };
  hoursFixedRatingAboveHeatLimit: number;
  hours: number;
  forecastRatingMissMW: { maxTooGenerous: number; maxTooStrict: number };
  todayLoadMaxHotSpotC: number;
  todayLoadAgingDays: number;
  puAt: { tempC: number; pu: number }[];
}
interface Th {
  days: number;
  first: string;
  last: string;
  station: string;
  fixed: { none: Cap; ours: Cap };
  heat: { none: Cap; ours: Cap; limit: Limit };
}
const th = thRaw as unknown as Th;

const CEIL = 47.75; // the search stops at 48 MW
const mw = (x: number) => (x >= CEIL ? '48+' : `${x}`);
const f1 = (x: number) => x.toFixed(1);
const longDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
const monthName = (m: string) =>
  new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const hourName = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;

export default function ThermalLab() {
  const L = th.heat.limit;
  const fx = th.fixed;
  const ht = th.heat;
  const winter = ht.ours.months.filter(m => ['11', '12', '01', '02', '03', '04'].includes(m.month.slice(5)));
  const winterFixed = fx.ours.months.filter(m => winter.some(w => w.month === m.month));
  const pu0 = L.puAt.find(x => x.tempC === 0)!.pu;
  const pu23 = L.puAt.find(x => x.tempC === 23)!.pu;
  return (
    <section className="evidence" aria-labelledby="th-h">
      <p className="eyebrow">G · The limit itself: heat, not a fixed number</p>
      <h2 id="th-h">
        Rated by heat instead of one fixed number, the year round answer barely moves ({fx.ours.yearMW} to{' '}
        {ht.ours.yearMW} MW with the Station). But from November to April the heat limit allows{' '}
        {Math.floor(Math.min(...winter.map(m => m.mw)))} MW or more every month, where the fixed rating allows{' '}
        {Math.floor(Math.min(...winterFixed.map(m => m.mw)))} to {Math.floor(Math.max(...winterFixed.map(m => m.mw)))}.
      </h2>
      <p className="sub">
        A transformer's real limit is the temperature of its windings (IEEE C57.91): cold air lets it carry more, hot
        air less. We rerun the year capacity case ({th.days} days with temperature data, {longDate(th.first)} to{' '}
        {longDate(th.last)}) with an hourly heat rating from Salt Lake City air temperature, typical transformer
        parameters, 110 C hot spot limit. Fair comparison: both are sized so today's load just fits. Fixed: 100 MW, the
        year's peak. Heat: a {f1(L.nameplateMW)} MW nameplate, so the tightest hour of the year,{' '}
        {longDate(L.tightestHour.date)} at {hourName(L.tightestHour.hour)} and {f1(L.tightestHour.tempC)} C, sits
        exactly at the limit. The plan sees the rating from the temperature forecast issued the day before; the guard
        and the grading use the temperature that really happened.
      </p>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>New always on load that fits, MW</th>
              <th>Fixed rating, no storage</th>
              <th>Heat rating, no storage</th>
              <th>Fixed rating, {th.station} Station</th>
              <th>Heat rating, {th.station} Station</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">
                <b>Every day of the year</b>
              </th>
              <td>{mw(fx.none.yearMW)}</td>
              <td>{mw(ht.none.yearMW)}</td>
              <td>{mw(fx.ours.yearMW)}</td>
              <td>
                <b>{mw(ht.ours.yearMW)}</b>
              </td>
            </tr>
            {ht.ours.months.map((m, i) => (
              <tr key={m.month}>
                <th scope="row">Every day of {monthName(m.month)}</th>
                <td>{mw(fx.none.months[i].mw)}</td>
                <td>{mw(ht.none.months[i].mw)}</td>
                <td>{mw(fx.ours.months[i].mw)}</td>
                <td>{mw(m.mw)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="notes">
        <li>
          <b>Why the year round answer barely moves.</b> The year's tightest hour is a {f1(L.tightestHour.tempC)} C July
          afternoon, exactly when a heat rating is at its lowest. Always on load has to survive that hour either way, so
          heat adds only {f1(ht.ours.yearMW - fx.ours.yearMW)} MW with the Station.
        </li>
        <li>
          <b>Where the fixed number is wrong.</b> Over the year the heat rating runs from {f1(L.ratingMW.min)} to{' '}
          {f1(L.ratingMW.max)} MW. On {L.hoursFixedRatingAboveHeatLimit} of the hottest hours it is below the fixed 100
          MW: a fixed rating is too generous then and too strict almost every other hour. From November to April this
          substation could take {Math.floor(Math.min(...winter.map(m => m.mw)))} MW or more of new load with the
          Station. That is room for seasonal or flexible connections (section F), not for always on load.
        </li>
        <li>
          <b>Checked against the real guideline.</b> With these typical parameters the heat rating is{' '}
          {Math.round(pu0 * 100)}% of nameplate at 0 C and {Math.round(pu23 * 100)}% at 23 C. Rocky Mountain Power's own
          guideline allows 120% in winter and 105% in summer (Utah PSC docket 17-035-61). Same shape, same size.
        </li>
        <li>
          <b>The guard must read the thermometer.</b> The forecast rating was up to{' '}
          {f1(L.forecastRatingMissMW.maxTooGenerous)} MW too generous in some hours, because the temperature forecast
          missed. So the plan uses the forecast, and the guard uses the measured temperature.
        </li>
        <li>
          <b>Heat today.</b> With today's load and no new load, the hottest the windings get in the full model (with the
          oil's lag) is {f1(L.todayLoadMaxHotSpotC)} C, and the transformer ages {f1(L.todayLoadAgingDays)} days of
          normal life in {th.days} days: sized for its worst hour, it is lightly used the rest of the year.
        </li>
        <li>
          Limits: typical transformer parameters, not a real substation's; one city's air temperature; steady state
          rating for the plan (conservative) and the full model only for the hot spot check; {th.days} of 359 days had
          the temperature data. Search stops at 48 MW.
        </li>
      </ul>
    </section>
  );
}
