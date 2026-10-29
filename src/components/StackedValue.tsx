'use client';
import { useEffect, useState } from 'react';
import labRaw from '../../public/data/lab.json';
import stackRaw from '../../public/data/merge-fullstack.json';
import { report } from '../lib/report';

// What one Station and the businesses behind its substation are worth, side by side: MW of new load and
// readiness for the utility, dollars for the customers, relief for the grid. Every number is read from
// the same files the rest of the site uses; the customer bills come from the fleet test built with DETOUR
// (Juan Lizarazo, MIT), fetched when this section loads.

interface FleetRow {
  sites: number;
  tradedAndGuard: { savedBeforeUsd: number; savedAfterUsd: number };
}
const money = (x: number) => `$${Math.round(x).toLocaleString('en-US')}`;

export function StackedValue() {
  const [fleet, setFleet] = useState<{ sites: number; perSiteYear: number; keptPct: number; months: number } | null>(
    null,
  );
  useEffect(() => {
    fetch('/data/merge-fleet.json')
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { months: Record<string, { fleets: FleetRow[] }> }) => {
        const ms = Object.keys(d.months);
        const big = d.months[ms[0]].fleets.length - 1;
        const rows = ms.map(m => d.months[m].fleets[big]);
        const before = rows.reduce((s, r) => s + r.tradedAndGuard.savedBeforeUsd, 0);
        const after = rows.reduce((s, r) => s + r.tradedAndGuard.savedAfterUsd, 0);
        const sites = rows[0].sites;
        setFleet({
          sites,
          perSiteYear: (after / sites / ms.length) * 12,
          keptPct: (100 * after) / before,
          months: ms.length,
        });
      })
      .catch(() => setFleet(null));
  }, []);

  const cap = report.capacity;
  const mv = cap.limits.moving;
  const main = mv.stations.find(
    x => x.powerMW === report.params.asset.powerMW && x.energyMWh === report.params.asset.energyMWh,
  )!;
  const bt = report.backtest.summary;
  const lab = labRaw as unknown as {
    days: number;
    events: { reserve?: { valuePerDay: Record<string, number> }; byStrategy: Record<string, { fullDays: number }> };
  };
  const ev = lab.events;
  const reserveCost = ev.reserve ? ev.reserve.valuePerDay.ours - ev.reserve.valuePerDay.oursWithReserve : null;
  const stack = stackRaw as unknown as {
    days: number;
    result: Record<string, { overloadHours: number; hoursNotOverWithoutBatteries: number }>;
  };

  const rows: [string, string, string][] = [
    [
      'The utility',
      `${main.capacityModeMW ?? main.awareMW} MW of new load on the same wires (${mv.withoutStorageMW} MW without storage)`,
      `${cap.days} real days, moving limit, capacity mode`,
    ],
    [
      'The utility, in a Wattsmart event',
      `Ready for 2 hours at full power on ${ev.byStrategy.oursWithReserve?.fullDays ?? ev.byStrategy.ours.fullDays} of ${lab.days} days${reserveCost !== null ? `, for about ${money(reserveCost)} a day` : ''}`,
      'Lab section I, assumed event at the busiest hour',
    ],
    [
      'The Station owner',
      `${money(bt.meanNetValuePerDay.stressAware)} a day from prices, at $${report.params.asset.cycleCostPerMWh} of wear per MWh`,
      'About zero or below at DETOUR’s wear cost (lab section L)',
    ],
    [
      'The grid',
      `${bt.meanCongestedEnergyRelievedMWh.stressAware.toFixed(1)} MWh a day out of jam hours, never charging in one`,
      `${bt.days} real days`,
    ],
    [
      'Businesses behind the substation',
      fleet
        ? `${money(fleet.perSiteYear)} a year each on their Rocky Mountain Power bill, keeping ${Math.min(100, fleet.keptPct).toFixed(0)}% of what they would save alone`
        : 'Loading…',
      fleet ? `${fleet.sites} businesses with Nova Pulse, ${fleet.months} months, room shared plus the guard` : '',
    ],
    [
      'All together',
      `${stack.result.stationFleetTraded.hoursNotOverWithoutBatteries} new hours over the limit in ${Math.round(stack.days / 30)} months, and ${stack.result.stationFleetTraded.overloadHours} hours over against ${stack.result.station.overloadHours} for the Station alone`,
      'Lab section K, full stack',
    ],
  ];

  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>For</th>
            <th>What it gets</th>
            <th>Measured on</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([who, what, on]) => (
            <tr key={who}>
              <th scope="row">{who}</th>
              <td>{what}</td>
              <td>{on}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
