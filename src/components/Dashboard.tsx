'use client';
import { useMemo, useState } from 'react';
import { report, hourLabel, rangeLabel, dateLabel, stressColor, stressWord } from '../lib/report';
import { directions, jamRanges, type Strategy } from '../lib/directions';
import { LoadChart, BatteryChart } from './Charts';
import { explanationFor, stepKey, explainedBy } from '../lib/explain';

type ScenarioKey = 'normal' | 'derate';
const SOURCES: [string, string][] = [
  ['Torus Nova Pulse (4 to 8 hour battery) and Nova Spin (flywheel), ESS News', 'https://www.ess-news.com/2024/11/26/torus-unveils-flywheel-battery-energy-storage-ai-driven-cybersecurity-solutions'],
  ['Rocky Mountain Power and Torus partnership, DCD', 'https://datacenterdynamics.com/en/news/rocky-mountain-power-and-torus-partner-on-energy-storage-integration-in-utah'],
  ['Battery round trip efficiency 85 percent, NREL ATB 2024', 'https://atb.nrel.gov/electricity/2024/utility-scale_battery_storage'],
  ['US battery fleet round trip efficiency 82 percent, EIA', 'https://www.eia.gov/todayinenergy/detail.php?id=46756'],
  ['Day ahead prices, CAISO OASIS', 'https://oasis.caiso.com'],
  ['Demand, solar and wind, EIA Open Data', 'https://www.eia.gov/opendata/'],
  ['Weather, Open-Meteo', 'https://open-meteo.com'],
  ['CO2 per kWh by fuel, EIA', 'https://www.eia.gov/tools/faqs/faq.php?id=74'],
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
  const card = strategy === 'aware' ? sc.scorecards.stressAware : sc.scorecards.priceOnly;
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

  const backtestRows = [
    { key: 'none', name: 'No storage', net: 0, over: 0, days: 0, co2: 0 },
    { key: 'naive', name: 'Fixed schedule', net: bt.meanNetValuePerDay.naive, over: bt.meanOverloadAfterMWh.naive, days: report.backtest.days.filter(d => d.overA.naive > 1e-3).length, co2: bt.meanCo2TPerDay.naive },
    { key: 'priceOnly', name: 'Follows price only', net: bt.meanNetValuePerDay.priceOnly, over: bt.meanOverloadAfterMWh.priceOnly, days: bt.daysPriceOnlyCausesOverload, co2: bt.meanCo2TPerDay.priceOnly },
    { key: 'aware', name: 'Stays out of traffic', net: bt.meanNetValuePerDay.stressAware, over: bt.meanOverloadAfterMWh.stressAware, days: bt.daysStressAwareCausesOverload, co2: bt.meanCo2TPerDay.stressAware },
  ];

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
              <span>Energy the battery takes off the grid during jam hours, net of what it charges then. Measured in the model for this day.</span>
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

      <section className="evidence" aria-labelledby="ev-h">
        <h2 id="ev-h">Tested on {bt.days} past days</h2>
        <p className="sub">{shortDate(bt.firstDay)} to {shortDate(bt.lastDay)}. Each day is planned using only information available the day before. Prices are real CAISO day ahead prices.</p>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Strategy</th><th>Net value per day</th><th>Days it overloaded the substation</th><th>Average overload per day</th><th>Grid CO2 per day, estimated</th></tr></thead>
            <tbody>
              {backtestRows.map(r => (
                <tr key={r.key} className={r.key === 'aware' ? 'best' : ''}>
                  <th scope="row">{r.name}</th>
                  <td>{money(r.net)}</td>
                  <td>{r.days} of {bt.days}</td>
                  <td>{f1(r.over)} MWh</td>
                  <td>{co2(r.co2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="notes">
          <li>Following price alone earns about {Math.round((1 - bt.meanNetValuePerDay.stressAware / bt.meanNetValuePerDay.priceOnly) * 100)} percent more per day but loads the substation past its limit on {bt.daysPriceOnlyCausesOverload} of {bt.days} days, because it charges when load is already high.</li>
          <li>Carbon is a tradeoff too. Following price alone avoids about {Math.abs(bt.meanCo2TPerDay.priceOnly).toFixed(1)} t of CO2 per day against {Math.abs(bt.meanCo2TPerDay.stressAware).toFixed(1)} t for staying out of traffic, because the cheap midday hours are also the cleanest. Estimated from EIA hourly fuel mix over {bt.carbonDays} days.</li>
          <li>Our demand forecast is off by {bt.demandForecastMapePct.ours.toFixed(1)} percent on average, against {bt.demandForecastMapePct.eiaDayAhead.toFixed(1)} percent for EIA's own day ahead forecast over the same hours. Weather inputs come from archived data.</li>
          <li>This autumn window never exceeds the capacity limit without the battery, so the overload story rests on the transformer outage scenario above.</li>
          <li>Every plan passed all checks: charge and discharge limits, stored energy bounds, energy balance, and ending the day where it started.</li>
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
              <li>The dispatch plan, solved exactly with dynamic programming. No AI makes the decisions.</li>
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
