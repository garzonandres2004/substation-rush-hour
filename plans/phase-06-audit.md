# Phase 06 audit: build vs brief must haves 1 to 8

Date: Mon Oct 26 (late). Scored against `brief/brief.md` section 6, using report.json, the engine source, tests (7 pass), the production build, and a fetch of the live URL. The live site does not have the phase 05 explanations yet (needs redeploy).

Scoring rule: percent of the requirement as written that a judge can see and verify today. Honest, not generous.

| # | Must have | Score | Evidence | Gap |
|---|---|---|---|---|
| 1 | Pull and cache 30 to 60 days of PACE demand and Utah weather | 95% | Demand 1,441 hours (60 days, Aug 28 to Oct 27), prices 984 hours (41 days), weather cached, no gaps over 1 hour | `data/raw` is gitignored, so a judge cannot rerun the engine from the repo alone |
| 2 | Congestion index, defined explicitly, not just price | 90% | Four parts (demand 0.3, net load 0.3, ramp 0.2, price 0.2), percentile vs trailing 30 days, jam at 0.65, "Built from" shown per hour | Weights and threshold are not shown in the UI |
| 3 | Next day forecast of the index, with backtest error shown | 70% | Demand forecast MAPE 5.0% vs EIA 8.6% over 31 days | Error of the index itself, solar and wind is not backtested. Backtest uses archived weather, so error is optimistic (disclosed) |
| 4 | Storage model: battery plus flywheel layer, parameters labeled with source links | 55% | Battery 10 MW / 40 MWh, 88% RTE, SoC 10 to 95%, five validity checks pass | Flywheel not modeled (disclosed). No source links anywhere in the UI. Torus range of 4 to 8 hours for Nova Pulse is verified, source: ess-news.com article of Nov 26 2024 |
| 5 | Dispatcher that avoids congested hours, plus baseline | 95% | Exact DP, three baselines (none, fixed, price only), tests for limits and balance | None material |
| 6 | Results: congested hours avoided, peak reduced, cost and carbon, constraint checks | 60% | Cost shown, constraint checks shown, congested energy relieved shown | Carbon missing entirely (fuel mix already pulled, unused). Peak reduction not shown and is negative on the normal day. See findings 2 and 3 |
| 7 | One live page: traffic report, schedule, before and after, assumptions | 90% | All four present, deployed, builds clean | Ordinal bug, negative money format, stale date risk, mobile recheck, live site lacks phase 05 |
| 8 | Plain English why per decision, cached AI | 90% built, 0% live | 20 of 20 dispatch steps explained, numbers validated by `npm run explain`, falls back safely if stale | Needs redeploy. Hover detail per hour has no explanation |

Overall about 81% built (simple average of the eight).

## Findings, ranked by risk with a Torus judge

1. **Normal day story is thin.** On the normal day the battery raises the day's peak from 75.5 to 79.5 MW (charging at midday up to the limit). Backtest mean peak change is minus 3.7 MW (worse). The only overload story is the transformer out scenario, which rests on our own assumed limit (P95 of trailing 30 days). Expect "why is your limit that number". Answer honestly: it is an assumption, and real feeder ratings are not public.
2. **Carbon is missing.** Must have 6 says cost and carbon. EIA fuel mix is already in `data/raw/eia_fuel.json`. Estimate: average grid emissions per hour from fuel mix times standard factors, labeled estimated. About 1.5 hours. If skipped, cut it from the brief on purpose and say so.
3. **5 PM jam hour is not relieved on the normal day.** Hours 5 PM and 6 PM are jams (index 0.67 and 0.73). The aware plan discharges at 6 PM (70.5 to 60.7 MW) but holds at 5 PM (74.1 MW stays 74.1). Reason, from the objective (price plus $20 times index): 5 PM scores about 42.7 vs 6 PM 66.3 and 9 PM 63.9, and the plan must end at 50% charge, which leaves limited evening energy. Fine to explain, but do not claim it covers every jam hour.
4. **Price only is 7% richer.** Aware earns $329 per day vs $352 for price only. This is already shown and is a strength (honest tradeoff). Keep it in the deck.
5. **Flywheel absent.** Torus's other product (Nova Spin, response under 250 milliseconds per the same article) is the sub hour layer. Disclosed in the app. Deck should say it plainly and name it as next step, not hide it.
6. **Brief wording risk.** The brief says Rocky Mountain Power deploys Torus systems "at substations". The DCD article only says "across multiple locations" for a virtual power plant and a proposed 70 MW demand response program, no substations. Say "Utah deployment" in the deck unless a staff member confirms substations.
7. **Unsourced claim.** params.ts says the flywheel's role includes "reducing battery cycling". The source says rapid response and about twice the lifespan of batteries. Reword to what the source says.
8. **Bugs found.**
   - Detail panel prints "72th", "91th", "67th" percentiles (needs 1st, 2nd, 3rd, 11th to 13th handling).
   - Negative net value prints as "$-387" in the transformer out + stays out of traffic view. Should be "-$387", and needs one line explaining why it is negative (buying at $49 per MWh at 11 PM to end the day half full, selling at about $17).
   - A step titled "charge 0 MWh" (0.3 MWh at 3 AM) in transformer out. Hide steps under about 1 MWh.
   - Transformer out leaves 3 hours with 0.01 MW over the limit (0.13 MWh), from the DP grid. Say "held to the limit" not "no overload".
   - Page date reads Tuesday, October 27, which is stale on judging day Wednesday. Either rerun data on Wednesday morning (the explanations then need rewriting for any changed step, `npm run explain` will list them) or relabel as "Demo day: Oct 27 data".
9. **Repo reproducibility.** `data/raw` is gitignored. Commit a compact merged file (hours only) or document that `report.json` is the committed output.

## Fix order suggested for Tuesday

1. Bugs in finding 8 (30 minutes).
2. Source links in the assumptions panel plus the wording fix in finding 7 (20 minutes).
3. Carbon estimate (1.5 hours) or deliberate cut.
4. Show peak and jam hour numbers honestly, with an "evening jam peak" metric instead of daily peak (45 minutes).
5. Persona reviews, mobile check, redeploy, then deck.

## Fixed Mon night (not yet deployed)

1. Percentiles now print 72nd, 91st, 67th.
2. Negative money prints as -$387, with one line on why the value is negative.
3. Steps under 1 MWh are hidden from the turn by turn list (still in the schedule and charts). 19 explanations now.
4. Header reads "Forecast for Tuesday, October 27, latest day with published day ahead prices".
5. Sources list with links added under Assumed. Flywheel wording now matches the source. Round trip efficiency note says 88 percent is above NREL ATB 2024 (85) and EIA 2019 fleet (82).
6. report.json regenerated: only the assumptions text and timestamp changed. Tests pass, build clean, explain check clean.

7. Carbon added (finding 2): hourly grid CO2 from EIA fuel mix and EIA 2023 rates, average not marginal, labeled estimated. Shown as a fourth result figure, a backtest column and a note. Backtest over 30 days: stays out of traffic avoids 1.1 t CO2 per day, price only 3.3 t, fixed 1.7 t. Transformer out adds 4.7 t because holding the limit discharges at midday (cleanest) and recharges at night. Existing numbers unchanged. 8 tests pass.

Must have 6 now about 80%.

8. Peak wording (findings 1 and 3): the results figure now says when the daily peak rises (75.5 to 79.5 MW on the normal day, inside the limit), and a backtest note says no plan cuts the daily peak on these autumn days; relief happens in jam hours.
9. Third strategy "Stays clean" (slide bullet: agents that schedule around clean power): same exact dispatcher, signal is forecast grid CO2 instead of price, limit kept as a hard rule. Backtest: $60 per day, 5.7 t CO2 avoided per day, 0 overload days, but adds load in jam hours (relief minus 3.8 MWh per day). Key insight for the deck: price, traffic and carbon pull in different directions; staying out of traffic is the middle path. 25 explanations, all validated.

Open: persona reviews, mobile, redeploy.

## Mon 9 to 10 PM: from "meets" to "wins"

10. Found and fixed the biggest credibility hole: the backtest graded plans on our own forecast. Now every past day is planned the night before and run hour by hour on actual demand. Version 1 (plan once) overloaded on 8 of 30 days (41 MWh), forecast miss up to 9.3 MW. Hourly replanning with measured load (model predictive control) brings it to 0 of 30 at no cost ($324 per day either way). Ablation: a 90th percentile forecast margin alone left 3 overload days and cost $42 per day; margin plus replanning cost $29 per day for no gain. Margin dropped from the main plan.
11. Capacity unlocked (new section, the headline): constant new load added to 30 real days until the first overload. No storage 1 MW, 10 MW 4 h Station 6.75 MW, 10 MW 8 h 10 MW, 20 MW 4 h 7.5 MW, 10 MW 2 h 4.25 MW, 5 MW 4 h 4 MW. Duration beats power here.
12. Planner speedup (only reachable states), same results. 9 tests pass. Page checked by screenshot at 1280 and 390 px, no horizontal scroll.

Pitch sentence: "A Torus style Station lets this Utah substation take a 6.75 MW data center instead of 1 MW, with zero overloads across 30 real days, proven on what actually happened, not on our forecast."

## Mon 10 to 11 PM: Station model (flywheel plus battery)

13. New section "Inside the hour". The 6.75 MW data center from capacity unlocked, replayed at 1 minute steps as a SIMULATED AI load (each hour's mean preserved, so it matches the hourly model). Base load is real hourly actuals held flat inside the hour. 30 days.
    Hourly plan only: 4,097 minutes over the limit (55 MWh). Battery chases spikes: 0 minutes, but 88 power changes a day vs 11. Station with 3 MW, 6 minute flywheel (Torus Spin claims, verified on torus.co/torus-flywheel: 10C, 6 min, 25,000 cycles) plus battery: 0 minutes, 13 changes a day, battery backup only 55 minutes in 30 days, flywheel 6.4 cycles a day (about 11 years at 25,000 cycles, Torus claim).
    Flywheel alone: 2 MW misses 608 minutes, 3 MW 55, 4 MW 24. Six minutes cannot outlast a long compute burst, so flywheel for power plus battery for energy.
    Honest limits: data center shape is simulated; battery wear not measured; flywheel standby losses not modeled; 3 MW is a modeled size (Torus publishes no per unit rating).
14. Must have 4 (storage model with flywheel layer) now about 85%. 10 tests pass. Screenshots checked at 1280 and 390 px.

Run order after new data: npm run capacity, npm run station, npm run engine, npm run explain.
