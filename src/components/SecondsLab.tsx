import secRaw from '../../public/data/lab-seconds.json';

interface Row {
  overSeconds: number;
  overMWh: number;
  maxExcessMW: number;
  batteryExtraMWh: number;
  flywheelMaxMW: number;
}
interface Case {
  daysWithSecondsOver: number;
  worstDays: { date: string; seconds: number }[];
  hourly: Row;
  hourlyMinuteView: Row;
  battery: Row & { batteryChangesPerBusyDay: number };
  hourlyBatteryChangesPerBusyDay: number;
  station3MinuteView: Row;
  sweep: {
    spinMW: number;
    spinMWh: number;
    withBatteryBackup: Row;
    batteryChangesPerBusyDay: number;
    flywheelAlone: Row;
    flywheelCyclesPerBusyDay: number;
  }[];
  shape: {
    secondStepP95OfAvg: number;
    secondStepMaxOfAvg: number;
    secondStepMaxMW: number;
    withinMinuteRangeP50OfAvg: number;
    withinMinuteRangeP95OfAvg: number;
  };
}
interface Sec {
  days: number;
  first: string;
  last: string;
  ratingMW: number;
  newLoadMW: number;
  siteFullPowerMW: number;
  station: string;
  spinMinutes: number;
  jobs: number;
  jobSeconds: number;
  models: string[];
  fleetJobs: number;
  sync: Case;
  fleet: Case;
}
const sec = secRaw as unknown as Sec;

const n0 = (x: number) => Math.round(x).toLocaleString('en-US');
const f2 = (x: number) => x.toFixed(2);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const time = (s: number) =>
  s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`;
const shortDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const longDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

// Smallest flywheel that leaves no second over the rating on its own (no battery help).
const smallestAlone = (c: Case) => c.sweep.find(r => r.flywheelAlone.overSeconds === 0);
// Smallest flywheel after which the battery holds its hourly plan (as few power changes as the plan).
const smallestCalm = (c: Case) =>
  c.sweep.find(
    r => r.withBatteryBackup.overSeconds === 0 && r.batteryChangesPerBusyDay <= c.hourlyBatteryChangesPerBusyDay + 0.5,
  );

export default function SecondsLab() {
  const S = sec.sync;
  const F = sec.fleet;
  const sAlone = smallestAlone(S);
  const fAlone = smallestAlone(F);
  const sCalm = smallestCalm(S);
  const S3 = S.sweep.find(r => r.spinMW === 3);
  const cell = (r: Row) =>
    r.overSeconds === 0
      ? '0'
      : r.overSeconds < 60
        ? `${r.overSeconds} s`
        : `${n0(r.overSeconds)} s (${time(r.overSeconds)})`;
  return (
    <section className="inside" aria-labelledby="sec-h">
      <p className="eyebrow">D · Second by second, real AI training power</p>
      <h2 id="sec-h">
        At 1 second, on real GPU power, the hourly plan leaves {time(S.hourly.overSeconds)} over the rating in a year.
        The flywheel it takes is bigger than the minute model said.
      </h2>
      <p className="sub">
        The year capacity case above: a substation rated for its own annual peak ({sec.ratingMW} MW), {sec.newLoadMW} MW
        of new always on load, a {sec.station} Station planned hour by hour on issued forecasts, {sec.days} days (
        {longDate(sec.first)} to {longDate(sec.last)}). The new load is now real training power from {sec.jobs} MIT
        Supercloud jobs ({sec.models.length} model types, {n0(sec.jobSeconds / 3600)} hours of traces) at 1 second.
        Every hour still averages exactly {sec.newLoadMW} MW, so the hourly plan sees what it always saw; inside the
        hour the load moves the way the real jobs moved, sized to a site whose full power is {sec.siteFullPowerMW} MW
        (real jobs average about 90 percent of their peak). Two sites: one synchronized training run filling the whole
        site, and {sec.fleetJobs} independent jobs sharing it.
      </p>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Seconds over the rating in {sec.days} days</th>
              <th>One synchronized run</th>
              <th>{sec.fleetJobs} independent jobs</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Hourly plan only, seen second by second</th>
              <td>
                {cell(S.hourly)}, on {S.daysWithSecondsOver} days
              </td>
              <td>
                {cell(F.hourly)}, on {F.daysWithSecondsOver} days
              </td>
            </tr>
            <tr>
              <th scope="row">The same, as a minute model sees it</th>
              <td>{cell(S.hourlyMinuteView)}</td>
              <td>{cell(F.hourlyMinuteView)}</td>
            </tr>
            <tr>
              <th scope="row">Battery chases every spike</th>
              <td>
                {cell(S.battery)}, battery power changes {n0(S.battery.batteryChangesPerBusyDay)} times a day
              </td>
              <td>
                {cell(F.battery)}, {n0(F.battery.batteryChangesPerBusyDay)} times a day
              </td>
            </tr>
            {S.sweep.map((r, i) => {
              const fr = F.sweep[i];
              const help = (x: typeof r) =>
                x.flywheelAlone.overSeconds === 0
                  ? `, ${x.flywheelCyclesPerBusyDay.toFixed(1)} cycles a day`
                  : `; with battery help 0, battery moves ${n0(x.batteryChangesPerBusyDay)} times a day`;
              return (
                <tr key={r.spinMW}>
                  <th scope="row">
                    {r.spinMW} MW flywheel ({f2(r.spinMWh)} MWh) on its own
                  </th>
                  <td>
                    {cell(r.flywheelAlone)}
                    {help(r)}
                  </td>
                  <td>
                    {cell(fr.flywheelAlone)}
                    {help(fr)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="notes">
        <li>
          <b>What the minute model missed.</b> Averaged to minutes, the same load shows{' '}
          {time(S.hourlyMinuteView.overSeconds)} over the rating instead of {time(S.hourly.overSeconds)}, and a 3 MW
          flywheel looks like enough ({time(S.station3MinuteView.overSeconds)} left). At 1 second a 3 MW flywheel on its
          own leaves {time(S3?.flywheelAlone.overSeconds ?? 0)}, because the load moves up to{' '}
          {f2(S.shape.secondStepMaxMW)} MW in one second and the worst moment sits {f2(S.hourly.maxExcessMW)} MW over
          the rating.
          {sAlone
            ? ` It takes about ${sAlone.spinMW} MW to cover every second alone.`
            : ` No size up to ${S.sweep.at(-1)?.spinMW} MW covers every second alone: part of it is not a swing but minutes of load above the hour's average, an energy job, and that part needs the battery.`}{' '}
          Typical swing inside a minute: {pct(S.shape.withinMinuteRangeP50OfAvg)} of the new load,{' '}
          {pct(S.shape.withinMinuteRangeP95OfAvg)} in the busiest 5 percent.
        </li>
        <li>
          <b>The battery can do it, at a cost.</b> Chasing every spike, the battery changes power{' '}
          {n0(S.battery.batteryChangesPerBusyDay)} times a day instead of about {n0(S.hourlyBatteryChangesPerBusyDay)}{' '}
          for its plan.
          {sCalm
            ? ` With a ${sCalm.spinMW} MW flywheel in front, it is back to its plan: about ${n0(sCalm.batteryChangesPerBusyDay)} changes a day.`
            : ''}{' '}
          That is the split Torus sells: Spin for fast power, Pulse for hours.
        </li>
        <li>
          <b>Many jobs smooth out, one big run does not.</b> {sec.fleetJobs} independent jobs leave{' '}
          {time(F.hourly.overSeconds)} over the rating
          {fAlone ? ` and need only a ${fAlone.spinMW} MW flywheel` : ''}; one synchronized run leaves{' '}
          {time(S.hourly.overSeconds)}
          {sAlone ? ` and needs ${sAlone.spinMW} MW` : ''}. Plan for the synchronized case.
        </li>
        <li>
          <b>Most days need nothing.</b> Rated for its annual peak, the substation only gets close on summer peak days:
          seconds over the rating happen on {S.daysWithSecondsOver} of {sec.days} days, the worst{' '}
          {S.worstDays
            .slice(0, 3)
            .map(d => shortDate(d.date))
            .join(', ')}
          . Every count per day in this section is an average over those days.
        </li>
        <li>
          Limits: these are small academic jobs (median 2 GPUs) scaled to a {sec.newLoadMW} MW site and stitched into a
          year from random stretches of at most 2 hours; the flywheel is modeled from Torus's published claims (
          {sec.spinMinutes} minute discharge, 90% round trip) and assumed to respond within the second. The traces are
          used inside the run and never saved; only these totals are (license CC BY-NC-ND 4.0).
        </li>
      </ul>
    </section>
  );
}
