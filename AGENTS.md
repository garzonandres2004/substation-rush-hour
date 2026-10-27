# AGENTS.md

## Project

**Substation Rush Hour** is a TypeScript web app (Next.js on Vercel) built for the Hard Tech Week Hackathon, Torus Option 1 "Rush Hour for Electrons". It builds tomorrow's grid traffic report for Utah and dispatches a modeled battery plus flywheel storage system to stay out of congestion. All math and scheduling is code. AI only explains results at the edge.

Read `brief/brief.md` before touching any feature. Read `plans/00-general.md` to see which phase is blocking.

## Hackathon mode

Ship the demo, not the test suite. `rules/hackathon.md` overrides any stricter rule. Load `rules/ai.md` for any feature that calls a model.

## Agent workflow

1. No subagent driven development. Subagents are only for parallel independent work.
2. General plan lives in `plans/00-general.md`: phases only, blocking phase first.
3. Deep plan one phase at a time in `plans/phase-##-name.md`, as a checklist.
4. One phase per session: plan, build, walk the demo path, commit when asked. New session for the next phase.
5. At the start of a phase read the brief, the general plan and that phase plan. Not the whole repo.

## Universal rules

1. Only commit or push when explicitly asked.
2. No secrets in the repo. Use `.env.local` (gitignored) and Vercel env vars.
3. Every number shown to a judge is labeled measured, estimated, or assumed. Never present a simulation as real device behavior.
4. Do not model a Torus flywheel as a generic battery and imply it is Torus hardware. Parameters are labeled assumptions with a source link.
5. Keep the app deployable at all times.
6. Newline at end of files.
