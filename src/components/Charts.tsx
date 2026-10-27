'use client';
import type { Scenario } from '../lib/report';
import { hourLabel } from '../lib/report';
import type { Strategy } from '../lib/directions';

const W = 720;
const M = { l: 46, r: 46, t: 14, b: 26 };
const iw = W - M.l - M.r;

function xAt(h: number) { return M.l + (iw * h) / 23; }
const step = iw / 23;

function ticks(lo: number, hi: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(lo + ((hi - lo) * i) / n);
  return out;
}

interface Props { sc: Scenario; strategy: Strategy; hover: number | null; setHover: (h: number | null) => void }

function HoverBand({ hover }: { hover: number | null }) {
  if (hover === null) return null;
  return <rect x={xAt(hover) - step / 2} y={0} width={step} height="100%" fill="#101B2D" opacity={0.06} />;
}
function Hit({ setHover, h, height }: { setHover: (h: number | null) => void; h: number; height: number }) {
  return <rect x={xAt(h) - step / 2} y={0} width={step} height={height} fill="transparent" onMouseEnter={() => setHover(h)} onMouseLeave={() => setHover(null)} />;
}
function XAxis({ y }: { y: number }) {
  return (
    <g fontSize={14} fill="#5B6678">
      {[0, 3, 6, 9, 12, 15, 18, 21].map(h => (
        <text key={h} x={xAt(h)} y={y} textAnchor="middle">{hourLabel(h)}</text>
      ))}
    </g>
  );
}

export function LoadChart({ sc, strategy, hover, setHover }: Props) {
  const H = 250;
  const hs = sc.hours;
  const all = [...hs.map(h => h.loadBefore), ...hs.map(h => h[strategy].loadAfter), sc.capMW];
  const lo = Math.floor((Math.min(...all) - 2) / 5) * 5;
  const hi = Math.ceil((Math.max(...all) + 2) / 5) * 5;
  const y = (v: number) => M.t + (H - M.t - M.b) * (1 - (v - lo) / (hi - lo));
  const path = (f: (i: number) => number) => hs.map((h, i) => `${i ? 'L' : 'M'}${xAt(h.hourLocal).toFixed(1)},${y(f(i)).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Substation load across the day, with and without the battery, against the capacity limit" className="chart">
      <HoverBand hover={hover} />
      {ticks(lo, hi, (hi - lo) / 5).map(v => (
        <g key={v}>
          <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke="#D9DDE3" strokeWidth={1} />
          <text x={M.l - 8} y={y(v) + 4} textAnchor="end" fontSize={14} fill="#5B6678">{v}</text>
        </g>
      ))}
      <text x={M.l - 8} y={10} textAnchor="end" fontSize={14} fill="#5B6678">MW</text>
      {hs.map(h => {
        const ob = Math.max(0, h.loadBefore - sc.capMW);
        const oa = Math.max(0, h[strategy].loadAfter - sc.capMW);
        return (
          <g key={h.hourLocal}>
            {ob > 0 && <rect x={xAt(h.hourLocal) - step / 2} width={step} y={y(h.loadBefore)} height={y(sc.capMW) - y(h.loadBefore)} fill="#D7263D" opacity={0.18} />}
            {oa > 0 && <rect x={xAt(h.hourLocal) - step / 2} width={step} y={y(h[strategy].loadAfter)} height={y(sc.capMW) - y(h[strategy].loadAfter)} fill="#D7263D" opacity={0.75} />}
          </g>
        );
      })}
      <line x1={M.l} x2={W - M.r} y1={y(sc.capMW)} y2={y(sc.capMW)} stroke="#D7263D" strokeWidth={1.5} strokeDasharray="6 4" />
      <text x={W - M.r} y={y(sc.capMW) - 6} textAnchor="end" fontSize={14} fill="#B01E32">Capacity limit {sc.capMW.toFixed(1)} MW</text>
      <path d={path(i => hs[i].loadBefore)} fill="none" stroke="#7C8798" strokeWidth={2} strokeDasharray="2 3" />
      <path d={path(i => hs[i][strategy].loadAfter)} fill="none" stroke="#1D4ED8" strokeWidth={3} strokeLinejoin="round" />
      <XAxis y={H - 6} />
      {hs.map(h => <Hit key={h.hourLocal} setHover={setHover} h={h.hourLocal} height={H} />)}
    </svg>
  );
}

export function BatteryChart({ sc, strategy, hover, setHover }: Props) {
  const H = 190;
  const hs = sc.hours;
  const P = 10.5;
  const mid = M.t + (H - M.t - M.b) / 2;
  const half = (H - M.t - M.b) / 2;
  const yP = (v: number) => mid - (v / P) * half;
  const yS = (v: number) => M.t + (H - M.t - M.b) * (1 - v / 40);
  const soc = hs.map(h => `${xAt(h.hourLocal).toFixed(1)},${yS(h[strategy].soc).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Battery charging, discharging and stored energy across the day" className="chart">
      <HoverBand hover={hover} />
      <line x1={M.l} x2={W - M.r} y1={mid} y2={mid} stroke="#9AA3B2" strokeWidth={1} />
      <polyline points={`${xAt(0)},${yS(0)} ${soc.join(' ')} ${xAt(23)},${yS(0)}`} fill="#101B2D" opacity={0.07} />
      <polyline points={soc.join(' ')} fill="none" stroke="#5B6678" strokeWidth={1.5} />
      {[-10, -5, 0, 5, 10].map(v => (
        <text key={v} x={M.l - 8} y={yP(v) + 4} textAnchor="end" fontSize={14} fill="#5B6678">{Math.abs(v)}</text>
      ))}
      <text x={M.l - 8} y={10} textAnchor="end" fontSize={14} fill="#5B6678">MW</text>
      {[0, 20, 40].map(v => (
        <text key={v} x={W - M.r + 8} y={yS(v) + 4} fontSize={14} fill="#5B6678">{v}</text>
      ))}
      <text x={W - M.r + 8} y={10} fontSize={14} fill="#5B6678">MWh</text>
      {hs.map(h => {
        const s = h[strategy];
        return (
          <g key={h.hourLocal}>
            {s.charge > 0.05 && <rect x={xAt(h.hourLocal) - step * 0.32} width={step * 0.64} y={yP(s.charge)} height={mid - yP(s.charge)} fill="#1D4ED8" />}
            {s.discharge > 0.05 && <rect x={xAt(h.hourLocal) - step * 0.32} width={step * 0.64} y={mid} height={yP(-s.discharge) - mid} fill="#7C3AED" />}
          </g>
        );
      })}
      <XAxis y={H - 6} />
      {hs.map(h => <Hit key={h.hourLocal} setHover={setHover} h={h.hourLocal} height={H} />)}
    </svg>
  );
}
