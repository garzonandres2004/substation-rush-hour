# Phase 01 Data and shared types

**Goal:** All real data cached locally, merged into one hourly table, typed, with the empty app deployed.
**Brief requirements covered:** 1
**Depends on:** none (blocking)

## Data confirmed working (Oct 26)
- EIA PACE (PacifiCorp East, Utah): demand D, day ahead demand forecast DF, net generation NG, interchange TI, fuel mix (COL, NG, OTH, SUN, WAT, WND), hourly, UTC.
- Open-Meteo Utah: temperature, shortwave radiation, cloud cover, 60 days back plus 3 forecast days.
- CAISO OASIS day ahead PRC_LMP for PacifiCorp nodes (TH_PACE_GEN-APND hub, ELAP_PACE-APND): LMP, MCC (congestion), MCE (energy), MCL (loss).

## Checklist
- [x] scripts/ingest.mjs (EIA and weather)
- [ ] scripts/pull-prices.mjs (run on Mac)
- [ ] Merge to data/hourly.json keyed by UTC hour: demand, demand_forecast, solar, wind, net_load (demand minus solar minus wind), temp, radiation, lmp, mcc
- [ ] Shared types: HourlyRow, StorageAsset, Schedule, Scorecard
- [ ] Empty Next.js app deployed to Vercel, live URL noted in README

## Done when
- [ ] hourly.json has at least 55 days with no gaps larger than 3 hours (gaps flagged)
- [ ] Live URL loads
