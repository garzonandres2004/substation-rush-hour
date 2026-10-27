'use client';
import { useMemo, useState } from 'react';
import { report, hourLabel, rangeLabel, dateLabel, stressColor, stressWord } from '../lib/report';
import { directions, jamRanges, type Strategy } from '../lib/directions';
import { LoadChart, BatteryChart } from './Charts';
import { explanationFor, stepKey, explainedBy } from '../lib/explain';
import { MinuteChart } from './MinuteChart';
import stationRaw from '../../public/data/station.json';

type ScenarioKey = 'normal' | 'derate';
interface StationData {
  days: number; dataCenterMW: number; mainSpinMW: number; spinMinutes: number; maxDataCenterRampMWPerMin: number; batteryBackupMinutes: number;
  totals: Record<'hourly' | 'battery' | 'station', { overloadMinutes: number; batteryChanges: number }>;
  perDay: Record<'hourly' | 'battery' | 'station', { batteryChanges: number; flywheelCycles: number }>;
  sweep: { spinMW: number; overloadMinutesFlywheelAlone: number; batteryChangesPerDay: number; flywheelCyclesPerDay: number }[];
  example: { date: string; startHour: number; capMW: number; hourly: number[]; station: number[] };
}
const station = stationRaw as unknown as StationData;
const int = (x: number) => Math.round(x).toLocaleString('en-US');
const SOURCES: [string, string][] = [
  ['Torus Nova Pulse (4 to 8 hour battery) and Nova Spin (flywheel), ESS News', 'https://www.ess-news.com/2024/11/26/torus-unveils-flywheel-battery-energy-storage-ai-driven-cybersecurity-solutions'],
  ['Rocky Mountain Power and Torus partnership, DCD', 'https://datacenterdynamics.com/en/news/rocky-mountain-power-and-torus-partner-on-energy-storage-integration-in-utah'],
  ['Battery round trip efficiency 85 percent, NREL ATB 2024', 'https://atb.nrel.gov/electricity/2024/utility-scale_battery_storage'],
  ['US battery fleet round trip efficiency 82 percent, EIA', 'https://www.eia.gov/todayinenergy/detail.php?id=46756'],
  ['Day ahead prices, CAISO OASIS', 'https://oasis.caiso.com'],
  ['Demand, solar and wind, EIA Open Data', 'https://www.eia.gov/opendata/'],
  ['Weather, Open-Meteo', 'https://open-meteo.com'],
  ['CO2 per kWh by fuel, EIA', 'https://www.eia.gov/tools/faqs/faq.php?id=74'],
  ['Torus Spin flywheel: 10C, 6 minute discharge, 25,000 cycles (company claims)', 'https://torus.co/torus-flywheel'],
];
const f1 = (x: number) => x.toFixed(1);
const money = (x: number) => `${x < 0 ? '-' : ''}$${Math.abs(Math.round(x)).toLocaleString('en-US')}`;
const ord = (n: number) => { const v = n % 100; return n + (v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'); };
const pctl = (x: number) => ord(Math.round(x * 100));
const co2 = (t: number) => Math.abs(t) < 0.05 ? 'no change' : `${Math.abs(t).toFixed(1)} t CO2 ${t < 0 ? 'avoided' : 'added'}`;
const signed = (x: number) => `${x < 0 ? '-' : ''}$${Math.abs(x).toFixed(1)}`;
const shortDate = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export default function Dashboard() {
  const [scenario, setScenario] = useState<ScenarioKey>('normal');
  const [strategy, setStrategy] = useState<Strategy>('aware');
  const [hover, setHover] = useState<number | null>(null);
  const sc = report.scenarios[scenario];
  const jam = report.params.congestedThreshold;
  const card = strategy === 'aware' ? sc.scorecards.stressAware : strategy === 'priceOnly' ? sc.scorecards.priceOnly : sc.scorecards.clean;
  const jams = jamRanges(sc);
  const steps = useMemo(() => directions(sc, strategy, jam), [sc, strategy, jam]);
  const peakHour = sc.hours.reduce((a, b) => (b.stress > a.stress ? b : a)).hourLocal;
  const shown = sc.hours[hover ?? peakHour];
  const slot = shown[strategy];
  const bt = report.backtest.summary;
  const none = sc.scorecards.none;

  let headline: string;
  if (scenario === 'normal') {
    headline = jams.length
      ? `The grid jams ${jams.map(([a, b]) => rangeLabel(a, b)).join(' and ')} tomorrow.`
      : 'No jam hours tomorrow.';
  } else {
    headline = `With a transformer out, load tops the limit for ${none.overloadHoursBefore} hours.`;
  }

  const row = (key: string, name: string) => ({ key, name, net: key === 'none' ? 0 : bt.meanNetValuePerDay[key], days: key === 'none' ? 0 : bt.daysCausingOverload[key], total: key === 'none' ? 0 : bt.totalOverloadMWh[key], co2: key === 'none' ? 0 : bt.meanCo2TPerDay[key] });
  const backtestRows = [
    row('none', 'No storage'),
    row('naive', 'Fixed schedule'),
    row('priceOnly', 'Follows price only'),
    row('clean', 'Stays clean'),
    row('awareV1', 'Our first version: plans once, never adjusts'),
    row('stressAware', 'Stays out of traffic: replans every hour'),
  ];
  const cap = report.capacity;
  const capMax = Math.max(cap.withoutStorageMW, ...cap.stations.map(x => x.replanMW));
  const main = cap.stations.find(x => x.powerMW === report.params.asset.powerMW && x.energyMWh === report.params.asset.energyMWh)!;


  return (
    <main className="page">
      <header className="top">
        <div>
          <h1>Substation Rush Hour</h1>
          <p className="lede">Tomorrow's traffic on the Utah grid, and a battery that stays out of it.</p>
        </div>
        <p className="meta">Forecast for {dateLabel(report.date)}<br />Latest day with published day ahead prices<br />PacifiCorp East, Utah</p>
      </header>

      <section className="controls" aria-label="Scenario and strategy">
        <div className="seg" role="group" aria-label="Scenario">
          <button className={scenario === 'normal' ? 'on' : ''} onClick={() => setScenario('normal')}>Normal day</button>
          <button className={scenario === 'derate' ? 'on' : ''} onClick={() => setScenario('derate')}>Transformer out</button>
        </div>
        <div className="seg" role="group" aria-label="Strategy">
          <button className={strategy === 'aware' ? 'on' : ''} onClick={() => setStrategy('aware')}>Stays out of traffic</button>
          <button className={strategy === 'priceOnly' ? 'on' : ''} onClick={() => setStrategy('priceOnly')}>Follows price only</button>
          <button className={strategy === 'clean' ? 'on' : ''} onClick={() => setStrategy('clean')}>Stays clean</button>
        </div>
      </section>

      <section className="route" aria-labelledby="route-h">
        <h2 id="route-h">{headline}</h2>
        {scenario === 'derate' && <p className="sub">{sc.description}. The capacity limit falls to {f1(sc.capMW)} MW. The traffic strip below is unchanged because the outage affects this substation only.</p>}
        <div className="road-wrap">
          <div className="jams" aria-hidden="true">
            {jams.map(([a, b]) => (
              <span key={a} style={{ left: `${(a / 24) * 100}%`, width: `${((b - a + 1) / 24) * 100}%` }}>Jam {rangeLabel(a, b)}</span>
            ))}
          </div>
          <div className="road">
            {sc.hours.map(h => (
              <button
                key={h.hourLocal}
                className={`cell${hover === h.hourLocal ? ' hot' : ''}`}
                style={{ background: stressColor(h.stress) }}
                onMouseEnter={() => setHover(h.hourLocal)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(h.hourLocal)}
                onBlur={() => setHover(null)}
                aria-label={`${hourLabel(h.hourLocal)}: ${stressWord(h.stress, jam)}, traffic index ${h.stress.toFixed(2)}`}
              />
            ))}
          </div>
          <div className="hours" aria-hidden="true">
            {[0, 3, 6, 9, 12, 15, 18, 21].map(h => <span key={h} style={{ left: `${(h / 24) * 100}%` }}>{hourLabel(h)}</span>)}
          </div>
        </div>
        <div className="legend">
          <span><i style={{ background: stressColor(0.38) }} /> Free flowing</span>
          <span><i style={{ background: stressColor(0.55) }} /> Slowing</span>
          <span><i style={{ background: stressColor(0.7) }} /> Jam, index {jam.toFixed(2)} or higher</span>
        </div>
      </section>

      <section className="grid">
        <div className="charts">
          <h3>Substation load</h3>
          <p className="sub">Dotted: without the battery. Blue: with it. Red: above the limit.</p>
          <div className="scroll"><LoadChart sc={sc} strategy={strategy} hover={hover} setHover={setHover} /></div>
          <h3>Battery</h3>
          <p className="sub">Blue bars charge, violet bars discharge, grey area is stored energy.</p>
          <div className="scroll"><BatteryChart sc={sc} strategy={strategy} hover={hover} setHover={setHover} /></div>
        </div>

        <aside className="side">
          <div className="detail" aria-live="polite">
            <h3>{hourLabel(shown.hourLocal)}</h3>
            <dl>
              <dt>Price</dt><dd>${shown.lmp.toFixed(1)} per MWh, congestion part {signed(shown.mcc)}</dd>
              <dt>Traffic index</dt><dd>{shown.stress.toFixed(2)}, {stressWord(shown.stress, jam).toLowerCase()}</dd>
              <dt>Built from</dt><dd>demand {pctl(shown.comps.demand)}, net load {pctl(shown.comps.netLoad)}, ramp {pctl(shown.comps.ramp)}, price {pctl(shown.comps.price)} percentile of the last 30 days</dd>
              <dt>Load</dt><dd>{f1(shown.loadBefore)} MW without the battery, {f1(slot.loadAfter)} MW with it</dd>
              <dt>Battery</dt>
              <dd>{slot.charge > 0.05 ? `Charging ${f1(slot.charge)} MWh` : slot.discharge > 0.05 ? `Discharging ${f1(slot.discharge)} MWh` : 'Holding'}, {f1(slot.soc)} MWh stored</dd>
            </dl>
          </div>
          <div className="steps">
            <h3>Turn by turn for the battery</h3>
            <p className="sub">Each step is explained in plain English. {explainedBy}</p>
            {steps.length === 0 && <p className="sub">The battery holds all day.</p>}
            <ol>
              {steps.map(s => (
                <li key={s.start} className={s.kind} onMouseEnter={() => setHover(s.start)} onMouseLeave={() => setHover(null)}>
                  <strong>{s.title}</strong>
                  {(() => {
                    const why = explanationFor(stepKey(scenario, strategy, s.kind, s.start, s.end), s.title, s.body);
                    return why ? <><span className="why">{why}</span><span className="facts">{s.body}</span></> : <span>{s.body}</span>;
                  })()}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </section>

      <section className="result" aria-labelledby="res-h">
        <h2 id="res-h">What this plan does</h2>
        <div className="figures">
          {none.overloadBeforeMWh > 0.05 ? (
            <div>
              <b>{f1(none.overloadBeforeMWh)} to {f1(card.overloadAfterMWh)} MWh</b>
              <span>Energy above the capacity limit, before and after the battery. Measured in the model for this day.</span>
            </div>
          ) : (
            <div>
              <b>{f1(card.congestedEnergyRelievedMWh)} MWh</b>
              <span>Energy the battery takes off the grid during jam hours, net of what it charges then. {card.congestedEnergyRelievedMWh < 0 ? 'Negative means it adds load in the jam. ' : ''}Measured in the model for this day.{card.peakAfterMW > card.peakBeforeMW + 0.05 ? ` The highest load of the day rises from ${f1(card.peakBeforeMW)} to ${f1(card.peakAfterMW)} MW because the battery charges at midday, still within the ${f1(sc.capMW)} MW limit.` : ''}</span>
            </div>
          )}
          <div>
            <b>{money(card.netValue)}</b>
            <span>Net value at day ahead prices after wear cost. Settlement style value, not a profit forecast.{card.netValue < 0 ? ' Negative here because holding the substation under its limit means discharging in cheap hours and recharging later at higher prices. That cost is the price of reliability.' : ''}</span>
          </div>
          <div>
            <b>{co2(card.co2T)}</b>
            <span>Estimated change in grid emissions from when the battery charges and discharges, using each hour's average Utah fuel mix. Average, not marginal, so read it as a direction.{card.co2T > 0.05 ? " It adds CO2 here because holding the limit means discharging at midday, when the grid is cleanest, and recharging at night, when it is dirtiest." : ''}</span>
          </div>
          <div>
            <b>{card.avgStressWhenCharging.toFixed(2)} charging, {card.avgStressWhenDischarging.toFixed(2)} discharging</b>
            <span>Average traffic index when the battery moves energy. A lower number when charging means it stays out of traffic.</span>
          </div>
        </div>
      </section>

      <section className="capacity" aria-labelledby="cap-h">
        <h2 id="cap-h">With a {main.label} Station, this substation can take {main.replanMW} MW of new load. Without it, {cap.withoutStorageMW} MW.</h2>
        <p className="sub">The question a utility asks before approving a new data center: how much always on load can this substation add before it needs new wires? We added a constant block of load to every hour of {cap.days} real days and raised it until the first overload. Scored on actual demand, with the battery replanning every hour. Station sizes are modeled, not Torus specs.</p>
        <div className="bars">
          {[{ label: 'No storage', mw: cap.withoutStorageMW }, ...cap.stations.map(x => ({ label: x.label, mw: x.replanMW }))].map(x => (
            <div key={x.label} className={x.label === main.label ? 'bar main' : 'bar'}>
              <span className="bl">{x.label}</span>
              <span className="bt"><i style={{ width: `${(x.mw / capMax) * 100}%` }} /></span>
              <b>{x.mw} MW</b>
            </div>
          ))}
        </div>
        <ul className="notes">
          <li>Hours of storage matter more than power here. Going from 4 to 8 hours adds {(cap.stations.find(x => x.label === '10 MW, 8 h')!.replanMW - main.replanMW).toFixed(2)} MW of room. Doubling power to 20 MW adds {(cap.stations.find(x => x.label === '20 MW, 4 h')!.replanMW - main.replanMW).toFixed(2)} MW. This substation's jam is a long afternoon plateau, not a short spike.</li>
          <li>The limit is set at the 95th percentile of recent load, so the substation starts nearly full by design. Real feeder ratings are not public.</li>
        </ul>
      </section>

      <section className="inside" aria-labelledby="in-h">
        <h2 id="in-h">The hourly plan hides {int(station.totals.hourly.overloadMinutes)} minutes over the limit. A {station.mainSpinMW} MW flywheel catches them.</h2>
        <p className="sub">Add the {station.dataCenterMW} MW data center from above, but as an AI load really behaves: compute bursts, sync dips and checkpoint drops, swinging up to {station.maxDataCenterRampMWPerMin.toFixed(1)} MW in a single minute. Each hour still averages {station.dataCenterMW} MW, so the hourly plan sees no problem. We replayed all {station.days} days minute by minute. The data center load is simulated. The substation load is real hourly data.</p>
        <h3>Two hours on {shortDate(station.example.date)}, minute by minute</h3>
        <p className="sub">Grey: hourly plan only, red where it crosses the limit. Blue: Torus style Station, flywheel plus battery. Dashed red: the {station.example.capMW.toFixed(1)} MW limit. Load in MW.</p>
        <div className="scroll"><MinuteChart start={station.example.startHour} cap={station.example.capMW} hourly={station.example.hourly} station={station.example.station} /></div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Who covers the fast swings</th><th>Minutes over the limit, {station.days} days</th><th>Battery power changes per day</th><th>Flywheel full cycles per day</th></tr></thead>
            <tbody>
              <tr><th scope="row">Nobody: hourly plan only</th><td>{int(station.totals.hourly.overloadMinutes)}</td><td>{int(station.perDay.hourly.batteryChanges)}</td><td>none</td></tr>
              <tr><th scope="row">The battery chases every spike</th><td>{int(station.totals.battery.overloadMinutes)}</td><td>{int(station.perDay.battery.batteryChanges)}</td><td>none</td></tr>
              <tr className="best"><th scope="row">Station: {station.mainSpinMW} MW, {station.spinMinutes} minute flywheel plus the battery</th><td>{int(station.totals.station.overloadMinutes)}</td><td>{int(station.perDay.station.batteryChanges)}</td><td>{station.perDay.station.flywheelCycles.toFixed(1)}</td></tr>
            </tbody>
          </table>
        </div>
        <ul className="notes">
          <li>The battery alone can hold the limit, but it has to change power about {int(station.perDay.battery.batteryChanges)} times a day instead of {int(station.perDay.hourly.batteryChanges)}. With the flywheel taking the spikes, the battery stays close to its hourly plan and steps in for only {int(station.batteryBackupMinutes)} minutes in {station.days} days, when the flywheel runs empty.</li>
          <li>Sizing the flywheel on its own: {station.sweep.filter(r => [2, 3, 4].includes(r.spinMW)).map(r => `${r.spinMW} MW still misses ${int(r.overloadMinutesFlywheelAlone)} minutes`).join(', ')}. Six minutes of storage cannot outlast a long compute burst. That is why the Station pairs a flywheel for power with a battery for energy.</li>
          <li>At {station.perDay.station.flywheelCycles.toFixed(1)} full cycles a day, the flywheel would use its 25,000 cycle life in about {(25000 / station.perDay.station.flywheelCycles / 365).toFixed(0)} years (Torus claim). We do not measure battery wear. Torus says the flywheel extends battery life; this shows where the fast work goes, not how much life it saves.</li>
        </ul>
      </section>

      <section className="evidence" aria-labelledby="ev-h">
        <h2 id="ev-h">Tested on {bt.days} past days, against what actually happened</h2>
        <p className="sub">{shortDate(bt.firstDay)} to {shortDate(bt.lastDay)}. Each day is planned the night before from the forecast, then run hour by hour against the demand that really showed up. Prices are real CAISO day ahead prices.</p>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Strategy</th><th>Net value per day</th><th>Days it overloaded the substation</th><th>Total overload</th><th>Grid CO2 per day, estimated</th></tr></thead>
            <tbody>
              {backtestRows.map(r => (
                <tr key={r.key} className={r.key === 'stressAware' ? 'best' : ''}>
                  <th scope="row">{r.name}</th>
                  <td>{money(r.net)}</td>
                  <td>{r.days} of {bt.days}</td>
                  <td>{f1(r.total)} MWh</td>
                  <td>{co2(r.co2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="notes">
          <li>Our first version planned once and never adjusted. On real demand it pushed the substation over its limit on {bt.daysCausingOverload.awareV1} of {bt.days} days, because the demand forecast missed by up to {f1(bt.maxForecastMissMW)} MW in a single hour.</li>
          <li>Replanning every hour with the load measured that hour fixed every one of those days at no cost. We also tested a forecast safety margin instead: it still overloaded on {bt.daysCausingOverload.awareMarginOnly} days and earned {money(bt.meanNetValuePerDay.stressAware - bt.meanNetValuePerDay.awareMarginOnly)} less per day. Reacting beat padding.</li>
          <li>Following price alone earns about {Math.round((bt.meanNetValuePerDay.priceOnly / bt.meanNetValuePerDay.stressAware - 1) * 100)} percent more per day but overloads the substation on {bt.daysCausingOverload.priceOnly} of {bt.days} days, because it charges when load is already high.</li>
          <li>The three goals pull against each other. Staying clean avoids the most CO2, about {Math.abs(bt.meanCo2TPerDay.clean).toFixed(1)} t per day, but earns {money(bt.meanNetValuePerDay.clean)} per day and adds load in jam hours, because the cleanest hours to charge, late afternoon solar, run into the evening rush. Staying out of traffic is the middle path.</li>
          <li>No plan cuts the daily peak on these autumn days. Charging at midday raises it by {Math.abs(bt.meanPeakReductionMW.stressAware).toFixed(1)} MW on average for staying out of traffic, always inside the limit. The relief happens in the jam hours, not at the daily peak.</li>
          <li>Our demand forecast is off by {bt.demandForecastMapePct.ours.toFixed(1)} percent on average, against {bt.demandForecastMapePct.eiaDayAhead.toFixed(1)} percent for EIA's own day ahead forecast over the same hours. Weather inputs come from archived data. CO2 is estimated from EIA hourly fuel mix over {bt.carbonDays} days.</li>
          <li>This autumn window never exceeds the limit without the battery, so the overload story rests on the transformer outage scenario and the added load test above.</li>
          <li>Every plan passed all battery checks: charge and discharge limits, stored energy bounds, energy balance, and ending the day where it started.</li>
        </ul>
      </section>

      <section className="honest" aria-labelledby="hn-h">
        <h2 id="hn-h">What is real and what is modeled</h2>
        <div className="cols">
          <div>
            <h3>Real data</h3>
            <ul>
              <li>Day ahead prices and congestion price from CAISO for the PacifiCorp East hub.</li>
              <li>Hourly demand, solar and wind output from EIA for PacifiCorp East.</li>
              <li>Hourly fuel mix (coal, gas, hydro, wind, solar) from EIA.</li>
              <li>Utah weather from Open-Meteo.</li>
            </ul>
          </div>
          <div>
            <h3>Modeled by us</h3>
            <ul>
              <li>Tomorrow's demand, solar and wind forecast.</li>
              <li>The traffic index, a blend of demand, net load, evening ramp and price.</li>
              <li>Grid CO2 per MWh by hour, from the fuel mix and EIA emission rates.</li>
              <li>The dispatch plan, solved exactly with dynamic programming, then replanned every hour with the load measured that hour. No AI makes the decisions.</li>
              <li>Swings inside an hour, in the flywheel section only, with a simulated data center load.</li>
            </ul>
          </div>
          <div>
            <h3>Assumed</h3>
            <ul>
              {report.assumptions.map(a => <li key={a}>{a}</li>)}
            </ul>
            <h3>Sources</h3>
            <ul className="sources">
              {SOURCES.map(([label, url]) => <li key={url}><a href={url} target="_blank" rel="noreferrer">{label}</a></li>)}
            </ul>
          </div>
        </div>
      </section>

      <footer>Built for the Hard Tech Week Hackathon, Torus bounty, option 1. Data: CAISO OASIS, EIA Open Data, Open-Meteo.</footer>
    </main>
  );
}
