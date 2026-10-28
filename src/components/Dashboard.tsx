'use client';
import { useEffect, useMemo, useState } from 'react';
import { report, hourLabel, rangeLabel, dateLabel, stressColor, stressWord } from '../lib/report';
import { directions, jamRanges, type Strategy } from '../lib/directions';
import { LoadChart, BatteryChart } from './Charts';
import { explanationFor, stepKey, explainedBy } from '../lib/explain';
import { MinuteChart } from './MinuteChart';
import stationRaw from '../../public/data/station.json';

type ScenarioKey = 'normal' | 'derate';
type Mode = 'hourly' | 'battery' | 'station';
interface MinuteTotals {
  overloadMinutes: number;
  overloadMWh: number;
  maxExcessMW: number;
  max15ExcessMW: number;
  maxRampMWPerMin: number;
  batteryChanges: number;
  batteryExtraMWh: number;
  flywheelThroughputMWh: number;
}
interface StationData {
  days: number;
  dataCenterMW: number;
  mainSpinMW: number;
  spinMinutes: number;
  maxDataCenterRampMWPerMin: number;
  batteryBackupMinutes: number;
  limitTypicalMW: number;
  wearCostPerMWh: number;
  totals: Record<Mode, MinuteTotals>;
  perDay: Record<Mode, { batteryChanges: number; flywheelCycles: number }>;
  sweep: {
    spinMW: number;
    overloadMinutesFlywheelAlone: number;
    batteryChangesPerDay: number;
    flywheelCyclesPerDay: number;
  }[];
  example: { date: string; startHour: number; capMW: number; hourly: number[]; station: number[] };
}
const station = stationRaw as unknown as StationData;
const SOURCES: [string, string][] = [
  [
    'Torus Spin flywheel: 10C, 6 minute full discharge, 25,000 cycles (company claims), torus.co',
    'https://torus.co/torus-flywheel',
  ],
  ['Torus Pulse battery: LFP, 0.5C, 7,500 cycles (company claims), torus.co', 'https://torus.co/torus-nova-pulse'],
  [
    'Torus approved for Rocky Mountain Power Wattsmart commercial batteries (Torus release, March 2025)',
    'https://torus.co/news/torus-receives-commercial-energy-storage-approval-for-rocky-mountain-power-s-watt',
  ],
  [
    '4 to 8 hour Pulse duration, from Torus 2024 launch coverage, ESS News',
    'https://www.ess-news.com/2024/11/26/torus-unveils-flywheel-battery-energy-storage-ai-driven-cybersecurity-solutions',
  ],
  [
    'Battery round trip efficiency 85 percent, NREL ATB 2024',
    'https://atb.nrel.gov/electricity/2024/utility-scale_battery_storage',
  ],
  ['US battery fleet round trip efficiency 82 percent, EIA', 'https://www.eia.gov/todayinenergy/detail.php?id=46756'],
  ['Day ahead prices, CAISO OASIS', 'https://oasis.caiso.com'],
  ['Demand, solar, wind and fuel mix, EIA Open Data', 'https://www.eia.gov/opendata/'],
  ['Weather, Open-Meteo', 'https://open-meteo.com'],
  ['CO2 per kWh by fuel, EIA', 'https://www.eia.gov/tools/faqs/faq.php?id=74'],
];
const f1 = (x: number) => x.toFixed(1);
const int = (x: number) => Math.round(x).toLocaleString('en-US');
const money = (x: number) => `${x < 0 ? '-' : ''}$${Math.abs(Math.round(x)).toLocaleString('en-US')}`;
const ord = (n: number) => {
  const v = n % 100;
  return n + (v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'));
};
const pctl = (x: number) => ord(Math.round(x * 100));
const co2 = (t: number) =>
  Math.abs(t) < 0.05 ? 'no change' : `${Math.abs(t).toFixed(1)} t CO2 ${t < 0 ? 'avoided' : 'added'}`;
const of100 = (s: number) => Math.round(s * 100);
const NAV: [string, string][] = [
  ['route-h', 'Tomorrow'],
  ['ev-h', 'Overloads'],
  ['cap-h', 'Capacity'],
  ['in-h', 'Inside the hour'],
  ['tor-h', 'Torus fit'],
  ['hn-h', 'Real vs modeled'],
];
const shortDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export default function Dashboard() {
  const [scenario, setScenario] = useState<ScenarioKey>('normal');
  const [strategy, setStrategy] = useState<Strategy>('aware');
  const [hover, setHover] = useState<number | null>(null);
  const [newLoad, setNewLoad] = useState(5);
  const [active, setActive] = useState('route-h');

  // Highlight the section in view in the sticky nav.
  useEffect(() => {
    const heads = NAV.map(([id]) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    const onScroll = () => {
      let current = NAV[0][0];
      for (const el of heads) if (el.getBoundingClientRect().top < 220) current = el.id;
      setActive(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const sc = report.scenarios[scenario];
  const jam = report.params.congestedThreshold;
  const card =
    strategy === 'aware'
      ? sc.scorecards.stressAware
      : strategy === 'priceOnly'
        ? sc.scorecards.priceOnly
        : sc.scorecards.clean;
  const jams = jamRanges(sc);
  const steps = useMemo(() => directions(sc, strategy, jam), [sc, strategy, jam]);
  const peakHour = sc.hours.reduce((a, b) => (b.stress > a.stress ? b : a)).hourLocal;
  const worstHour = sc.hours.reduce((a, b) => (b.loadBefore - sc.capMW > a.loadBefore - sc.capMW ? b : a)).hourLocal;
  const defaultHour = scenario === 'derate' ? worstHour : peakHour;
  const shown = sc.hours[hover ?? defaultHour];
  const slot = shown[strategy];
  const bt = report.backtest.summary;
  const none = sc.scorecards.none;
  const cap = report.capacity;
  const mv = cap.limits.moving,
    fx = cap.limits.fixed;
  const main = mv.stations.find(
    x => x.powerMW === report.params.asset.powerMW && x.energyMWh === report.params.asset.energyMWh,
  )!;
  const mainFx = fx.stations.find(x => x.label === main.label)!;
  const summer = report.summer;
  const summerMain = summer?.ratedForSummerPeak.stations.find(x => x.label === main.label);
  const capMax = Math.max(mv.withoutStorageMW, ...mv.stations.map(x => x.awareMW));
  const smallest = (lim: typeof mv) =>
    [...lim.stations]
      .sort((a, b) => a.energyMWh - b.energyMWh || a.powerMW - b.powerMW)
      .find(x => x.awareMW >= newLoad);

  // On phones the charts scroll sideways; start them near midday where the action is.
  useEffect(() => {
    if (window.innerWidth > 560) return;
    document.querySelectorAll<HTMLElement>('.scroll').forEach(el => {
      el.scrollLeft = el.scrollWidth * 0.38;
    });
  }, [scenario]);

  const headline =
    scenario === 'normal'
      ? jams.length
        ? `The grid jams ${jams.map(([a, b]) => rangeLabel(a, b)).join(' and ')} tomorrow.`
        : 'No jam hours tomorrow.'
      : `With capacity cut 10 percent, load tops the limit for ${none.overloadHoursBefore} hours.`;

  const row = (key: string, name: string, tag?: string) => ({
    key,
    name,
    tag,
    net: key === 'none' ? 0 : bt.meanNetValuePerDay[key],
    days: key === 'none' ? 0 : bt.daysCausingOverload[key],
    total: key === 'none' ? 0 : bt.totalOverloadMWh[key],
    relief: key === 'none' ? 0 : bt.meanCongestedEnergyRelievedMWh[key],
  });
  const backtestRows = [
    row('awareV1', 'Plans once, never adjusts', 'first version'),
    row('awareReplan', "Replans every hour from the forecast and last hour's miss"),
    row('awareReplanMargin', 'Same, plus a safety margin'),
    row('stressAware', 'Replans every hour plus a real time guard on the meter', 'ours'),
    row('priceLimit', 'Same guard, no traffic index (price plus the limit)'),
    row('peakShaver', 'Five line rule: discharge what is over the limit, recharge at night'),
    row('priceOnly', 'Follows price only, ignores the limit'),
    row('clean', 'Stays clean (CO2 signal, same guard)'),
  ];
  const shownOver = card.overloadAfterMWh > 0.05 || none.overloadBeforeMWh > 0.05;

  return (
    <main className="page">
      <header className="top">
        <div>
          <h1>Substation Rush Hour</h1>
          <p className="lede">
            Tomorrow's traffic on the PacifiCorp East grid, and a Torus style Station that keeps a substation out of it.
          </p>
        </div>
        <div className="meta">
          <p className="live">
            <i aria-hidden="true" />
            Live data, refreshed daily
          </p>
          <p>
            <a href="/history">Today, tomorrow and past days</a>
          </p>
          <p>
            Forecast for {dateLabel(report.date)}
            <span className="hide-sm">, the latest day with published day ahead prices</span>
            <br />
            PacifiCorp East (Utah, Wyoming, Idaho)
            <br />
            <span className="updated">
              Updated{' '}
              {new Date(report.generatedAt).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                timeZone: 'America/Denver',
                timeZoneName: 'short',
              })}
            </span>
          </p>
        </div>
      </header>

      <nav className="secnav" aria-label="Sections">
        {NAV.map(([id, label]) => (
          <a key={id} href={`#${id}`} className={active === id ? 'on' : ''}>
            {label}
          </a>
        ))}
      </nav>

      <section className="summary" aria-label="Key findings">
        <a href="#cap-h">
          <em>Capacity unlocked</em>
          <b>
            <span className="was">{mv.withoutStorageMW}</span>
            <span className="arrow" aria-hidden="true">
              →
            </span>
            <span className="sr"> to </span>
            <span className="now">{main.awareMW}</span> MW
          </b>
          <span>
            of new always on load this substation can take: without storage, then with a {main.label} Station. Tested on{' '}
            {cap.days} real days{summerMain ? `; ${summerMain.awareMW} MW in July and August` : ''}.
          </span>
        </a>
        <a href="#ev-h">
          <em>Overload days, graded on real demand</em>
          <b>
            <span className="was">{bt.daysCausingOverload.awareV1}</span>
            <span className="arrow" aria-hidden="true">
              →
            </span>
            <span className="sr"> to </span>
            <span className="now">{bt.daysCausingOverload.stressAware}</span> days
          </b>
          <span>
            of {bt.days} that our own charging pushed the substation over its limit: planning alone, then with a real
            time guard on the meter.
          </span>
        </a>
        <a href="#in-h">
          <em>Inside the hour</em>
          <b>
            <span className="was">{int(station.totals.hourly.overloadMinutes)}</span>
            <span className="arrow" aria-hidden="true">
              →
            </span>
            <span className="sr"> to </span>
            <span className="now">{int(station.totals.station.overloadMinutes)}</span> minutes
          </b>
          <span>
            above the planning limit that an hourly plan cannot see, then with a {station.mainSpinMW} MW flywheel plus
            the battery.
          </span>
        </a>
      </section>
      <p className="key">MW is how hard power flows right now. MWh is how much energy moves or is stored.</p>

      <section className="controls" aria-label="Scenario and strategy">
        <div className="seg" role="group" aria-label="Scenario">
          <button type="button" className={scenario === 'normal' ? 'on' : ''} onClick={() => setScenario('normal')}>
            Normal day
          </button>
          <button type="button" className={scenario === 'derate' ? 'on' : ''} onClick={() => setScenario('derate')}>
            Capacity cut 10%
          </button>
        </div>
        <div className="seg" role="group" aria-label="Strategy">
          <button type="button" className={strategy === 'aware' ? 'on' : ''} onClick={() => setStrategy('aware')}>
            Stays out of traffic
          </button>
          <button
            type="button"
            className={strategy === 'priceOnly' ? 'on' : ''}
            onClick={() => setStrategy('priceOnly')}
          >
            Follows price only
          </button>
          <button type="button" className={strategy === 'clean' ? 'on' : ''} onClick={() => setStrategy('clean')}>
            Stays clean
          </button>
        </div>
      </section>

      <section className="route" aria-labelledby="route-h">
        <h2 id="route-h">{headline}</h2>
        {scenario === 'derate' && (
          <p className="sub">
            {sc.description}. The limit falls to {f1(sc.capMW)} MW. The grid traffic strip is unchanged because the
            derate affects this substation only.
          </p>
        )}
        <h3 className="striptitle">Utah grid traffic, tomorrow</h3>
        <div className="road-wrap">
          <div className="jams" aria-hidden="true">
            {jams.map(([a, b]) => (
              <span key={a} style={{ left: `${(a / 24) * 100}%`, width: `${((b - a + 1) / 24) * 100}%` }}>
                Jam {rangeLabel(a, b)}
              </span>
            ))}
          </div>
          <div className="road">
            {sc.hours.map(h => (
              <button
                type="button"
                key={h.hourLocal}
                className={`cell${hover === h.hourLocal ? ' hot' : ''}`}
                style={{ background: stressColor(h.stress) }}
                onMouseEnter={() => setHover(h.hourLocal)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(h.hourLocal)}
                onClick={() => setHover(h.hourLocal)}
                aria-label={`${hourLabel(h.hourLocal)}: ${stressWord(h.stress, jam)}, traffic ${of100(h.stress)} of 100`}
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
        <div className="legend">
          <span>
            <i style={{ background: stressColor(0.38) }} /> Free flowing
          </span>
          <span>
            <i style={{ background: stressColor(0.55) }} /> Slowing
          </span>
          <span>
            <i style={{ background: stressColor(0.7) }} /> Jam, {of100(jam)} of 100 or more
          </span>
        </div>
        <p className="formula">
          Traffic index, 0 to 100 = {Math.round(report.params.stressWeights.demand * 100)}% demand +{' '}
          {Math.round(report.params.stressWeights.netLoad * 100)}% net load (demand minus solar and wind) +{' '}
          {Math.round(report.params.stressWeights.ramp * 100)}% evening ramp +{' '}
          {Math.round(report.params.stressWeights.price * 100)}% day ahead price, each scored as a percentile of the
          last 30 days. Jam at {of100(jam)} or more. The weights were set before any test was run; changing them barely
          moves the results (see How sure are we).
        </p>
        <p className="readout">
          {hourLabel(shown.hourLocal)}: {stressWord(shown.stress, jam).toLowerCase()}, traffic {of100(shown.stress)} of
          100. Battery{' '}
          {slot.charge > 0.05
            ? `charging ${f1(slot.charge)} MWh`
            : slot.discharge > 0.05
              ? `discharging ${f1(slot.discharge)} MWh`
              : 'holding'}
          .
        </p>
      </section>

      <section className="grid">
        <div className="charts">
          <h3>This substation</h3>
          <p className="sub">
            Dotted: load without the battery. Blue: with it. Red: above the limit. Pink band: Utah grid jam hours. The
            battery charges in cheap free flowing hours, but never above the limit.
          </p>
          <div className="scroll">
            <LoadChart sc={sc} strategy={strategy} hover={hover} setHover={setHover} />
          </div>
          <h3>Battery</h3>
          <p className="sub">Blue bars charge, violet bars discharge. Dashed line: energy stored, right axis.</p>
          <div className="scroll">
            <BatteryChart sc={sc} strategy={strategy} hover={hover} setHover={setHover} />
          </div>
        </div>

        <aside className="side">
          <div className="detail" aria-live="polite">
            <h3>{hourLabel(shown.hourLocal)}</h3>
            <dl>
              <dt>Grid traffic</dt>
              <dd
                title={`Built from demand ${pctl(shown.comps.demand)}, net load ${pctl(shown.comps.netLoad)}, ramp ${pctl(shown.comps.ramp)} and price ${pctl(shown.comps.price)} percentile of the last 30 days`}
              >
                {stressWord(shown.stress, jam)}, {of100(shown.stress)} of 100
              </dd>
              <dt>Price</dt>
              <dd>${shown.lmp.toFixed(0)} per MWh, day ahead</dd>
              <dt>Load</dt>
              <dd>
                {f1(shown.loadBefore)} MW without the battery, {f1(slot.loadAfter)} MW with it, tomorrow's limit{' '}
                {f1(sc.capMW)} MW
              </dd>
              <dt>Battery</dt>
              <dd>
                {slot.charge > 0.05
                  ? `Charging ${f1(slot.charge)} MWh`
                  : slot.discharge > 0.05
                    ? `Discharging ${f1(slot.discharge)} MWh`
                    : 'Holding'}
                , {f1(slot.soc)} MWh stored
              </dd>
            </dl>
          </div>
          <div className="steps">
            <h3>Turn by turn for the battery</h3>
            <p className="sub">
              {steps.some(s => explanationFor(stepKey(scenario, strategy, s.kind, s.start, s.end), s.title, s.body))
                ? explainedBy
                : 'Each step shows the numbers behind the decision. Plain English explanations are written and checked for the demo day only.'}
            </p>
            {steps.length === 0 && <p className="sub">The battery holds all day.</p>}
            <ol>
              {steps.map(s => (
                <li
                  key={s.start}
                  className={`${s.kind}${hover !== null && hover >= s.start && hover <= s.end ? ' hot' : ''}`}
                  onMouseEnter={() => setHover(s.start)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setHover(s.start)}
                >
                  <strong>{s.title}</strong>
                  {(() => {
                    const why = explanationFor(stepKey(scenario, strategy, s.kind, s.start, s.end), s.title, s.body);
                    return why ? (
                      <>
                        <span className="why">{why}</span>
                        <span className="facts">{s.body}</span>
                      </>
                    ) : (
                      <span>{s.body}</span>
                    );
                  })()}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </section>

      <section className="result" aria-labelledby="res-h">
        <h2 id="res-h">What this plan does tomorrow</h2>
        <div className="figures">
          {shownOver ? (
            <div>
              <b>
                {f1(none.overloadBeforeMWh)} to {f1(card.overloadAfterMWh)} MWh
              </b>
              <span>
                Energy above the limit, without and with the battery.
                {card.overloadAfterMWh > none.overloadBeforeMWh + 0.05
                  ? ' This plan makes it worse: it charges while the substation is already near its limit.'
                  : ''}{' '}
                Modeled for this day.
              </span>
            </div>
          ) : (
            <div>
              <b>{f1(card.congestedEnergyRelievedMWh)} MWh</b>
              <span>
                Energy taken off the grid during jam hours, net of charging then.{' '}
                {card.congestedEnergyRelievedMWh < 0 ? 'Negative means it adds load in the jam. ' : ''}
                {card.peakAfterMW > card.peakBeforeMW + 0.05 && card.peakAfterMW <= sc.capMW + 0.05
                  ? `The day's highest load rises from ${f1(card.peakBeforeMW)} to ${f1(card.peakAfterMW)} MW because it charges at midday, still within the ${f1(sc.capMW)} MW limit.`
                  : ''}
              </span>
            </div>
          )}
          <div>
            <b>{money(card.netValue)}</b>
            <span>
              Value at day ahead prices after wear. We use price as a signal of grid stress, not as a revenue pitch.
              {card.netValue < 0
                ? ' Negative here because holding the limit means discharging in cheap hours and recharging later at higher prices.'
                : ''}
            </span>
          </div>
          <div>
            <b>{co2(card.co2T)}</b>
            <span>
              Estimated change in grid emissions, from each hour's average fuel mix. Read it as a direction.
              {card.co2T > 0.05
                ? ' It adds CO2 here because holding the limit means discharging at midday, when the grid is cleanest, and recharging at night.'
                : ''}
            </span>
          </div>
          <div>
            <b>
              {of100(card.avgStressWhenCharging)} vs {of100(card.avgStressWhenDischarging)}
            </b>
            <span>
              Average grid traffic, out of 100, when the battery charges vs when it discharges. Charging in lighter
              traffic is the point.
            </span>
          </div>
        </div>
      </section>

      <section className="evidence" aria-labelledby="ev-h">
        <p className="eyebrow">Finding 1 · graded on what actually happened</p>
        <h2 id="ev-h">
          Planning alone let our own charging overload the substation on {bt.daysCausingOverload.awareV1} of {bt.days}{' '}
          real days. A real time guard fixed all of them.
        </h2>
        <p className="sub">
          {shortDate(bt.firstDay)} to {shortDate(bt.lastDay)}. Each day is planned the night before from the forecast,
          then run hour by hour against the demand that really showed up. Without any battery this substation never
          crossed its limit in these weeks, so every overload below is caused by charging. Prices are real CAISO day
          ahead prices.
        </p>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>What runs</th>
                <th>Days over the limit</th>
                <th>Total over</th>
                <th>Jam relief per day</th>
                <th>Value per day</th>
              </tr>
            </thead>
            <tbody>
              {backtestRows.map(r => (
                <tr key={r.key} className={r.key === 'stressAware' ? 'best' : ''}>
                  <th scope="row">
                    {r.name}
                    {r.tag && <em className="tag">{r.tag}</em>}
                  </th>
                  <td>
                    {r.days} of {bt.days}
                  </td>
                  <td>{f1(r.total)} MWh</td>
                  <td>{f1(r.relief)} MWh</td>
                  <td>{money(r.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="notes">
          <li>
            Planning cannot hold the limit by itself: the demand forecast missed by up to {f1(bt.maxForecastMissMW)} MW
            in a single hour. Replanning from last hour's miss halves the overload, a safety margin costs{' '}
            {money(bt.meanNetValuePerDay.awareV1 - bt.meanNetValuePerDay.awareReplanMargin)} a day and still fails on{' '}
            {bt.daysCausingOverload.awareReplanMargin} days. The guard, reacting to the meter, holds it every day for{' '}
            {money(bt.meanNetValuePerDay.awareV1 - bt.meanNetValuePerDay.stressAware)} a day.
          </li>
          <li>
            What the traffic index buys: with the same guard, price alone relieves{' '}
            {f1(bt.meanCongestedEnergyRelievedMWh.priceLimit)} MWh a day in jam hours. Ours relieves{' '}
            {f1(bt.meanCongestedEnergyRelievedMWh.stressAware)} MWh, for{' '}
            {money(bt.meanNetValuePerDay.priceLimit - bt.meanNetValuePerDay.stressAware)} a day less.
          </li>
          <li>
            Price, traffic and carbon pull apart. Stays clean avoids the most CO2, about{' '}
            {Math.abs(bt.meanCo2TPerDay.clean).toFixed(1)} t a day, but adds load in jam hours, because the cleanest
            hours to charge, late afternoon solar, run into the evening rush.
          </li>
        </ul>
        {bt.robust && (
          <div className="robust">
            <h3 id="sure-h">How sure are we</h3>
            <div className="rcols">
              <div>
                <h4>On a real forecast</h4>
                <p>
                  Planned on EIA's own day ahead demand forecast instead of ours (no observed weather): plan once
                  overloads on {bt.robust.eiaForecast.v1.daysOver} of {bt.robust.eiaForecast.v1.days} days, replanning
                  alone on {bt.robust.eiaForecast.replan.daysOver},{' '}
                  <b>replanning plus the guard on {bt.robust.eiaForecast.guard.daysOver}</b>, at{' '}
                  {money(bt.robust.eiaForecast.guard.valuePerDay)} a day.
                </p>
              </div>
              <div>
                <h4>Stress premium</h4>
                <table className="mini">
                  <thead>
                    <tr>
                      <th>Premium</th>
                      <th>Days over</th>
                      <th>Jam relief a day</th>
                      <th>Value a day</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bt.robust.premium.map(x => (
                      <tr key={x.premium} className={x.premium === report.params.stressPremium ? 'best' : ''}>
                        <td>${x.premium}</td>
                        <td>{x.daysOver}</td>
                        <td>{f1(x.jamReliefMWh)} MWh</td>
                        <td>{money(x.valuePerDay)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p>
                  {bt.robust.premium.every(x => x.daysOver === 0) ? 'The guard holds the limit at every premium. ' : ''}
                  The premium only decides how much jam relief to buy: {f1(bt.robust.premium[0].jamReliefMWh)} MWh a day
                  at $0, {f1(bt.robust.premium[1].jamReliefMWh)} MWh at $5.
                </p>
              </div>
              <div>
                <h4>Traffic index weights</h4>
                <table className="mini">
                  <thead>
                    <tr>
                      <th>Weights</th>
                      <th>Days over</th>
                      <th>Jam relief a day</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bt.robust.weights.map(x => (
                      <tr key={x.name} className={x.name === 'ours' ? 'best' : ''}>
                        <td>
                          {x.name} (
                          {[x.w.demand, x.w.netLoad, x.w.ramp, x.w.price].map(v => Math.round(v * 100)).join(', ')})
                        </td>
                        <td>{x.daysOver}</td>
                        <td>{f1(x.jamReliefMWh)} MWh</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p>
                  Other weightings give {f1(Math.min(...bt.robust.weights.map(x => x.jamReliefMWh)))} to{' '}
                  {f1(Math.max(...bt.robust.weights.map(x => x.jamReliefMWh)))} MWh a day of jam relief, with{' '}
                  {Math.max(...bt.robust.weights.map(x => x.daysOver))} days over at most. Jam hours are always counted
                  with our definition.
                </p>
              </div>
            </div>
          </div>
        )}
        <details>
          <summary>More notes on this test</summary>
          <ul className="notes">
            <li>
              Our demand forecast is off by {bt.demandForecastMapePct.ours.toFixed(1)} percent on average against{' '}
              {bt.demandForecastMapePct.eiaDayAhead.toFixed(1)} percent for EIA's own day ahead forecast. Not a fair
              race: ours used the observed weather for each past day, EIA's did not. Treat ours as an upper bound. With
              real weather forecasts its misses, and the overloads above, would be larger.
            </li>
            <li>
              No plan cuts the daily peak on these autumn days. Charging at midday raises it by{' '}
              {Math.abs(bt.meanPeakReductionMW.stressAware).toFixed(1)} MW on average, always inside the limit. The
              relief happens in the jam hours.
            </li>
            <li>
              CO2 is estimated from the EIA hourly fuel mix over {bt.carbonDays} days. Each day starts and ends half
              full; days are not chained.
            </li>
            <li>
              Every plan passed the battery checks: power limits, stored energy bounds, energy balance and ending the
              day where it started.
            </li>
          </ul>
        </details>
      </section>

      <section className="capacity" aria-labelledby="cap-h">
        <p className="eyebrow">Finding 2 · capacity unlocked</p>
        <h2 id="cap-h">
          With a {main.label} Station, this substation can take {main.awareMW} MW of new load. Without it,{' '}
          {mv.withoutStorageMW} MW.
        </h2>
        <p className="sub">
          The question before a new data center connects: how much always on load can this substation add before it
          needs new wires? We added a constant block of load to every hour of {cap.days} real days and raised it in{' '}
          {cap.stepMW} MW steps until the first overload, with the battery replanning hourly and the guard on. Station
          sizes are modeled, not Torus specs.
        </p>
        <div className="bars">
          {[
            { label: 'No storage', mw: mv.withoutStorageMW },
            ...mv.stations.map(x => ({ label: x.label, mw: x.awareMW })),
          ].map(x => (
            <div key={x.label} className={x.label === main.label ? 'bar main' : 'bar'}>
              <span className="bl">{x.label}</span>
              <span className="bt">
                <i style={{ width: `${(x.mw / capMax) * 100}%` }} />
              </span>
              <b>{x.mw} MW</b>
            </div>
          ))}
        </div>
        <div className="sizer">
          <label htmlFor="nl">
            A new load of <b>{newLoad} MW</b> needs
          </label>
          <input
            id="nl"
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={newLoad}
            onChange={e => setNewLoad(+e.target.value)}
          />
          <p>
            {(() => {
              const s = smallest(mv);
              return s
                ? `at least a ${s.label} Station (of the sizes we tested), with ${s.energyMWh} MWh stored.`
                : 'more than the largest Station we tested.';
            })()} With a fixed rating instead of a moving one: {(() => {
              const s = smallest(fx);
              return s ? `a ${s.label} Station.` : 'more than we tested.';
            })()}
          </p>
        </div>
        <ul className="notes">
          <li>
            Most of the room comes from the Station itself. A five line rule that only discharges what is over the limit
            gets {main.shaverMW} MW with the same {main.label} Station; our planner gets {main.awareMW} MW, and also
            earns value and relieves the grid jam the rest of the day.
          </li>
          <li>
            Stored energy matters most here. Doubling from 40 to 80 MWh gets{' '}
            {mv.stations.find(x => x.label === '10 MW, 8 h')!.awareMW} MW by adding hours, or{' '}
            {mv.stations.find(x => x.label === '20 MW, 4 h')!.awareMW} MW by adding power. This substation's crunch is a
            long afternoon plateau, not a short spike.
          </li>
          <li>
            The limit here moves with the last 30 days of load, so the substation starts nearly full by design. With one
            fixed rating ({f1(cap.fixedLimitMW)} MW, the 95th percentile of the month before the test):{' '}
            {fx.withoutStorageMW} MW without storage, {mainFx.awareMW} MW with the {main.label} Station. Real feeder
            ratings are not public. Zero overload here means within {cap.toleranceMWh} MWh a day.
          </li>
        </ul>
        {summer && summerMain && (
          <div className="season">
            <h3>Summer, the season that sets ratings</h3>
            <p className="sub">
              {summer.days} days, {shortDate(summer.firstDay)} to {shortDate(summer.lastDay)}, with the substation rated
              for its summer peak ({f1(summer.summerPeakMW)} MW on the same scale), so it has no room at all without
              storage. Planned on EIA's own day ahead demand forecast ({summer.forecastMapePct.toFixed(1)} percent
              error, a real forecast), with forecast load as the traffic signal. Same hourly replanning and guard.
            </p>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Station</th>
                    <th>New load, our planner</th>
                    <th>New load, five line rule</th>
                  </tr>
                </thead>
                <tbody>
                  {summer.ratedForSummerPeak.stations.map(x => (
                    <tr key={x.label} className={x.label === main.label ? 'best' : ''}>
                      <th scope="row">{x.label}</th>
                      <td>{x.awareMW} MW</td>
                      <td>{x.shaverMW} MW</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="notes">
              <li>
                In summer the planner matters more: {summerMain.awareMW} MW against {summerMain.shaverMW} MW for the
                simple rule with the same {main.label} Station.
              </li>
              <li>
                A substation rated only for autumn load ({f1(summer.autumnRating.capMW)} MW) would go over on{' '}
                {summer.autumnRating.none.daysOver} of {summer.days} summer days. One {main.label} Station cuts that to{' '}
                {summer.autumnRating.withMain.daysOver} days: storage adds room, it does not replace a rating sized for
                summer.
              </li>
            </ul>
          </div>
        )}
      </section>

      <section className="inside" aria-labelledby="in-h">
        <p className="eyebrow">Finding 3 · inside the hour</p>
        <h2 id="in-h">
          Inside the hour: a {station.mainSpinMW} MW flywheel takes the fast swings so the battery does not have to.
        </h2>
        <p className="sub">
          The {station.dataCenterMW} MW data center from above, simulated minute by minute the way AI training load is
          described: compute bursts, sync dips and checkpoint drops, swinging up to{' '}
          {f1(station.maxDataCenterRampMWPerMin)} MW in a minute (Torus's CEO calls it an EKG). Each hour still averages{' '}
          {station.dataCenterMW} MW, so the hourly plan cannot see the swings. All {station.days} days replayed minute
          by minute. Substation load is real hourly data, held flat inside each hour.
        </p>
        <h3>Two hours on {shortDate(station.example.date)}</h3>
        <p className="sub">
          Load in MW, minute by minute. Red stripes: minutes the hourly plan alone crosses that day's{' '}
          {f1(station.example.capMW)} MW limit.
        </p>
        <div className="scroll">
          <MinuteChart
            start={station.example.startHour}
            cap={station.example.capMW}
            hourly={station.example.hourly}
            station={station.example.station}
          />
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Who covers the fast swings</th>
                <th>Battery power changes a day</th>
                <th>Minutes above the limit</th>
                <th>Highest 15 minute average above the limit</th>
                <th>Extra battery throughput</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['hourly', 'Nobody: hourly plan only'],
                  ['battery', 'The battery chases every spike'],
                  [
                    'station',
                    `Station: ${station.mainSpinMW} MW, ${station.spinMinutes} minute flywheel plus the battery`,
                  ],
                ] as [Mode, string][]
              ).map(([k, name]) => {
                const t = station.totals[k];
                return (
                  <tr key={k} className={k === 'station' ? 'best' : ''}>
                    <th scope="row">{name}</th>
                    <td>{int(station.perDay[k].batteryChanges)}</td>
                    <td>{int(t.overloadMinutes)}</td>
                    <td>{t.max15ExcessMW > 0.005 ? `${t.max15ExcessMW.toFixed(2)} MW` : 'none'}</td>
                    <td>{t.batteryExtraMWh > 0.05 ? `${f1(t.batteryExtraMWh / station.days)} MWh a day` : 'none'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ul className="notes">
          <li>
            Small but constant: the worst single minute is {station.totals.hourly.maxExcessMW.toFixed(1)} MW over the
            day's limit, which averages about {Math.round(station.limitTypicalMW)} MW across these days (
            {((100 * station.totals.hourly.maxExcessMW) / station.limitTypicalMW).toFixed(0)} percent). Equipment rides
            out short excursions like this. What matters is who absorbs a {f1(station.maxDataCenterRampMWPerMin)} MW a
            minute swing, every few minutes, all day.
          </li>
          <li>
            The battery can do it alone, but it changes power {int(station.perDay.battery.batteryChanges)} times a day
            instead of {int(station.perDay.hourly.batteryChanges)}, and moves{' '}
            {f1(station.totals.battery.batteryExtraMWh / station.days)} MWh more a day (about{' '}
            {money((station.totals.battery.batteryExtraMWh / station.days) * station.wearCostPerMWh)} of wear at our
            assumed cost). On wear dollars alone the flywheel case is small. The case is the split of jobs: a{' '}
            {station.spinMinutes} minute flywheel for fast power, the battery for hours, which is how a Torus Station is
            built.
          </li>
          <li>
            Sizing the flywheel on its own:{' '}
            {station.sweep
              .filter(r => [2, 3, 4].includes(r.spinMW))
              .map(r => `${r.spinMW} MW leaves ${int(r.overloadMinutesFlywheelAlone)} minutes`)
              .join(', ')}
            . Six minutes cannot outlast a long compute burst, so the battery covers {int(station.batteryBackupMinutes)}{' '}
            minutes in {station.days} days. At {station.perDay.station.flywheelCycles.toFixed(1)} equivalent full cycles
            a day (partial cycles counted as fractions), that is our convention, not a life estimate. We do not model
            battery wear chemistry or flywheel standby losses, and this model cannot resolve sub second response.
          </li>
        </ul>
      </section>

      <section className="torus" aria-labelledby="tor-h">
        <p className="eyebrow">Where it fits</p>
        <h2 id="tor-h">How this would run on a Torus Station</h2>
        <p className="sub">
          Our concept of where it fits. There is no Torus integration and no Torus data in this project.
        </p>
        <ol className="flow">
          <li>
            <b>Before a sale</b> The capacity scan finds the feeder's crunch and sizes the Station, MW and hours, for a
            new load. Value in capacity added without new wires, not in hardware price.
          </li>
          <li>
            <b>The night before</b> Tomorrow's hourly plan: charge in free flowing hours, keep energy for the jam. A
            schedule a dispatch layer like Lasso could take in.
          </li>
          <li>
            <b>Every hour</b> Replan from the latest meter reading. The guard holds the limit when the forecast is
            wrong.
          </li>
          <li>
            <b>Inside the hour</b> Spin takes the fast swings, Pulse holds the plan and steps in when Spin runs out.
          </li>
          <li>
            <b>In a utility program</b> Under Wattsmart the utility dispatches the fleet. Jam hours in this report are
            candidate event windows, and the plan keeps energy ready for them.
          </li>
          <li>
            <b>To pilot it</b> One feeder's rating and 15 minute load, real Station specs, and a sandbox to send
            schedules to.
          </li>
        </ol>
      </section>

      <section className="honest" aria-labelledby="hn-h">
        <h2 id="hn-h">What is real and what is modeled</h2>
        <div className="cols">
          <div>
            <h3>Real data</h3>
            <ul>
              <li>CAISO day ahead prices for the PacifiCorp East hub.</li>
              <li>EIA hourly demand, solar, wind and fuel mix for PacifiCorp East.</li>
              <li>Open-Meteo weather for Salt Lake City.</li>
            </ul>
          </div>
          <div>
            <h3>Modeled by us</h3>
            <ul>
              <li>
                The substation: PacifiCorp East demand scaled to a 100 MW peak, with a limit at the 95th percentile of
                recent load.
              </li>
              <li>
                Tomorrow's demand, solar and wind forecast, and the grid traffic index (demand, net load, evening ramp,
                price).
              </li>
              <li>
                The plan, solved exactly with dynamic programming: 24 hourly steps, stored energy in 0.25 MWh steps
                between 10 and 95 percent, power within 10 MW, ending the day half full, the limit as a hard rule.
                Replanned hourly, with a real time guard. Code decides. AI only writes the explanations.
              </li>
              <li>
                Why the limit differs between sections: each day's limit is the 95th percentile of its last 30 days of
                load (tomorrow {f1(report.scenarios.normal.capMW)} MW, {f1(report.scenarios.derate.capMW)} MW with the
                10 percent derate). The capacity section also tests one fixed rating ({f1(cap.fixedLimitMW)} MW), and
                summer uses the July peak{summer ? ` (${f1(summer.summerPeakMW)} MW)` : ''}.
              </li>
              <li>Grid CO2 per MWh from the fuel mix and EIA emission rates.</li>
              <li>The minute level Station model, with a simulated data center load.</li>
            </ul>
          </div>
          <div>
            <details>
              <summary>All assumptions and sources</summary>
              <ul>
                {report.assumptions.map(a => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
              <ul className="sources">
                {SOURCES.map(([label, url]) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noreferrer">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </div>
      </section>

      <footer>
        Built solo for the Hard Tech Week Hackathon, Torus bounty, option 1. Data: CAISO OASIS, EIA Open Data,
        Open-Meteo.
      </footer>
    </main>
  );
}
