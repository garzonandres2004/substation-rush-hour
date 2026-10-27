'use client';
import { hourLabel } from '../lib/report';

interface Props { start: number; cap: number; hourly: number[]; station: number[] }

// Two hours at 1 minute steps: grid load with the hourly plan only, and with the Station.
export function MinuteChart({ start, cap, hourly, station }: Props) {
  const W = 720, H = 240, M = { l: 46, r: 16, t: 12, b: 26 };
  const iw = W - M.l - M.r, ih = H - M.t - M.b;
  const all = [...hourly, ...station, cap];
  const lo = Math.floor(Math.min(...all) - 1), hi = Math.ceil(Math.max(...all) + 0.5);
  const x = (i: number) => M.l + (iw * i) / (hourly.length - 1);
  const y = (v: number) => M.t + ih * (1 - (v - lo) / (hi - lo));
  const path = (vs: number[]) => vs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const overArea = hourly.map((v, i) => (v > cap ? `M${x(i).toFixed(1)},${y(cap).toFixed(1)}L${x(i).toFixed(1)},${y(v).toFixed(1)}` : '')).join('');
  const ticks = Array.from({ length: Math.floor((hi - lo) / 2) + 1 }, (_, i) => lo + 2 * i).filter(t => t <= hi);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Grid load minute by minute, hourly plan only versus Torus style Station">
      {ticks.map(t => (
        <g key={t}><line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="#e1e5ec" /><text x={M.l - 8} y={y(t) + 5} textAnchor="end" fontSize={13} fill="#5B6678">{t.toFixed(0)}</text></g>
      ))}
      <path d={overArea} stroke="#D7263D" strokeWidth={2.4} opacity={0.55} />
      <path d={path(hourly)} fill="none" stroke="#8a94a6" strokeWidth={1.5} />
      <path d={path(station)} fill="none" stroke="#1D4ED8" strokeWidth={2.5} strokeLinejoin="round" />
      <line x1={M.l} x2={W - M.r} y1={y(cap)} y2={y(cap)} stroke="#D7263D" strokeDasharray="6 5" strokeWidth={2} />
      {[0, 30, 60, 90, 119].map(i => (
        <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={13} fill="#5B6678">
          {i === 119 ? hourLabel((start + 2) % 24) : `${hourLabel(start + Math.floor(i / 60)).replace(' ', `:${String(i % 60).padStart(2, '0')} `)}`}
        </text>
      ))}
    </svg>
  );
}
