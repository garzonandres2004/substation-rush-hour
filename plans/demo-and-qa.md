# Demo script and Q and A prep

## 5 minute flow (deck: Substation Rush Hour, 11 slides; speaker notes carry the full script)
1. Cover, 15 s.
2. Problem, 30 s: new load arrives faster than new wires; the limit is real (Rocky Mountain Power allows 105 percent of nameplate in summer, 120 in winter); price following charged into the limit on 11 of 30 days.
3. What we built, 20 s.
4. Live demo, 90 s: jam 5 PM to 7 PM, tap a step for the why; Follows price only shows red overload; Capacity cut 10% shows the battery holding the line; scroll to the three cards.
5. Finding 1, 40 s: planning once overloaded on 8 of 30 real days; replanning alone 9; margin 3 at $85 a day; replan plus real time guard 0 at about $10 a day.
6. Finding 2, 40 s: 1 MW to 5.75 MW of new load with a 10 MW, 4 h Station; fixed rating 2.75 to 7.5 MW; five line rule 5.25 MW, most room is the Station.
7. Finding 3, 40 s: hourly plan hides 2,362 minutes above the planning limit; battery alone 0 minutes but 61 power changes a day; 3 MW flywheel plus battery 0 and 12.
8. Tradeoffs, 20 s: index buys 7.3 MWh a day more jam relief for $12 a day.
9. Torus fit, 20 s: Torus schedules Stations against forecasts for smaller utilities and co ops; this is that schedule plus a guard, in Torus's own four congestion steps.
10. Vision, 20 s: three daily questions, a planning view in Torus Lasso.
11. Where the evidence stands, 25 s: verified, tested on real history, validated on a real feeder is next. Then the narrow ask: one anonymized feeder load trace, its limit and the Station's constraints, or run our schedule on a private case.
If over time: cut slide 9 to its title sentence; the vision slide covers the fit.

## Hardest questions
1. "Your substation is system load scaled to 100 MW and the limit moves with its own load. What congestion did you model?"
   Two signals on purpose: grid traffic is a soft cost, the local limit is a hard rule held first. We also ran one fixed rating (92.1 MW): 2.75 to 7.5 MW. A real feeder's load and rating only swap the inputs. And real limits exist: Rocky Mountain Power told the Utah PSC its guidelines allow a substation to load to 105 percent of nameplate in summer and 120 percent in winter (response to Vote Solar data request 7.2, docket 17-035-61, Oct 2019).
2. "A transformer does not trip on one minute over nameplate."
   Agree, and Rocky Mountain Power's own guideline already allows 105 percent of nameplate in summer and 120 percent in winter. The worst minute is 1.25 MW, about 2 percent. The point is who absorbs a 4.9 MW a minute swing all day. The battery can, but it changes power 61 times a day instead of 12. Spin for power, Pulse for energy.
3. "Who gets paid the $319 a day? Wattsmart Stations are under utility dispatch."
   Price is a stress signal, not a revenue pitch. The value is capacity on the same wires. Under Wattsmart, jam hours are candidate event windows.
4. "30 autumn days. What is the number in July?"
   We ran it: July and August, 61 days, substation rated for its summer peak, planned on EIA's own day ahead forecast (8.7 percent error over those summer days, a real forecast). The 10 MW, 4 h Station lets it take 7.25 MW of new load; the five line rule gets 5.25 MW. A substation rated only for autumn load would go over on 58 of 61 summer days, and one Station only cuts that to 51: storage adds room, it does not replace a rating sized for summer.
5. "Your battery discharges in the morning when nothing is jammed and sits at the limit all afternoon."
   The plan must end the day half full and 6 PM scores higher than 5 PM. A headroom rule (charge only to 90 percent of the limit) is a one line change with a measurable cost.
6. "So you fixed a problem your own battery created?"
   Yes. Any battery charging near a limit can create one. Planning alone let it happen on 8 of 30 real days; the guard makes sure it never does.
7. "Turn off the traffic index. Do you still get zero overloads?"
   Yes, the guard holds the limit either way. The index decides the rest of the day: 11.8 MWh a day of jam relief vs 4.5 for price plus the same guard, for $12 a day. On these 30 days; over the full year it is about 1.2 times, see 22c.
8. "Did your forecast see tomorrow's weather?"
   In the backtest, yes, observed weather. So beating EIA (5.0 vs 8.6 percent) is an upper bound, and the page says so.
   Follow up: we also re-ran a full year on weather forecasts as issued (Open-Meteo previous runs): 5.3 vs 7.4 percent for EIA from May to Oct, still ahead. In winter it is a tie, 3.7 vs 3.7. Lab branch work, public in the repo, not on the live page.

9. "Why not just follow prices? Prices already include congestion."
   Wholesale prices are hub level, not feeder level, and most facilities pay flat or time of use rates that do not reflect a local limit. A limit is physical: no price tells you this substation cannot deliver. Our data shows it: follows price only overloaded on 11 of 30 days. (Point from the earlier research.)
10. "Doesn't Tesla already do this?"
   Tesla's dispatch software optimizes battery revenue for Tesla hardware. We plan a substation against its limit and size the storage for new load. Do not quote Tesla fleet numbers unless verified.

11. "Did you tune anything on the test period?"
   Be exact. The index weights were fixed in the first engine build, before any backtest, and other weightings give the same result: equal weights 11.8 MWh a day of jam relief, demand heavy 11.9, no price at all 12.7, ours 11.8, zero overload days in every case. The guard is different: it came from our first version failing on these same 30 days. So we checked it on data it never saw: EIA's own forecast instead of ours (0 days over), and 61 summer days. The guard has no tuned parameter; the limit is the limit.

12. "Where does the $20 stress premium come from? At $5 does your plan still win?"
   It is an assumption, and the limit does not depend on it: the guard holds 0 days at $0, $5, $10, $20 and $40. The premium only buys jam relief: 4.5 MWh a day at $0, 8.7 at $5 (no cost), 11.8 at $20 ($12 a day). Two separate claims: the guard holds the limit, the index moves relief into the jam.
13. "With a real forecast, does 8 to 0 hold?"
   Yes. Planned on EIA's own day ahead forecast instead of ours: plan once 12 of 30 days over, replanning alone 11, replanning plus the guard 0, at $319 a day. Summer used EIA's forecast too.
14. "Which limit is which? I see 81.5, 73.3, 92.1, 90.4, 119."
   Each day's limit is the 95th percentile of its last 30 days of load: tomorrow 81.5 MW, 73.3 with the 10 percent derate, Oct 5 (the minute chart) 90.4. The capacity test also uses one fixed rating, 92.1 MW. Summer is rated for the July peak, 119.0 MW. The page explains it under What is real and what is modeled.

15. "Pulse is 0.5C, about 2 hours at rated power. Why model a 4 hour Station?"
   Torus's CEO at the 2025 Battery Show described "a 2 hour or 4 hour dispatchable product" for data centers and utility capacity, so we test both. Station sizes are modeled, not Torus specs, and the page says so. The 10 MW, 2 h row is the native 0.5C ratio and gives 4 MW of new load. The 4 h case is 40 MWh of Pulse behind a 10 MW connection. Stored energy matters most here: the crunch is a long afternoon plateau.
16. "Wattsmart dispatches under 1 percent of hours. Your plan acts every day?"
   Torus's CEO said Stations are dispatched "right off the transmission services desk" like a modular power plant, over 300 times last year. Utility events come first. The plan runs the other hours and keeps energy ready for the next event. That is the dual use Torus describes: behind the meter assets keep serving the host between events.
17. "How does this relate to Lasso?"
   Torus says smaller utilities and co ops let Torus schedule against forecasts through Lasso. This is that forecast schedule, plus a guard for when the forecast is wrong. It is a concept on public data; there is no public Lasso API and no integration.
18. "How did you think about risk?" (only if asked; analogy from trading)
   The guard is the stop loss: it acts on the meter no matter what the plan said. The forecast miss is the slippage. The stress premium is the risk appetite: how much jam relief to buy.
19. "What would you validate next?"
   "A full year walk forward test: calibrate on one season, test on the next, including winter peaks, with weather forecasts as they were issued instead of observed weather. Then sweep weights, premium, Station size and charge bounds and report the whole grid, not one best number."
   Partly done on the lab branch: see 20 to 22. The sweep of weights, premium and Station size is still open.

## Year walk forward answers (lab branch deeper-model, not on the live page)
20. "Does it hold over a full year, not 30 autumn days?"
   We walked the same plan forward over 359 days (Oct 31 2025 to Oct 26 2026), planned each night on the weather forecast as issued, battery charge carried day to day, nothing tuned. Our plan pushed the substation over its limit on 0 of 359 days. Plan once: 63. Follows price only: 63 of 178. Limits: before May 2026 there are no day ahead prices (PacifiCorp joined CAISO EDAM in 2026), so winter runs on traffic only with no dollar values. The substation is system load scaled to 100 MW, not a real feeder. Also, the 30 day limit lags load climbing into a season: the substation was over its own limit on 110 days, ours fully covered 82 of them and cut that overload energy about in half.
21. "What is the capacity number all year, not just autumn or summer?"
   Substation rated for its own annual peak (100 MW, Jul 20 2026): 0 MW of new load without storage. With the 10 MW, 4 h Station, 7 MW (five line rule 4.75). The 2 h Station gets 4.75, the 8 h gets 9.75. The binding days are Jul 20, 13 and 21. Limits: Station sizes are modeled, not Torus specs.
22. "Is your flywheel and battery model based on anything real?"
   Torus's CEO said a 1 MW Nvidia stack needs its droop caught within 5 to 8 milliseconds. Our hourly plan and minute model cannot see that, and the real GPU traces show swings every few seconds: that is exactly why the fast layer is Spin, not the battery. The size and frequency of the swings, yes. We checked against real GPU power from MIT Supercloud: 44 labelled training jobs, 22 models, nvidia-smi every 100 ms. Swings repeat about every 5 seconds, 26 percent of peak in a typical minute, 58 percent in the busiest. Our earlier simulation had the size and frequency right but the speed wrong (minutes). Limits: the dataset is CC BY-NC-ND, so we use summary statistics only. The flywheel sizing (about 1.8 MW, 1.3 kWh per swing for a 5.75 MW synchronized site) is our estimate, not Torus data. Independent jobs smooth out (8 to 4 percent max minute step), one big synchronized run does not.
22b. "So how big does the flywheel need to be, really?" (lab branch, second by second)
   We replayed the year capacity case second by second on the real GPU traces: substation rated for its annual peak, 7 MW of new load, 10 MW 4 h Station, 359 days. Each hour still averages 7 MW, so the hourly plan sees the same thing; inside the hour the load moves like the real jobs. The hourly plan alone leaves about 15 hours over the rating in a year, all on 15 summer days. A minute model sees only about 6 of those hours and says 3 MW of flywheel is enough. At 1 second it is not: for 16 independent jobs a 1.5 MW flywheel covers every second alone; for one synchronized run no flywheel up to 6 MW does, because part of it is minutes of load above the hour's average, which is an energy job for the battery. Flywheel plus battery gets every case to zero; with a 3 MW flywheel the battery steps in about 280 times a day on those days, against 5,700 if it chased every spike alone. Limits: small academic jobs scaled to a 7 MW site and stitched into a year, flywheel modeled from Torus's published claims and assumed to respond within the second.
22c. "Did you tune it to win?" (lab branch, full year sweep)
   We reran the full year walk forward 17 times, changing one setting at a time: index weights (5 alternatives), stress premium ($0 to $80), Station size (5 MW 4 h to 20 MW 4 h) and wear cost ($0 to $10). Our plan made the substation worse on 0 days in all 17. It beat price plus the same guard on jam relief in 16 of 17; the tie is premium $0, which is price plus guard by construction. Jam relief is always measured on the default index's jam hours, so no setting wins by redefining a jam. Honest flag: over the full year the advantage is about 1.2 times (14.0 vs 11.5 MWh a day), smaller than the 2.6 times on the main page's 30 autumn days. The direction holds, the size depends on the season. A battery following price with no guard made the substation worse on 27 to 143 of 178 priced days depending on size and wear cost.
22d. "What about flexible data centers, Option 2's question?" (lab branch)
   Same full year, substation rated for its annual peak. If the data center agrees to pause training only when the substation would still be over after the Station, capped at a share of its yearly energy (Duke's Rethinking Load Growth framing, 2025): at 0.5 percent it fits 12 MW with no storage (0 firm) and 17.5 MW with a 10 MW, 4 h Station (7 firm), pausing about 123 hours a year. At 1 percent, 20.5 MW. Our pause hours (79, 164, 295 a year at 0.25, 0.5, 1 percent without storage) land close to Duke's national 85, 177, 366. Two honest flags: the worst hours need the whole site to pause, so with only half the site flexible the Station case falls back to 8 MW; and here the paused hours are only slightly dirtier than average (523 vs 502 kg CO2 per MWh), so at this substation it is about congestion, not carbon.

## Validation (the question a grid expert will ask)
23. "Is this a validated solution to Utah grid congestion?"
   "Not yet, and here is exactly where it stands. Verified: every schedule passes physical checks, power, stored energy, energy balance, and the replay never sees the future. Tested on real history: a month on the live page, and a full year walked forward on weather forecasts as issued in the repo, where our plan never pushed the substation over its limit. Not validated on a real Utah feeder: the substation is PacifiCorp East demand scaled to 100 MW and the limit is modeled. Validation takes one feeder's load trace and rating, which is our ask."
   Say "tested," never "validated," for our results. Name the gap before a judge does.
24. "How would you validate it with us?"
   "Three steps. Replay one anonymized feeder's history with its real limit and Station constraints, the same way we replayed PacifiCorp East: only what was known at each hour. Then shadow mode: read live data, recommend, never control, and log whether the plan stays feasible. Only then supervised control, with your authorization. If data cannot leave Torus, run our schedule on a private case and share the aggregate result."

## Do not say
0. Quote the CEO interview as "Torus's CEO at the 2025 Battery Show said," never as a spec sheet. It is an auto generated transcript.
1. That 500 MW is deployed. It is an MOU target (70 MW expanded to 500 MW in September 2025).
2. "4 to 8 hour Pulse" as a current spec. The current Pulse page says 0.5C.
3. Any customer name or savings figure from Torus case studies; their page titles carry copy errors.
4. A name for the customer software other than Lasso unless Torus confirms it at the venue.
5. "Validated" for our results. Say "verified" and "tested on real history."
6. "Rocky Mountain Power upgrades at 100 to 105 percent." The source says its guidelines allow loading to 105 percent of nameplate in summer and 120 percent in winter; it does not state an upgrade trigger.
7. The claim that a Utah geothermal plant is being curtailed by transmission limits. Not verified by us.

## The sentence to say twice
"Planning alone, our own charging pushed the substation over its limit 8 days out of 30. A real time guard fixed all of them, even on EIA's real forecast. Price only, which ignores the limit, overloaded it 10 days. And with the same Station this substation can take 5.75 MW of new load instead of 1, 7.25 in summer."

## Questions to ask Torus at the venue
1. The narrow ask: could you share one anonymized feeder load trace, its limit and the Station's constraints, or run our schedule on a private case and share the result?
2. Real Spin and Pulse specs or a case study we may use?
3. Final rubric weights and submission details; can one entry also go to Nucleus?
4. Is Lasso the screen customers open every day, or is there a separate customer view?
