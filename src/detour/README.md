# DETOUR core (vendored)

Tariff, site and time code from DETOUR by Juan Lizarazo, used with his permission under the MIT license in `LICENSE` here.

Upstream: https://github.com/juanlizarazo/hard-tech-week-2026-torus (commit in `UPSTREAM_COMMIT`), path `app/src/app/core/`.

Copied as is, test files left out, so it can be synced with upstream. Biome skips this folder for the same reason.

What it gives us: Rocky Mountain Power Schedule 6 and 8 bills, the three simulated sites (airport, cement plant, ski resort, seed 42) and the Utah tariff calendar.

Check: `npx tsx scripts/detour-check.ts 2026-07` reproduces DETOUR's published July airport baseline (1,952 kW at 6:00 p.m. Jul 2, $74,891).
