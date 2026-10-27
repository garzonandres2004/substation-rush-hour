# HANDOFF: read this first in a new session

Updated Tue Oct 27, 1 PM MDT. Supersedes every earlier version.

Where this file lives: on GitHub, branch `deeper-model` (readable from any session, even with the Mac off), and as an uncommitted copy in the Mac folder. `main` on GitHub still has the old HANDOFF.md. Andres is away from his computer until tonight, so he cannot run git; a cloud session can clone the repo and work on the branch. No merge into main without Andres's explicit yes.

Project: **Substation Rush Hour**. Solo entry by Andres, Hard Tech Week Hackathon, Torus bounty Option 1 "Rush Hour for Electrons" ($5K).
- Folder: /Users/andres/Desktop/utahtechweek (branch `main`)
- Repo: https://github.com/garzonandres2004/substation-rush-hour (public)
- Live: https://torus-green.vercel.app (refreshes itself daily)
- Deck: https://claude.ai/artifact/F2MUmyEM8aZNB9mbTTekqs (Slides artifact, 11 slides, speaker notes are the script)
- Lab branch: `deeper-model` (deeper analysis, NOT deployed, main untouched)
- Q and A prep: plans/demo-and-qa.md

## Deadlines and judging
- Judging Wed Oct 28, 5 to 6 PM, Aernata, 250 E 200 S, Salt Lake City. Prelims, then semifinalists present. Winners Thu Oct 29, 9 AM, Zero Gravity main stage.
- Submission: public repo plus deck. Luma registration done (Torus bounty, solo).
- Judges: Ryan Byrd, Angela Smith, Nicole Witmyer (Torus), Scott Holley, Tanner Potter.
- Criteria said aloud by Chandler (Torus): creativity, technical complexity, complete demonstration. Slides: creativity, clarity of insight, execution. "We care more about engineering skill and creativity." Free and open data only; simulated data fine if labeled.
- Unwritten extra (Chandler): relate it to Torus products and how they are used in real life; build a world model of the grid or battery as real as possible.
- Juan's tip from the launch: win the part sponsors mention out loud that nobody builds; "AI is a component, not the architecture."

## How Andres works
- Wants honest probability and "this is a stretch" flags, numbered steps, tables.
- Never use dashes as punctuation in anything written.
- Andres runs git himself in his Terminal. Only commit or push when he asks. Never commit .env.local (EIA key).
- Claude must never type API keys, tokens or passwords into web forms; Andres does that.
- Rotate the Vercel token after the hackathon (it was pasted in chat).

## What the main page does (live)
1. Tomorrow's grid traffic index for PacifiCorp East: 30 percent demand, 30 percent net load, 20 percent evening ramp, 20 percent day ahead price, each a percentile of the last 30 days. Jam at 65 of 100.
2. Exact dynamic programming plan for a modeled 10 MW / 40 MWh battery, replanned every hour from the last hour's forecast miss, plus a real time guard on the meter. Substation = PACE demand scaled to 100 MW, limit = 95th percentile of the last 30 days.
3. Plain English reason per step: Gemini writes daily, code checks every number, falls back to Claude texts or plain numbers.
4. Evidence: backtest graded on real demand, robustness panel ("How sure are we"), capacity unlocked (moving and fixed limit, summer July and August), minute level Station model (Spin flywheel plus Pulse battery, simulated AI load), Torus fit, real versus modeled.
5. Polish: hero cards (before to after), live data badge, sticky section nav, Biome lint and format (`npm run lint`), npm audit 0 vulnerabilities.

## Daily refresh (GitHub Actions, .github/workflows/daily-refresh.yml)
Runs 21:30 UTC (3:30 PM MDT) and on manual "Run workflow". Pulls EIA and CAISO, runs tests, capacity, station, engine, Gemini explanations, checks the forecast date, commits public/data, deploys with the Vercel CLI. Secrets set: EIA_API_KEY, GEMINI_API_KEY, VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID. A full run takes about 15 minutes.

## Numbers: live page versus deck (they drift daily)
The backtest window grows one day per refresh. Live page on Oct 27 = 31 days (Sep 26 to Oct 26). Deck and video were made on 30 days.

| Number | Deck | Live Oct 27 |
|---|---|---|
| Plan once, days over | 8 of 30 | 8 of 31 |
| Replan alone, days over | 9 of 30 | 9 of 31 |
| Replan plus guard, days over | 0 | 0 |
| Follows price only, days over | 10 of 30 | 11 of 31 |
| EIA forecast, plan once / guard | 11 / 0 | 12 / 0 |
| Value per day, ours | $314 | $319 |
| Jam relief ours vs price plus guard | 12.1 vs 4.8 | 12.0 vs 4.6 |
| Minutes over, hourly plan only (inside the hour) | 2,438 | 2,506 |
| Capacity, 10 MW 4 h, moving limit | 1 to 5.75 MW | same |
| Fixed rating capacity | 3.75 to 8.25 MW | same |
| Summer capacity | 7.25 MW | same |
| Forecast error ours vs EIA | 5.0 vs 8.6 percent | same |

**Wednesday morning task:** after the last refresh (or freeze), update the deck and plans/demo-and-qa.md to match the live page exactly. Check every row above plus the demo slide's jam hours.

## Deliverables in hand
- Deck artifact (11 slides): cover, problem, built, demo, guard (Finding 1), capacity (Finding 2), inside the hour (Finding 3), tradeoffs, Torus fit (Torus's own 4 congestion steps, Lasso forecast scheduling), vision (a Torus operator's day, planning view in Lasso), limits and pilot ask. To edit: Artifact tool, read the URL, then publish to the same URL.
- Backup videos, sent in chat: substation-rush-hour-demo.mp4 (94 s, v1) and substation-rush-hour-demo-v2.mp4 (100 s, framed window, auto zoom, chapters, captions under the page). Tools to re-record: scripts/video (see its README). Captions read numbers from the page, so re-record if the jam hours change.
- plans/demo-and-qa.md: 5 minute flow, 19 hard questions with answers, "Do not say" list, venue questions.

## Lab branch `deeper-model` (all free, open data; nothing deployed)
New page /lab (src/components/Lab.tsx, YearLab.tsx), scripts lab.ts, lab-year.ts, lab-capacity-year.ts, src/engine/thermal.ts. Data pulled by branch-only workflows (.github/workflows/lab-data.yml, lab-gpu.yml) into lab-data/, because the cloud shell only reaches GitHub. Raw lab data unpacks to data/lab-raw (gitignored).

Findings:
1. **A year walked forward** (359 days, Oct 31 2025 to Oct 26 2026), planned each night on the weather forecast as issued (Open-Meteo previous runs), battery charge carried day to day, nothing tuned: our plan pushed the substation over its limit on **0 of 359 days**; plan once 63; follows price only 63 of 178. Before May 2026 there are no day ahead prices (PacifiCorp joined CAISO EDAM in 2026), so winter runs on traffic only, no dollar values.
2. Forecast on issued weather: ours 5.3 percent error vs EIA 7.4 (May to Oct); 3.7 vs 3.7 (winter). Removes the observed weather caveat.
3. The substation was over its own 30 day limit on 110 days (the limit lags load climbing into a season). Ours fully covered 82 of 110 and cut that overload energy about in half.
4. **Capacity all year**, substation rated for its own annual peak (100 MW = Jul 20, 2026): 0 MW without storage; 10 MW 4 h Station **7 MW** (five line rule 4.75); 2 h 4.75; 8 h 9.75. Binding days Jul 20, 13, 21.
5. **Real GPU power** (MIT Supercloud, 44 labelled training jobs, 22 models, nvidia-smi every 100 ms, CC BY-NC-ND so summary statistics only): swings repeat every ~5 seconds, 26 percent of peak in a typical minute, 58 percent in the busiest. Our simulation had the size and frequency right but the speed wrong (minutes). Flywheel job is power not energy: about 1.8 MW, 1.3 kWh per swing for a 5.75 MW synchronized site (estimate). Independent jobs smooth out (8 to 4 percent max minute step), one big synchronized run does not.
6. On the main page's 30 days: confidence ranges (index adds 5.2 to 9.5 MWh a day of jam relief, ahead in 100 percent of resamples; guard overload rate under 9 percent at 95 percent confidence); utility event readiness (ours ready 30 of 30; five line rule never fully); margin versus guard (a margin needs the 99th percentile of misses to reach 0 days and costs $169 a day more than the guard); transformer heat model IEEE C57.91 (mixed: room without storage drops on warm days, with the Station 8.75 vs 8.25 MW).
7. Planner bug found and fixed on the branch: when the end of day charge target is unreachable, aim for the nearest reachable charge. Main page numbers verified identical with and without it.

**Decision pending (Andres):** keep the lab as Q and A backup, or merge `deeper-model` into `main` so /lab goes live. Merge is low risk (separate page, main numbers unchanged). Strongest talk line: "We walked the same plan forward over a full year of real days on real forecasts: it never once pushed the substation over its limit."

## Remaining tasks, in order
1. Decide the lab merge (Andres said: no merge yet). If yes: merge `deeper-model` into `main`, push, let the daily refresh deploy, check /lab live. Consider one deck line or a backup slide for the year result.
2. Rehearse twice with a timer (11 slides, 5 minutes; if long, cut slide 9 to its title sentence). Keep the v2 video on the laptop.
3. Wednesday morning: sync deck and Q and A numbers to the live page (table above).
4. At the venue: ask whether Lasso is the screen customers open daily; ask what Torus would need to run this on one real feeder.
5. After the hackathon: rotate the Vercel token; lab follow ups (transformer heat over the full year, second by second Station model calibrated to the GPU statistics, real feeder data).

## Technical gotchas
- Cloud shell internet: only GitHub and package registries. Use GitHub Actions workflows to pull open data (they have full internet and the EIA secret).
- Andres's Mac folder through the device link: git there leaves .lock files because deletes are blocked. Do not run git on the device; Andres runs git in his Terminal. If a stale lock appears, move it under .git with a new name.
- esbuild platform mismatch in the Mac node_modules when run from the cloud: run builds in a cloud clone instead.
- `pkill` can kill the shell itself; start servers on new ports instead.
- Engine tests: `npm test` (10 tests). Typecheck: `npx tsc --noEmit`. Lint: `npm run lint`.
