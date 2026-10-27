# General Plan

**Demo path (one sentence):** Open the live URL, see tomorrow's grid traffic report for Utah, see the storage schedule that stays out of the traffic and why, see the measured savings vs doing nothing.

## Phases

| # | Phase | Blocking? | Parallel with | Plan file | Status |
|---|---|---|---|---|---|
| 01 | Data pull, cache, shared types, empty app deployed to Vercel | Yes | none | phase-01-data.md | Done: data pulled and merged (Oct 26) |
| 02 | Congestion index, forecast, storage model, dispatcher, baseline, constraint tests | No | 03 | phase-02-engine.md | Done: engine and 7 tests pass, report.json generated |
| 03 | Traffic report UI (heatmap timeline, schedule view, assumptions panel) on stubbed engine output | No | 02 | phase-03-ui.md | Done: live page built and checked at desktop and phone width. Deployed: https://torus-green.vercel.app |
| 04 | Backtest and evidence page, heat wave scenario | No | needs 02 | phase-04-evidence.md | |
| 05 | AI explanations (cached), seed demo data, README | No | needs 02 | phase-05-explain.md | |
| 06 | Last mile: audit vs brief, persona reviews, UI polish, mobile, deck, recorded backup | | | | |

## Requirements from the brief

Copied from `brief/brief.md` section 6 must haves, 1 to 8.

## Cut on purpose

Auth, multi region, real control, chatbot, anything not on the demo path.

## Time budget (work is Mon to Fri 7 to 3:30)

| Window | Phases |
|---|---|
| Mon night | 01 |
| Tue evening | 02 and 03 in parallel sessions |
| Tue late / Wed morning | 04, 05 |
| Wed after work until 5 PM | 06, deck, rehearsal (confirm if you can take time off Wed) |
