# Substation Rush Hour: Working Context

**Event:** Hard Tech Week Hackathon (47G, Utah Tech Week, Nucleus). Aernata, 250 E 200 S, Salt Lake City
**Format:** Solo, 48 hours (Mon Oct 26 5 PM to Wed Oct 28 5 PM), judging Wed 5 to 6 PM, slot length depends on team count (8 to 25 min)
**Bounty:** Torus, $5,000. Option 1 "Rush Hour for Electrons"
**Live URL:** https://torus-green.vercel.app (Vercel project torus; redeploy with `npx vercel --prod`)
**Submission:** repo plus deck, presented to sponsor judges. Register team in Luma for a judging slot.
**Judges (slides):** Ryan Byrd, Angela Smith, Nicole Witmyer (Torus), Scott Holley, Tanner Potter

## 1. The problem in one paragraph

The grid has a rush hour: demand spikes, prices jump, solar fades. Most software ignores it. Torus pairs flywheel and battery storage with software and Rocky Mountain Power deploys Torus systems at substations to relieve grid traffic. The brief: build software that knows when the grid is jammed and stays out of the traffic. Prompt questions: a navigation app for electricity, a traffic report for tomorrow's grid, agents that schedule around clean power. "How would you manage the grid's congestion?"

## 2. The pitch (one sentence)

A traffic report for tomorrow's Utah grid, plus a dispatcher that tells a Torus style storage system when to charge, hold and discharge so it stays out of the traffic, with measured savings against doing nothing.

## 3. Judging (what Torus said)

| Criterion | Source | How we win it |
|---|---|---|
| Creativity | slides and spoken | Frame the grid as a logistics network with congestion. Navigation app idea: a route planner for electrons |
| Technical complexity / clarity of insight | spoken says complexity, slides say clarity of insight | A real world model: storage constraints, congestion definition separate from price, backtest on real Utah data |
| Execution / complete definition | slides and spoken | One complete path: data in, forecast, schedule, savings, constraint checks, live URL |
| Unwritten extra (Chandler) | spoken | Relate it to Torus products and real use. Build a world model of the grid or battery as real as possible. Go deep and show what we learned about the grid |

## 4. Hard requirements

- Free and open source data only. Simulated data fine if clearly labeled.
- Repo plus deck. Live URL as a bonus.
- Nothing confidential or NDA covered.

## 5. Data (to verify with `scripts/check-data.sh`)

| Source | Use | Key |
|---|---|---|
| EIA Open Data (electricity/rto, PACE = PacifiCorp East, Utah) | Hourly demand, generation by fuel | free key |
| Open-Meteo | Utah temperature, solar radiation forecast and history | none |
| CAISO OASIS | Prices (Western EIM nodes), if a PacifiCorp node works. Fallback: labeled price proxy built from net load | none |
| Torus website case studies | Real asset specs and deployment framing | none |

## 6. Scope

### Must have (demo path)
1. Pull and cache 30 to 60 days of hourly PACE demand plus Utah weather.
2. Congestion index per hour (demand vs trailing capacity proxy, plus net load ramp). Defined explicitly, not just price.
3. Next day forecast of the index (simple, explainable model, with backtest error shown).
4. Storage model: battery (energy, power, efficiency, SoC) plus fast response flywheel layer, all parameters labeled assumptions with source links.
5. Dispatcher: schedule that avoids congested hours. Baseline: no storage or naive schedule.
6. Results: congested hours avoided, peak reduced, cost and carbon estimate, constraint checks passed.
7. One live page: Tomorrow's traffic report (heatmap timeline), schedule, before and after, assumptions panel.
8. Plain English "why" per decision (AI at the edge, cached).

### Nice to have
- Heat wave scenario button.
- Short recorded backup run.

### Out of scope
Auth, billing, multi region, real device control, hardware claims, chatbot.

## 7. Demo script (about 5 minutes)

1. Problem as a dispatch problem, 20 sec.
2. Open the live URL: tomorrow's traffic report, red hours highlighted.
3. Show the storage dispatch schedule and why each decision was made.
4. Show before and after plus the backtest numbers (measured vs assumed labeled).
5. Heat wave scenario.
6. What is simulated, what is real, how it maps to a Torus substation deployment, next step.

## 8. AI approach

Edge only: explain decisions in plain English, optional scenario text to parameters. Everything else is code. Cache outputs.

## 9. Glossary

Congestion: demand close to or above what the local network or system can serve. Net load: demand minus solar and wind. SoC: battery state of charge. Arbitrage: charge cheap, discharge expensive. Demand response: shifting load in response to grid conditions.

## 10. Open questions for staff

1. Final judging criteria and weights, and required submission details?
2. Real Torus specs or a case study we may use for the storage model? Demo of customer battery monitoring software?
3. Is a modeled substation with public data acceptable as the "world model"?
4. Can one team also enter Nucleus?
