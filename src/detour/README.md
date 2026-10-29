# DETOUR core (vendored)

Tariff, site and time code from DETOUR by Juan Lizarazo, used with his permission under the MIT license in `LICENSE` here.

Upstream: https://github.com/juanlizarazo/hard-tech-week-2026-torus (commit in `UPSTREAM_COMMIT`), path `app/src/app/core/`.

Copied as is, so it can be synced with upstream. Biome skips this folder for the same reason. Folders: `helpers` (time only), `models`, `tariff`, `sites`, `plan`, `backtest`, `signals`, and `types/firestore.d.ts`.

Only two changes from upstream, both to run outside Angular:
1. `core/plan/plan-solver.service.ts` (an Angular service) is left out, and its export removed from `core/plan/index.ts`. Scripts load HiGHS directly, as DETOUR's own `precompute-year.ts` does.
2. `types/firestore.d.ts` imports `Timestamp` from `@angular/fire`; that line is replaced by a one line local type.

What it gives us: Rocky Mountain Power Schedule 6 and 8 bills, the three simulated sites (airport, cement plant, ski resort, seed 42), the Utah tariff calendar, and DETOUR's bill planner (an LP solved by HiGHS) with its month replay and live cap.

Checks:

1. `npx tsx scripts/detour-check.ts 2026-07` reproduces DETOUR's published July airport baseline (1,952 kW at 6:00 p.m. Jul 2, $74,891).
2. `npx tsx scripts/detour-replay-check.ts 2026-07 airport` runs DETOUR's month replay on our EIA data: the fixed-threshold battery ($5,980) and perfect hindsight ($15,137) match DETOUR's published July figures to the dollar. DETOUR's own day-ahead planner gives $4,743 here against $11,546 published. With the carbon term at zero it gives $11,238, so the gap comes from the carbon signal, which is fitted on a different pull of the same EIA fuel data.
3. `npm run test:detour` runs DETOUR's own tests for the vendored modules (tariff, plan engine, plan replay, signals: 19 tests), copied unchanged from the same upstream commit. All pass. Specs that need his Angular app or forecast module were not copied.
