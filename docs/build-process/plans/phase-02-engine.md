# Phase 02 Engine

**Goal:** Congestion index, next day view, storage model, dispatcher, baseline, constraint checks. Pure TypeScript, no AI.
**Brief requirements covered:** 2 to 6
**Depends on:** phase 01

## Design
- Congestion index per hour, defined and explained: blend of (a) net load percentile vs trailing 30 days, (b) the day ahead congestion price component MCC, (c) the evening solar ramp (net load rise per hour). Show all three, not just price.
- Next day: use REAL day ahead prices and EIA day ahead demand forecast for tomorrow. No fake forecast.
- Storage asset (labeled assumptions with source links): battery power MW, energy MWh, round trip efficiency, SoC limits, plus a fast response flywheel layer that is sized in MW with sub second response, used for the ramp hours. Parameters live in one config file.
- Dispatcher: linear program or dynamic program over 24 hours maximizing value (avoided congestion cost plus price arbitrage) under power, energy, efficiency and SoC limits. Baseline: no storage, and a naive rule (charge at night, discharge at peak).
- Scorecard: congested hours avoided, peak net load reduced, dollars, constraint checks.

## Validity tests (small, targeted)
- SoC never below min or above max. Power never exceeds limit. Units consistent (MW and MWh, hourly). Baseline reproduces. Savings not caused by doing less work (served energy equal).

## Done when
- [ ] npm run engine prints tomorrow's schedule and scorecard from real data
- [ ] Validity tests pass
