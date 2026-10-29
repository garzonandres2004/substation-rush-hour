'use client';
import { useMemo, useState } from 'react';
import { dispatch } from '../engine/dispatch';
import type { Params } from '../engine/types';
import { hourLabel, report } from '../lib/report';
import { BatteryChart, LoadChart } from './Charts';

// Tomorrow's plan, solved again in the browser with three settings changed: a reserve held for a utility
// event at the busiest hour, a safety margin added to the load forecast, and the traffic premium. Same
// planner as the published plan (src/engine/dispatch.ts); with the defaults it gives the published plan.

type Sc = typeof report.scenarios.normal;
const sc0: Sc = report.scenarios.normal;
const P = report.params as unknown as Params; // the full parameters the published plan used
const A = P.asset;
const minE = A.energyMWh * A.socMinFrac;
const money = (x: number) => `${x < 0 ? '−' : ''}$${Math.abs(Math.round(x)).toLocaleString('en-US')}`;

function replan(reserveMWh: number, marginMW: number, premium: number): Sc {
  const hs = sc0.hours;
  const signal = hs.map(h => h.lmp + premium * h.stress);
  let busiest = 0;
  hs.forEach((h, i) => {
    if (h.stress > hs[busiest].stress) busiest = i;
  });
  const floor: (number | undefined)[] = hs.map(() => undefined);
  if (reserveMWh > 0 && busiest > 0) floor[busiest - 1] = minE + reserveMWh;
  const s = dispatch(signal, A, {
    load: hs.map(h => h.loadBefore + marginMW),
    cap: sc0.capMW,
    penalty: P.overloadPenalty,
    floorMWh: floor,
    noCharge: hs.map(h => h.congested), // as the published plan: never charge in a forecast jam hour
  });
  return {
    ...sc0,
    hours: hs.map((h, i) => ({
      ...h,
      aware: {
        charge: s.charge[i],
        discharge: s.discharge[i],
        soc: s.soc[i],
        loadAfter: h.loadBefore + s.charge[i] - s.discharge[i],
      },
    })),
  };
}

function stats(sc: Sc) {
  let value = 0,
    relief = 0,
    peak = 0;
  for (const h of sc.hours) {
    const c = h.aware.charge,
      d = h.aware.discharge;
    value += h.lmp * (d - c) - (c + d) * A.cycleCostPerMWh;
    if (h.congested) relief += d - c;
    peak = Math.max(peak, h.aware.loadAfter);
  }
  const busiest = sc.hours.reduce((b, h, i) => (h.stress > sc.hours[b].stress ? i : b), 0);
  const ready = busiest > 0 ? sc.hours[busiest - 1].aware.soc - minE : A.energyMWh * A.startSocFrac - minE;
  return { value, relief, peak, ready, busiestHour: sc.hours[busiest].hourLocal };
}

export function PlanDials() {
  const [reserve, setReserve] = useState(0);
  const [margin, setMargin] = useState(0);
  const [premium, setPremium] = useState(P.stressPremium);
  const [hover, setHover] = useState<number | null>(null);
  const sc = useMemo(() => replan(reserve, margin, premium), [reserve, margin, premium]);
  const now = stats(sc);
  const base = useMemo(() => stats(sc0), []);
  const changed = reserve !== 0 || margin !== 0 || premium !== P.stressPremium;
  const diff = (x: number, b: number, f: (v: number) => string) =>
    changed && Math.abs(x - b) > 0.05 ? ` (published plan ${f(b)})` : '';

  return (
    <div className="dials">
      <div className="dialset">
        <label>
          <span>
            Reserve for a utility event at {hourLabel(now.busiestHour)}: <b>{reserve} MWh</b>
          </span>
          <input type="range" min={0} max={30} step={1} value={reserve} onChange={e => setReserve(+e.target.value)} />
        </label>
        <label>
          <span>
            Safety margin on the load forecast: <b>{margin} MW</b>
          </span>
          <input type="range" min={0} max={5} step={0.5} value={margin} onChange={e => setMargin(+e.target.value)} />
        </label>
        <label>
          <span>
            Traffic premium at full jam: <b>${premium} per MWh</b>
          </span>
          <input type="range" min={0} max={60} step={5} value={premium} onChange={e => setPremium(+e.target.value)} />
        </label>
        {changed && (
          <button
            type="button"
            className="reset"
            onClick={() => {
              setReserve(0);
              setMargin(0);
              setPremium(P.stressPremium);
            }}
          >
            Back to the published plan
          </button>
        )}
      </div>
      <div className="figures" aria-live="polite">
        <div>
          <b>{money(now.value)}</b>
          <span>value at tomorrow's prices{diff(now.value, base.value, money)}</span>
        </div>
        <div>
          <b>{Math.abs(now.relief).toFixed(1)} MWh</b>
          <span>
            {now.relief >= 0 ? 'taken out of' : 'added to'} jam hours
            {diff(now.relief, base.relief, v => `${v >= 0 ? '' : 'adds '}${Math.abs(v).toFixed(1)} MWh`)}
          </span>
        </div>
        <div>
          <b>{Math.max(0, now.ready).toFixed(1)} MWh</b>
          <span>ready at the busiest hour{diff(now.ready, base.ready, v => `${Math.max(0, v).toFixed(1)} MWh`)}</span>
        </div>
      </div>
      <div className="scroll">
        <LoadChart sc={sc} strategy="aware" hover={hover} setHover={setHover} />
      </div>
      <div className="scroll">
        <BatteryChart sc={sc} strategy="aware" hover={hover} setHover={setHover} />
      </div>
    </div>
  );
}
