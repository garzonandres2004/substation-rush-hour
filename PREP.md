# UPDATE 2 (after kickoff transcript and Juan's starter kit). This section overrides the older sections below where they disagree.

## A. Facts confirmed at kickoff

| Topic | What was said |
|---|---|
| Money | Torus $5K. Nucleus $10K total, which is Nucleus $5K plus Startup State $5K. That explains the "$5k" typos in the brief |
| Submission | Code in a repo plus a deck. Physical work needs only the presentation. A repo link is enough, no full code review |
| Judging | Wed 5 to 6 PM. Assume you present. Semifinalists get Zero Gravity tickets, winners announced Thu morning on the main stage |
| Registration | Must be in Luma and tell them your team so a judging slot is created. Check this tonight |
| Solo | Allowed |
| Torus judging | Creativity, technical complexity, complete definition (slide says creativity, clarity of insight, execution) |
| Torus extra hint | Relate your project to Torus products or how they would be used in real life. Build a "world model" of the grid or the battery, as real world as possible. Go deep and learn the grid. Rocky Mountain Power deploys Torus modular systems at substations to manage grid traffic, which is the Option 1 story |
| Torus data | Public data or simulated data both fine. They said case studies are on the Torus website. A staffer was going to ask the Torus software person about a demo of their customer battery monitoring software and a deeper real situation. Follow up on that |
| Nucleus | Open call, wants people already passionate about a hard tech idea they will keep working on. Said plainly it is not the pick if you are starting from zero. Matchmaking for people without a team happens after picking a bounty |
| Utah angle | Water, energy, critical minerals, wildfires, aerospace, life sciences were named as state priorities |

Decision: Torus. Nucleus solo from zero is exactly what Angela said not to do. Revised odds guess: Nucleus solo 2 to 3 percent, Torus 10 to 20 percent.

## B. Juan Lizarazo's playbook (what he said, mapped to you)

1. Pick by your skills, not the prize. Warning: if you lack domain feel, AI gives the wrong answer in the same confident voice. You have logistics and dispatch feel but not energy feel, so keep grid math simple, sourced from public data, and verify numbers against EIA or the data itself.
2. Confirm the data and APIs exist before committing (my curl tests in section 6 below).
3. AI is a component, not the architecture. Code does the scoring, forecasting math and scheduling. AI only turns messy text into structured input and explains the result at the end. This makes the demo fast and reliable.
4. Spend about 1 hour on a general plan: brief into the repo, phases, what blocks, what can run in parallel. Do not build during that hour.
5. Build the blocking phase first (setup, data), then run independent phases in parallel in separate sessions.
6. New session per phase. Long sessions drift.
7. Skip subagent driven development (too slow). Use subagents only for parallel work.
8. Tests only for tricky logic, about 20 to 30 percent coverage of the core requirements.
9. Do not over build. If a feature is not in the rubric or said in the Q&A, cut it.
10. Build the thing the sponsor said out loud that is not in the rubric. That is the extra 5 percent. For Torus that is: tie it to the Torus product and make a real world model.
11. Around hour 30: new session scores the build against the brief as a percentage per requirement, then fix gaps.
12. Persona reviews in fresh sessions (staff architect, UX lead, the sponsor).
13. Spend 2 to 3 hours on UI polish after the demo path works. Judges see the UI.
14. Deploy a live URL judges can touch. Keep it deployable at all times.
15. Sleep. He slept a few hours and fixed small things before the 2 PM presentation.

His own caveat: do not start a run, go to bed and hope. It drifts.

## C. The starter kit (github.com/juanlizarazo/hackathon-starter-kit)

I read all of it. It is built for Angular and Firebase, and you use Next/Vercel/Supabase style tools, so use only the framework agnostic parts.

| Keep | Drop or rewrite |
|---|---|
| `AGENTS.md` and `CLAUDE.md` (workflow, phase rules) | `rules/angular.md`, `rules/scss.md`, `rules/firebase.md` |
| `rules/hackathon.md` (scope, demo polish, last mile) | `rules/ui.md` (Angular Material specific) |
| `rules/ai.md` (AI at the edges, cache AI results for the demo) | `rules/typescript.md` (optional, has Firestore namespace) |
| `rules/git.md` (note: it says no Co-Authored-By trailers) | |
| `brief/brief.md`, `brief/pick-a-bounty.md` | |
| `plans/00-general.md`, `plans/phase-template.md` | |
| `prompts/01` to `07` (research, general plan, phase plan, parallel, audit, persona review, UI polish) | |

Plugins it enables: superpowers, frontend-design, code-review. Skip superpowers subagent-driven-development and test-driven-development, as the kit says.

Note: his `HACK-22` says live URL, not a video or slides. Torus said code plus deck. Do both: live URL for the demo, repo and deck for submission.

## D. Torus Option 1 plan, revised with what they said

Working name: Substation Rush Hour.

| Field | Detail |
|---|---|
| Frame | Grid as a supply chain with congestion. You dispatch a Torus style storage system (battery plus flywheel) at a Utah substation to stay out of traffic |
| World model | Hourly demand and generation for Utah (PacifiCorp East balancing authority) plus Utah weather, a simple storage model with power, energy, efficiency and response limits, clearly labeled assumptions |
| Core output | "Tomorrow's grid traffic report": expected congested hours, a charge and discharge schedule, dollars and carbon saved vs doing nothing, with a backtest on past days |
| AI use (edge only) | Plain English explanation of each decision, and optionally natural language to scenario input. All math and scheduling in code |
| Torus tie in | Cite what Torus Station does (flywheel fast response, batteries 4 to 8 hours) as the asset you are modeling. Confirm specs from their site before using any number |
| Out of scope | Auth, billing, multi region, real device control, any claim you cannot back with data |
| Rating | Viability 8/10, originality 5/10, win odds about 15 percent. The depth of the world model and honest backtest are what raise it |

Option 2 is the broader, more AI infrastructure flavored one and most software teams will go there. Stay on Option 1 unless the Torus staff answer changes your mind.

Things to verify before you commit (I could not reach the data from my side):
1. Hourly data for PACE (Utah) on EIA's electricity API (free key). Pull one day.
2. Whether CAISO OASIS has usable prices for a PacifiCorp node. If not, use EIA data plus a clearly labeled price proxy.
3. Open-Meteo for Utah weather (no key).

## E. Tonight, in order

1. Confirm Luma registration and tell them solo and Torus.
2. Run the three data checks above. Choose data by what works in 20 minutes.
3. Copy the framework agnostic kit files into this folder, fill `brief/brief.md`, then run the 1 hour general plan.
4. Ask the Torus staff the questions in section 5 below, plus: any real Torus case study numbers or demo access, and who judges.
5. Sleep. Tue morning: start phase 1 (data and shared types).

Not received: the second Perplexity answer was not in the file you attached, only the kickoff transcript. Paste it if you want me to fold it in.

---

# Original prep (Mon 5:35 PM). Older sections follow; where they conflict with the update above, the update wins.

# Hard Tech Hackathon: Prep Sheet (written Mon Oct 26, 5:35 PM)

Sources: your Perplexity chat (res.md), the Nucleus bounty brief (docx), and the kickoff slides (pptx). Judging is Wed Oct 28, 5 to 6 PM, about 47 hours from now.

## 1. What the real briefs say vs what Perplexity guessed

| Item | Perplexity guess | Actual brief |
|---|---|---|
| Torus ($5K) | Energy data: dashboard, optimizer, anomaly detection | Right. Two options, both energy data software (below) |
| Nucleus ($10K) | Talent, workforce, matching tools | Wrong. It is an open call for a hard tech idea that already has something concrete built |

## 2. The two bounties side by side

| | Torus $5K | Nucleus + Startup State $10K |
|---|---|---|
| What you build | Software on public energy data | A hard tech concept (AI infra, energy, cyber, defense, aerospace, life sci) that moved past concept |
| Option 1 | "Rush Hour for Electrons": software that knows when the grid is jammed and stays out of traffic (navigation app for electricity, traffic report for tomorrow's grid, agents that schedule around clean power) | |
| Option 2 | "Compute Follows the Sun": AI jobs that decide where and when to run for cheapest and cleanest power (job router, agents that bid for clean slots, live map of where to train) | |
| Data | EIA, CAISO, ERCOT, Open-Meteo, Electricity Maps, NREL, NASA POWER, cluster traces. Free and open source only. Simulated data is fine if labeled | None provided. You can build on prior work but must show what you did this week |
| How judged | Creativity, clarity of insight, execution. Not expected to be grid experts | Progress beyond concept 30%, path to reality 25%, hard tech depth 20%, Utah impact 15%, team and pitch 10% |
| Required deliverables | Not listed on the slide. Ask | Working prototype or simulation, 5 slide max deck, one page plan, optional 2 min video |
| Fit for you | Strong. Software only, data shaped, you build with AI | Weak solo. Rewards real engineering or a prototype, which you do not have |

## 3. My read (honest, these are guesses)

1. Torus is your lane. Software, public data, labeled simulation allowed, judged on insight and execution.
2. Nucleus solo is a stretch. Hard tech depth (20%) plus progress beyond concept (30%) is half the score, and you have no hardware or research behind it. Rough odds solo: 3 to 5 percent.
3. Torus odds if executed well: roughly 10 to 20 percent. Most software teams will pick Torus, so expect a crowd. Execution and a sharp insight are what separate you.
4. Option 2 (compute follows the sun) is the more obvious one and the one most teams will take. Option 1 is more open, and it maps to your logistics background.
5. The only good Nucleus play is joining a team that already has a hardware or science prototype, where you own path to reality, Utah impact and the pitch (50% of the score). Use the open floor tonight to check if that exists. Do not chase it past tonight.
6. Ask whether you can enter both bounties. Judges are different, so it may be allowed.

## 4. Idea record: Grid Dispatch Board (Torus Option 1)

Pitch frame: the grid is a supply chain with congestion. You are doing dispatch and routing for electricity, which is your field.

| Field | Detail |
|---|---|
| User | A flexible load operator (data center, cold storage, EV fleet) and Torus style storage that must decide when to charge and discharge |
| Core insight | Show tomorrow's grid "traffic report": which hours are congested, what they cost, how dirty they are, and one concrete schedule that avoids them |
| Hardest thing that must work | Real public price and demand data in, forecast for the next 24 hours, a schedule out, and a measured saving vs a naive "run anytime" baseline |
| Link to Torus | Their pitch is flywheel plus battery under one software layer. Frame your scheduler as the decision layer for storage dispatch and demand response, so Nicole Witmyer sees her product in it |
| MVP (Tuesday) | One region (CAISO or ERCOT), 24h forecast, congestion/price heatmap, a scheduler for a 1 MW flexible load, savings in dollars and kg CO2 vs baseline |
| Skip | Auth, billing, mobile, multi region, anything that is not on the demo path |
| Rating | Viability 8/10. Originality 5/10 (carbon aware scheduling exists, so the edge is the logistics framing and honest measured savings). Win odds about 15% |
| Better version | Add a "why" panel per decision (price spike, solar drop, ramp) and a backtest on the last 30 days. Judges score clarity of insight, and a backtest is real evidence |

## 5. Questions to ask staff tonight (ranked)

Torus (Nicole Witmyer or team):
1. What do the judges weigh most between creativity, insight and execution? What must work Wednesday?
2. What is the required submission: live demo, repo, deck, video?
3. Can one team enter Option 1 and Option 2, and can we also enter Nucleus?
4. Is simulated data fine for storage assets (flywheel, battery) if we label it? Any real Torus specs we may use?
5. Slot length and format on Wednesday, and any submission cutoff before 5 PM?

Nucleus (Angela Smith, angela@nucleusutah.org):
1. Scope item 3 and the criteria say "$5k" but the bounty is $10K. Which number do you want us to plan around?
2. Is software only with simulated data acceptable for "hard tech", or do you need physical hardware?
3. Do teams on this bounty need to be pre registered for judging?

Brief conflict to clear up: the docx lists judges Angela Smith, Tyler Jennings, Cam Dionne, Dylan Doty. The slides list Ryan Byrd, Angela Smith, Nicole Witmyer, Scott Holley, Tanner Potter. Ask who actually judges which bounty.

## 6. Next 60 minutes (de risk before building)

1. Test the data on your Mac first. I could not reach these from my side. Run:
   - `curl -s "https://api.open-meteo.com/v1/forecast?latitude=40.7&longitude=-111.9&hourly=shortwave_radiation,temperature_2m&forecast_days=2" | head -c 400`
   - CAISO OASIS day ahead prices (no key): `curl -s -o lmp.zip "https://oasis.caiso.com/oasisapi/SingleZip?queryname=PRC_LMP&startdatetime=20261024T07:00-0000&enddatetime=20261025T07:00-0000&version=1&market_run_id=DAM&node=TH_NP15_GEN-APND&resultformat=6" && unzip -l lmp.zip`
   - EIA needs a free API key (register at eia.gov/opendata). Get it now.
2. Pick the region by which source gives you clean hourly data in 20 minutes. Do not debate it.
3. Write the one page goal file: user, input, output, the one thing that must work, acceptance tests, allowed simulations, non goals, done means.
4. Decide Option 1 vs 2 after the staff answers.

## 7. Clock to Wednesday 5 PM

| Block | Goal |
|---|---|
| Mon night | Data pulled and parsed, baseline schedule computed, goal file written |
| Tue | Forecast plus scheduler end to end, one dashboard screen, backtest numbers |
| Tue night | Something you could present right now. Deploy it |
| Wed morning | Improve evidence only (backtest, explanations). No new features |
| Wed 1 PM | Feature freeze. Clean run from scratch, screen recording as backup |
| Wed 3 PM | Rehearse 3 times at the slot length |

Your work schedule (Mon to Fri 7 to 3:30) cuts Tue and Wed daytime, so plan Tuesday and Wednesday morning around that. Tell me your real free hours and I will rebuild this table.

## 8. Judging slot lengths (from the brief)

| Teams on the bounty | Time per team |
|---|---|
| 2 | 25 min |
| 3 | 16 min |
| 4 | 12 min |
| 5 | 10 min |
| 6 | 8 min |

Prepare an 8 minute version that includes questions, so about 5 minutes of demo.

## 9. Demo structure (5 minutes)

1. 20 sec: the problem in one sentence, as a dispatch problem
2. 2 min: live demo, tomorrow's grid traffic report then the schedule it produces
3. 1 min: measured result vs baseline, from the backtest
4. 1 min: how it works and one design choice you made
5. 30 sec: what is simulated, what is real, and the next step

Say clearly what is simulated. It protects trust and Torus already allows it.

## 10. Corrections to the res.md advice that now matter

1. "Live URL is the deliverable": the Torus slide does not say. Ask before assuming.
2. Skip gstack, brag and Graphify unless you already have them working. Your setup script already installs Node 22, Playwright, Vercel and Supabase CLIs. That is enough.
3. Nucleus "talent matching" idea is dead. The real brief is an open hard tech call.

---
# UPDATE 3 (Mon 6 PM): decision made

Decision: Torus Option 1, solo. Project scaffold created: `AGENTS.md`, `brief/brief.md`, `plans/00-general.md`, `rules/`, `prompts/prompts.md`, `scripts/check-data.sh`.
Second Perplexity answer read. Corrections: it says the Torus slide shows $10,000, but the slide says $5K Torus and $10K Nucleus. Its useful additions are folded into the brief: congestion must be modeled separately from price, do not model a flywheel as a generic battery, tests target validity (capacity limits, units, baseline, savings not caused by doing less work), and an AI audit score is not a predicted win.
Also from your own kit: Wed 5 PM is the EWB WinCo deadline. Do that Tue evening or Wed morning, not at judging.
