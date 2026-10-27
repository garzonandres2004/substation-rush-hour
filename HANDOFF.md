# HANDOFF: read this first in a new session

Project: Substation Rush Hour. Solo entry by Andres, Hard Tech Week Hackathon, Torus bounty Option 1 "Rush Hour for Electrons" ($5K).
Folder: /Users/andres/Desktop/utahtechweek
Repo: https://github.com/garzonandres2004/substation-rush-hour
Live: https://torus-green.vercel.app (Vercel project torus, redeploy with `npx vercel --prod` from the project folder)

## Deadlines
Judging: Wed Oct 28, 5 to 6 PM, Aernata, 250 E 200 S, Salt Lake City. Winners Thu Oct 29, 9:15 AM, main stage.
Submission for Torus: code in a repo plus a deck presented to sponsor judges. Luma registration is done.
Judges: Ryan Byrd, Angela Smith, Nicole Witmyer (Torus), Scott Holley, Tanner Potter.
Rubric: creativity, technical complexity and clarity of insight, execution and complete definition. Relate to Torus products.
Other deadline: EWB WinCo, Wed 5 PM (Andres handles it himself).

## Andres availability
Fully free from now until judging. All in on this challenge. Wants honest "this is a stretch" flags and numbered steps. Writes no dashes as punctuation.

## What is done (phases 01 to 04)
- Data: EIA (PACE demand, forecast, fuel mix), Open-Meteo weather, CAISO day ahead prices for two PacifiCorp nodes incl. congestion. Pulled by scripts on Andres's Mac (cloud shell has no internet).
- Engine in src/engine: own demand forecast (MAPE 5.0% vs EIA 8.6%), solar and wind models, stress index, exact DP dispatcher with substation capacity limit, scoring, tests.
- UI: Next.js dashboard with route strip, charts, scenario toggle (normal, transformer out), strategy toggle (stress aware, price only), turn by turn steps, results, backtest table, real/modeled/assumed section.
- Deployed and verified publicly. README.md written. Git initialized, pushed to GitHub. Last README commit may still need `git add README.md && git commit -m "Add README" && git push` by Andres. HANDOFF.md also needs committing.

## Key facts and honest limits
- Battery 10 MW / 40 MWh, RTE 88%, SoC 10 to 95%, start and end at 50%. Substation peak scaled to 100 MW from PACE demand. Capacity limit = P95 of trailing 30 days.
- October never overloads without storage, so the overload story rests on the transformer out (derate) scenario.
- Assumptions: battery size, capacity limit, substation scale, stress premium ($20/MWh), cycle cost ($3/MWh).
- Flywheel not modeled (say so). Weather in backtest is archived data. Value is day ahead settlement style, not a profit forecast.
- AI only at the edges (planned plain English explanations). All decisions are code.

## Remaining work
Phase 05 polish and story
1. Plain English explanations per hour (AI at the edge, cached in report.json, not live calls).
2. Seed or confirm demo data, so the site never shows empty states.
3. README is done; add repo link to brief/brief.md.
Phase 06 ship
1. Audit build vs brief/brief.md must haves 1 to 8, as a percentage per item, in a fresh session.
2. Persona reviews: staff architect, UX lead, Torus judge. Fix the top findings.
3. UI polish pass (2 to 3 hours), mobile check, deploy.
4. Deck: 5 minute demo structure, relate to Torus products (flywheel storage, Nucleus), honest limits slide.
5. Recorded backup demo video. Rehearse at 5, 8 and 25 minute lengths (slot length depends on number of teams).
6. Questions to ask Torus staff at the venue: specs or case studies or demo access, final rubric and submission details, can one entry go for both bounties.

## Suggested schedule (Mon night to Wed)
- Mon night: commit and push, start phase 05 (explanations, brief update).
- Tue morning: audit and persona reviews, fix findings.
- Tue afternoon: UI polish, mobile, redeploy.
- Tue evening: deck draft and demo script.
- Wed morning: backup video, rehearsals, final redeploy, final check of live URL and repo, ask Torus staff questions if at the venue.
- Wed afternoon: arrive early at Aernata, set up, judging 5 to 6 PM.

## Working rules
- Read AGENTS.md, rules/hackathon.md, rules/ai.md and plans/00-general.md.
- One phase per session. Do blocking work first, parallel work after. Minimal tests. Do not overbuild.
- Never commit .env.local (EIA key). It is gitignored.
- Do not commit or push unless Andres asks.
- Cloud shell has no internet beyond package registries. Network scripts run on Andres's Mac.
- The device shell cannot clean git temp files; let Andres run commits in his own Terminal.

## Paste this to start the next session
"Read HANDOFF.md in /Users/andres/Desktop/utahtechweek, then plans/00-general.md and brief/brief.md. We are on phase 05. I am fully free until judging Wednesday 5 PM. Start with the plain English explanations and the brief update, then move to the phase 06 audit."
