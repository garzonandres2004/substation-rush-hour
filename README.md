# Substation Rush Hour

A traffic report for tomorrow's Utah grid, plus a dispatch plan for a battery that keeps a substation under its limit.

**Live demo:** https://torus-green.vercel.app

Built solo for the Hard Tech Week Hackathon, Torus challenge "Rush Hour for Electrons".

## What it does

1. Forecasts tomorrow's demand, solar, wind and net load for Utah (PacifiCorp East) hour by hour.
2. Turns that into a traffic style stress index, so the grid reads like a road map: green is free flowing, red is a jam.
3. Plans a modeled 10 MW / 40 MWh battery with exact dynamic programming. It charges in cheap, clear hours and discharges into the jam, while keeping modeled substation load under a capacity limit.
4. Compares that plan against three baselines: no storage, a fixed schedule, and a price only dispatcher. A "transformer out" scenario shows where price only dispatch overloads the substation and the capacity aware plan does not.
5. Backtests 30 past days against what actually happened: each day is planned the night before, then run hour by hour on real demand. Our first version (plan once) overloaded on 8 of 30 days because the forecast missed by up to 9.3 MW. Replanning every hour with measured load fixed all of them at no cost. A forecast safety margin was tested and lost.
6. Capacity unlocked: how much always on load (like a data center) the substation can add with zero overloads over those 30 days. No storage: 1 MW. A modeled 10 MW, 4 hour Station: 6.75 MW. 8 hours of storage beats 20 MW of power at this substation.
7. Inside the hour, a Torus style Station: the 6.75 MW data center replayed minute by minute as a simulated AI load (compute bursts, sync dips, up to 5.7 MW swing in a minute). The hourly plan hides 4,097 minutes over the limit in 30 days. The battery alone can fix it but changes power 88 times a day instead of 11. A modeled 3 MW, 6 minute flywheel (Torus Spin claims) plus the battery gets 0 minutes over, with the battery at 13 changes a day.
8. Own demand forecast MAPE 5.0% vs EIA's day ahead forecast 8.7%.

All decisions are made by code. There is no AI in the dispatch loop. AI only writes the plain English explanation of each battery step. Those texts are cached in `public/data/explanations.json` (no live calls), and `npm run explain` checks that every number in them matches the engine output. If the engine output changes, a stale explanation is dropped and the app falls back to the plain numbers.

## Real, modeled, assumed

| Real data | Modeled | Assumed |
| --- | --- | --- |
| EIA demand, day ahead forecast, fuel mix (PACE) | Substation load, scaled from PACE demand | Battery size and efficiency (88% round trip) |
| Open-Meteo temperature, sunshine, cloud cover | Solar and wind output from weather | Substation capacity limit (P95 of trailing 30 days) |
| CAISO day ahead prices for PacifiCorp nodes, with the congestion component | Stress index and battery schedule | Stress premium and cycle cost |

The flywheel is modeled only in the minute level section, with simulated data center load and Torus's published claims. Limitations are stated in the app and in `brief/brief.md`.

## Run it

```
npm install
npm run dev        # http://localhost:3000
npm test           # dispatch validity tests
npm run engine     # rebuild public/data/report.json
npm run capacity   # capacity unlocked analysis (run before npm run engine)
npm run station    # minute level flywheel plus battery model (after capacity)
npm run explain    # validate and cache the plain English explanations
```

To refresh the data, put an EIA key in `.env.local` as `EIA_API_KEY=...`, then run `node scripts/ingest.mjs` and `node scripts/pull-prices.mjs`, then `npm run engine`.

## Layout

| Path | What |
| --- | --- |
| `src/engine/` | Forecast, stress index, dispatcher, scoring, tests |
| `src/components/` | Dashboard and charts |
| `scripts/` | Data ingestion and engine runner |
| `public/data/report.json` | Output the UI reads |
| `brief/`, `plans/` | Brief and build plan |

## Stack

Next.js, React, TypeScript, inline SVG charts, Vercel.
