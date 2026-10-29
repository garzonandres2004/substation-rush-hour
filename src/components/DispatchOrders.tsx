'use client';
import { useState } from 'react';
import { hourLabel, report } from '../lib/report';

// Tomorrow's plan written as dispatch orders: blocks of hours with one action and one traffic state each, what a dispatch layer
// such as Torus Lasso would take in. There is no connection to Torus: approving only marks the plan in this
// browser, and the download is a plain CSV of the same orders.

interface Block {
  from: number; // local hour
  to: number; // local hour the block ends (exclusive)
  action: 'Charge' | 'Discharge' | 'Hold';
  mw: number; // largest power in the block
  mwh: number;
  socEnd: number;
  jam: boolean;
}

const EPS = 0.05;
export function ordersFor(hours: typeof report.scenarios.normal.hours): Block[] {
  const out: Block[] = [];
  for (const h of hours) {
    const net = h.aware.charge - h.aware.discharge;
    const action: Block['action'] = net > EPS ? 'Charge' : net < -EPS ? 'Discharge' : 'Hold';
    const last = out.at(-1);
    if (last && last.action === action && last.jam === h.congested) {
      last.to = h.hourLocal + 1;
      last.mw = Math.max(last.mw, Math.abs(net));
      last.mwh += Math.abs(net);
      last.socEnd = h.aware.soc;
    } else {
      out.push({
        from: h.hourLocal,
        to: h.hourLocal + 1,
        action,
        mw: Math.abs(net),
        mwh: Math.abs(net),
        socEnd: h.aware.soc,
        jam: h.congested,
      });
    }
  }
  return out;
}

const range = (b: Block) => `${hourLabel(b.from)} to ${hourLabel(b.to % 24)}`;

export function DispatchOrders() {
  const hours = report.scenarios.normal.hours;
  const blocks = ordersFor(hours);
  const e = report.params.asset.energyMWh;
  const [approved, setApproved] = useState<string | null>(null);

  const csv = () => {
    const head = 'date,from_local,to_local,unit,action,max_mw,energy_mwh,stored_at_end_mwh,jam_hours';
    const rows = blocks.map(b =>
      [
        report.date,
        hourLabel(b.from),
        hourLabel(b.to % 24),
        'Nova Pulse',
        b.action.toLowerCase(),
        b.mw.toFixed(2),
        b.mwh.toFixed(2),
        b.socEnd.toFixed(2),
        b.jam ? 'yes' : 'no',
      ].join(','),
    );
    const url = URL.createObjectURL(new Blob([[head, ...rows].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `station-orders-${report.date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="orders">
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Hours (Mountain time)</th>
              <th>Nova Pulse</th>
              <th>Up to</th>
              <th>Energy</th>
              <th>Stored after</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map(b => (
              <tr key={b.from} className={b.jam ? 'jam' : ''}>
                <th scope="row">
                  {range(b)}
                  {b.jam && <em className="tag">jam</em>}
                </th>
                <td>{b.action}</td>
                <td>{b.action === 'Hold' ? '' : `${b.mw.toFixed(1)} MW`}</td>
                <td>{b.action === 'Hold' ? '' : `${b.mwh.toFixed(1)} MWh`}</td>
                <td>{Math.round((100 * b.socEnd) / e)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sub">
        Nova Spin, the flywheel, is not scheduled: it follows the meter inside every hour and takes the fast swings, so
        Nova Pulse can keep to these orders. Every hour the plan is redone from the latest meter reading and the guard
        can override an order to hold the limit.
      </p>
      <div className="seg" role="group" aria-label="Orders">
        <button
          type="button"
          className={approved ? 'on' : ''}
          onClick={() => setApproved(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))}
        >
          {approved ? `Approved at ${approved}` : 'Approve the plan'}
        </button>
        <button type="button" onClick={csv}>
          Download orders (CSV)
        </button>
      </div>
      {approved && (
        <p className="sub" aria-live="polite">
          Approved in this browser only. In a pilot this is the step that hands the orders to the dispatch layer (Torus
          Lasso); this page has no connection to it.
        </p>
      )}
    </div>
  );
}
