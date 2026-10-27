# Substation Rush Hour

A traffic report for tomorrow's Utah grid, plus a dispatch plan for a battery that keeps a substation under its limit.

**Live demo:** https://torus-green.vercel.app

Built solo for the Hard Tech Week Hackathon, Torus challenge "Rush Hour for Electrons".

## What it does

1. Forecasts tomorrow's demand, solar, wind and net load for Utah (PacifiCorp East) hour by hour.
2. Turns that into a traffic style stress index, so the grid reads like a road map: green is free flowing, red is a jam.
3. Plans a modeled 10 MW / 40 MWh battery with exact dynamic programming. It charges in cheap, clear hours and discharges into the jam, while keeping modeled substation load under a capacity limit.
4. Compares that plan against three baselines: no storage, a fixed schedule, and a price only dispatcher. A "transformer out" scenario shows where price only dispatch overloads the substation and the capacity aware plan does not.
5. Backtests 30 past days against what actually happened: each day is planned the night before, then run hour by hour on real demand. Planning once, the battery's own charging pushed the substation over its limit on 8 of 30 days (forecast misses up to 9.3 MW). Hourly replanning from last hour's miss is not enough (9 days, half the energy). A real time guard that reacts to the meter holds the limit on all 30 days for about $10 a day. With the same guard, the traffic index moves 12.1 MWh a day of relief into jam hours, against 4.8 for price alone, for $12 a day.
6. Capacity unlocked: always on new load (like a data center) the substation can take with zero overloads over those 30 days. Moving limit: 1 MW without storage, 5.75 MW with a modeled 10 MW, 4 h Station. Fixed rating (90.9 MW): 3.75 MW and 8.25 MW. A five line peak shaving rule gets 5.25 MW with the same Station; most of the room comes from the Station itself.
7. Inside the hour, a Torus style Station: that data center replayed minute by minute as a SIMULATED AI load. The hourly plan alone sits above the planning limit for 2,438 minutes in 30 days (worst minute 1.3 MW, about 2 percent). The battery chasing every spike gets it to 34 minutes but changes power 62 times a day instead of 11. A modeled 3 MW, 6 minute flywheel (Torus Spin claims) plus the battery: 0 minutes, battery at 12 changes a day.
8. Our demand forecast MAPE 5.0% vs EIA's day ahead 8.7%, but ours used observed weather for past days, so it is an upper bound, not a fair win.

All decisions are made by code. There is no AI in the dispatch loop. AI only writes the plain English explanation of each battery step. The daily refresh asks Gemini (free tier, one request a day, `scripts/explain-ai.ts`) for any step the hand written texts no longer cover; `scripts/explain-check.ts` checks every number against the engine output, failures get one retry and then fall back to the plain numbers. Texts are cached in `public/data/explanations.json`; the page makes no live model calls.

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

## Daily refresh

`.github/workflows/daily-refresh.yml` runs every day at 21:30 UTC, after CAISO publishes next day prices: it pulls fresh EIA, CAISO and Open-Meteo data, reruns capacity, station and engine, keeps only explanations that still match (`--lenient`; other steps show plain numbers), refuses to deploy a stale forecast, commits `public/data` and deploys to Vercel. It can also be run by hand from the Actions tab. Repository secrets needed: `EIA_API_KEY`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and optionally `GEMINI_API_KEY` for daily explanations.

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
