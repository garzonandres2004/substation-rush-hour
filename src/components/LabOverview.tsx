import gpuRaw from '../../lab-data/gpu-stats.json';
import capRaw from '../../public/data/lab-capacity-year.json';
import flexRaw from '../../public/data/lab-flex.json';
import fleetRaw from '../../public/data/merge-fleet.json';
import labRaw from '../../public/data/lab.json';
import secRaw from '../../public/data/lab-seconds.json';
import sweepRaw from '../../public/data/lab-sweep.json';
import thRaw from '../../public/data/lab-thermal-year.json';
import yearRaw from '../../public/data/lab-year.json';

// One table at the top of the lab: every test, its result in one line, and whether the main page's
// claim held. Numbers are read from the same files the sections below use.
const year = yearRaw as any;
const cap = capRaw as any;
const gpu = gpuRaw as any;
const sec = secRaw as any;
const sweep = sweepRaw as any;
const flex = flexRaw as any;
const th = thRaw as any;
const lab = labRaw as any;
const fleet = fleetRaw as any;

const f1 = (x: number) => x.toFixed(1);
const time = (s: number) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 60)} min`);

export default function LabOverview() {
  const days = year.priced.days + year.trafficOnly.days;
  const worse = year.priced.byStrategy.ours.daysMadeWorse + year.trafficOnly.byStrategy.ours.daysMadeWorse;
  const station4 = cap.stations.find((s: any) => s.label === '10 MW, 4 h').ours.mw;
  const S = sec.sync;
  const sAlone = S.sweep.find((r: any) => r.flywheelAlone.overSeconds === 0);
  const fAlone = sec.fleet.sweep.find((r: any) => r.flywheelAlone.overSeconds === 0);
  const settings = sweep.settings as any[];
  const safe = settings.filter(r => r.oursDaysMadeWorse === 0).length;
  const ahead = settings.filter(r => r.jamReliefPerDay.ours > r.jamReliefPerDay.priceGuard).length;
  const d0 = settings.find(r => r.id === 'default');
  const flexStation = flex.result[1].byBudget.find((b: any) => b.budgetPct === 0.5);
  const winter = th.heat.ours.months.filter((m: any) =>
    ['11', '12', '01', '02', '03', '04'].includes(m.month.slice(5)),
  );
  const c = lab.confidence;
  const ev = lab.events.byStrategy.ours;
  const guardRow = lab.frontier.find((r: any) => r.guard);
  const zeroMargin = lab.frontier.find((r: any) => !r.guard && r.daysOver === 0);
  const fm = Object.keys(fleet.months);
  const fBig = fleet.months[fm[0]].fleets.length - 1;
  const fSum = (pick: (r: any) => number) => fm.reduce((a, m) => a + pick(fleet.months[m].fleets[fBig]), 0);
  const fSites = fleet.months[fm[0]].fleets[fBig].sites;
  const fleetAlone = fSum(r => r.withFleet.hoursCreatedByFleet);
  const fleetGuard = fSum(r => r.withSiteGuard.hoursCreatedByFleet);
  const fleetBoth = fSum(r => r.tradedAndGuard.hoursCreatedByFleet);
  const fleetBothKept = (100 * fSum(r => r.tradedAndGuard.savedAfterUsd)) / fSum(r => r.tradedAndGuard.savedBeforeUsd);
  const rows: [string, string, string, string, string][] = [
    [
      '#yr-h',
      'A',
      'A full year, planned on forecasts as issued',
      `Our plan made the substation worse on ${worse} of ${days} days.`,
      'Held',
    ],
    [
      '#yc-h',
      'B',
      'New load, all year, rated at the annual peak',
      `${cap.withoutStorage.mw} MW without storage, ${station4} MW with a 10 MW, 4 h Station.`,
      'Held',
    ],
    [
      '#gpu-h',
      'C',
      'Real AI training power (MIT Supercloud)',
      `Swings repeat about every ${gpu.acrossJobsMedian.repeatPeriodS} seconds. Our simulation had the size right and the speed wrong.`,
      'Corrected our model',
    ],
    [
      '#sec-h',
      'D',
      'Inside the hour, second by second',
      `Hourly plan alone: ${time(S.hourly.overSeconds)} over in a year. Independent jobs: a ${fAlone?.spinMW ?? '?'} MW flywheel covers it. One synchronized run: ${sAlone ? `${sAlone.spinMW} MW` : 'flywheel plus battery'}.`,
      'Corrected our claim',
    ],
    [
      '#sw-h',
      'E',
      'Did we tune it to win? 17 settings',
      `0 days made worse in ${safe} of ${settings.length}. Index ahead in ${ahead} of ${settings.length}, about ${f1(d0.jamReliefPerDay.ours / d0.jamReliefPerDay.priceGuard)} times over a year.`,
      'Held, smaller than it looked',
    ],
    [
      '#fx-h',
      'F',
      'Compute that yields to traffic',
      `Pausing ${flexStation.budgetPct}% of yearly energy: ${flexStation.mw} MW with the Station, about ${Math.round(flexStation.pausedHoursPerYear)} hours paused a year.`,
      'New',
    ],
    [
      '#th-h',
      'G',
      'The limit as heat, not a fixed number',
      `Year round ${th.fixed.ours.yearMW} to ${th.heat.ours.yearMW} MW. November to April ${Math.floor(Math.min(...winter.map((m: any) => m.mw)))} MW or more.`,
      'New',
    ],
    [
      '#conf-h',
      'H',
      'How sure can 30 days make us?',
      `The index is ahead of price plus guard in ${Math.round(c.jamReliefMWh.shareOfResamplesOursAhead * 100)}% of resamples.`,
      'Held',
    ],
    [
      '#ev2-h',
      'I',
      'If the utility calls an event in the jam',
      `Our plan had the energy ready on ${ev.fullDays} of ${lab.days} days.`,
      'Held',
    ],
    [
      '#fr-h',
      'J',
      'Could a safety margin replace the guard?',
      zeroMargin
        ? `Only at the widest margin, for $${Math.round(guardRow.valuePerDay - zeroMargin.valuePerDay)} a day more than the guard.`
        : 'No margin we tried reaches zero overload days.',
      'Held',
    ],
    [
      '#fl-h',
      'K',
      'Many customer batteries behind one substation (with DETOUR)',
      `${fSites} businesses each cutting their own bill: ${fleetAlone} new hours over the limit. Guard alone: ${fleetGuard}, at no cost to customers. Room traded by need plus guard: ${fleetBoth}, customers keep ${Math.min(100, fleetBothKept).toFixed(0)}%.`,
      'New, cut but not closed',
    ],
  ];
  return (
    <section className="evidence" aria-labelledby="ov-h">
      <p className="eyebrow">At a glance</p>
      <h2 id="ov-h">Eleven tests on real open data. The safety held in every one, and three changed what we say.</h2>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Test</th>
              <th>Result</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([href, letter, test, result, verdict]) => (
              <tr key={letter}>
                <th scope="row">
                  <a href={href}>
                    {letter} · {test}
                  </a>
                </th>
                <td>{result}</td>
                <td>{verdict}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
