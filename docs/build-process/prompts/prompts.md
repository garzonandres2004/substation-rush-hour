# Prompts (adapted from the kit's prompts folder)

## General plan (new session, brief attached)
Read brief/brief.md and AGENTS.md. Refine plans/00-general.md. High level phases only, designed to run in parallel, mark the blocking phase first, copy requirements verbatim, list what we cut. Everything must trace to the rubric or demo path. Do not write code.

## Phase plan and build (new session per phase)
Read brief/brief.md, plans/00-general.md, AGENTS.md, then only the rules files this phase needs. Write plans/phase-##-name.md from plans/phase-template.md. Then build it. Use subagents only for independent parts. Run the app, walk this phase's demo path, report what you clicked and saw.

## Parallel phases
We build phase ## only. Other phases are built in parallel branches, so do not touch files outside: [folders]. Read the brief, general plan, this phase plan and AGENTS.md.

## Audit (fresh session)
Read brief/brief.md and plans/00-general.md. For every requirement: score 0 to 100 percent, where it lives, what is missing. Output a table: requirement, implemented capability, evidence, limitation, next action. Also list unreachable screens, broken flows, missing states, mobile problems. Ranked fix list weighted by the rubric. Fix nothing yet. Note: a high score is not a prediction of a win.

## Persona reviews (new session each)
1. Staff architect: structure, bugs, security, anything a technical judge would wince at.
2. UX lead: use the live URL, tear apart confusing flows and weak hierarchy, check 375px.
3. Torus: You are Torus and wrote this brief. Does this solve the problem? What looks subtly wrong to someone who knows the grid and storage?

## UI polish (after demo path works, 2 to 3 hours)
Use the frontend-design skill. Refine the demo path screens: clear hierarchy, one primary action, consistent spacing and type, loading/empty/error states, 375px, nothing that reads as a default template. Do not change behavior. Show before and after screenshots.
