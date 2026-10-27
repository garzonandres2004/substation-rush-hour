# Demo script and Q and A prep

## 5 minute flow (deck: Substation Rush Hour, 11 slides; speaker notes carry the full script)
1. Cover, 15 s.
2. Problem, 30 s: new load arrives faster than new wires; price following charged into the limit on 10 of 30 days.
3. What we built, 20 s.
4. Live demo, 90 s: jam 5 PM to 7 PM, tap a step for the why; Follows price only shows red overload; Capacity cut 10% shows the battery holding the line; scroll to the three cards.
5. Finding 1, 40 s: planning once overloaded on 8 of 30 real days; replanning alone 9; margin 3 at $81 a day; replan plus real time guard 0 at about $10 a day.
6. Finding 2, 40 s: 1 MW to 5.75 MW of new load with a 10 MW, 4 h Station; fixed rating 3.75 to 8.25 MW; five line rule 5.25 MW, most room is the Station.
7. Finding 3, 40 s: hourly plan hides 2,438 minutes above the planning limit; battery alone 34 minutes and 62 power changes a day; 3 MW flywheel plus battery 0 and 12.
8. Tradeoffs, 20 s: index buys 7.3 MWh a day more jam relief for $12 a day.
9. Torus fit, 20 s: Torus schedules Stations against forecasts for smaller utilities and co ops; this is that schedule plus a guard, in Torus's own four congestion steps.
10. Vision, 20 s: three daily questions, a planning view in Torus Lasso.
11. Limits and the pilot question, 20 s.
If over time: cut slide 9 to its title sentence; the vision slide covers the fit.

## Hardest questions
1. "Your substation is system load scaled to 100 MW and the limit moves with its own load. What congestion did you model?"
   Two signals on purpose: grid traffic is a soft cost, the local limit is a hard rule held first. We also ran one fixed rating (90.9 MW): 3.75 to 8.25 MW. A real feeder's load and rating only swap the inputs.
2. "A transformer does not trip on one minute over nameplate."
   Agree: the worst minute is 1.3 MW, about 2 percent. The point is who absorbs a 4.9 MW a minute swing all day. The battery can, but it changes power 62 times a day instead of 11 and still misses 34 minutes. Spin for power, Pulse for energy.
3. "Who gets paid the $314 a day? Wattsmart Stations are under utility dispatch."
   Price is a stress signal, not a revenue pitch. The value is capacity on the same wires. Under Wattsmart, jam hours are candidate event windows.
4. "30 autumn days. What is the number in July?"
   We ran it: July and August, 61 days, substation rated for its summer peak, planned on EIA's own day ahead forecast (8.7 percent error, a real forecast). The 10 MW, 4 h Station lets it take 7.25 MW of new load; the five line rule gets 5.25 MW. A substation rated only for autumn load would go over on 58 of 61 summer days, and one Station only cuts that to 51: storage adds room, it does not replace a rating sized for summer.
5. "Your battery discharges in the morning when nothing is jammed and sits at the limit all afternoon."
   The plan must end the day half full and 6 PM scores higher than 5 PM. A headroom rule (charge only to 90 percent of the limit) is a one line change with a measurable cost.
6. "So you fixed a problem your own battery created?"
   Yes. Any battery charging near a limit can create one. Planning alone let it happen on 8 of 30 real days; the guard makes sure it never does.
7. "Turn off the traffic index. Do you still get zero overloads?"
   Yes, the guard holds the limit either way. The index decides the rest of the day: 12.1 MWh a day of jam relief vs 4.8 for price alone, for $12 a day.
8. "Did your forecast see tomorrow's weather?"
   In the backtest, yes, observed weather. So beating EIA (5.0 vs 8.7 percent) is an upper bound, and the page says so.

9. "Why not just follow prices? Prices already include congestion."
   Wholesale prices are hub level, not feeder level, and most facilities pay flat or time of use rates that do not reflect a local limit. A limit is physical: no price tells you this substation cannot deliver. Our data shows it: follows price only overloaded on 10 of 30 days. (Point from the earlier research.)
10. "Doesn't Tesla already do this?"
   Tesla's dispatch software optimizes battery revenue for Tesla hardware. We plan a substation against its limit and size the storage for new load. Do not quote Tesla fleet numbers unless verified.

11. "Did you tune anything on the test period?"
   Be exact. The index weights were fixed in the first engine build, before any backtest, and other weightings give the same result: equal weights 12.1 MWh a day of jam relief, demand heavy 12.3, no price at all 12.9, ours 12.1, zero overload days in every case. The guard is different: it came from our first version failing on these same 30 days. So we checked it on data it never saw: EIA's own forecast instead of ours (0 days over), and 61 summer days. The guard has no tuned parameter; the limit is the limit.

12. "Where does the $20 stress premium come from? At $5 does your plan still win?"
   It is an assumption, and the limit does not depend on it: the guard holds 0 days at $0, $5, $10, $20 and $40. The premium only buys jam relief: 4.8 MWh a day at $0, 9.1 at $5 (no cost), 12.1 at $20 ($12 a day). Two separate claims: the guard holds the limit, the index moves relief into the jam.
13. "With a real forecast, does 8 to 0 hold?"
   Yes. Planned on EIA's own day ahead forecast instead of ours: plan once 11 of 30 days over, replanning alone 11, replanning plus the guard 0, at $313 a day. Summer used EIA's forecast too.
14. "Which limit is which? I see 79.5, 71.6, 90.9, 88.2, 119."
   Each day's limit is the 95th percentile of its last 30 days of load: tomorrow 79.5 MW, 71.6 with the 10 percent derate, Oct 5 (the minute chart) 88.2. The capacity test also uses one fixed rating, 90.9 MW. Summer is rated for the July peak, 119.0 MW. The page explains it under What is real and what is modeled.

15. "Pulse is 0.5C, about 2 hours at rated power. Why model a 4 hour Station?"
   Station sizes are modeled, not Torus specs, and the page says so. The 10 MW, 2 h row is the native 0.5C ratio and gives 4 MW of new load. The 4 h case is 40 MWh of Pulse behind a 10 MW connection. Stored energy matters most here: the crunch is a long afternoon plateau.
16. "Wattsmart dispatches under 1 percent of hours. Your plan acts every day?"
   Utility events come first. The plan runs the other hours and keeps energy ready for the next event. That is the dual use Torus describes: behind the meter assets keep serving the host between events.
17. "How does this relate to Lasso?"
   Torus says smaller utilities and co ops let Torus schedule against forecasts through Lasso. This is that forecast schedule, plus a guard for when the forecast is wrong. It is a concept on public data; there is no public Lasso API and no integration.
18. "How did you think about risk?" (only if asked; analogy from trading)
   The guard is the stop loss: it acts on the meter no matter what the plan said. The forecast miss is the slippage. The stress premium is the risk appetite: how much jam relief to buy.
19. "What would you validate next?"
   "A full year walk forward test: calibrate on one season, test on the next, including winter peaks, with weather forecasts as they were issued instead of observed weather. Then sweep weights, premium, Station size and charge bounds and report the whole grid, not one best number."

## Do not say
1. That 500 MW is deployed. It is an MOU target (70 MW expanded to 500 MW in September 2025).
2. "4 to 8 hour Pulse" as a current spec. The current Pulse page says 0.5C.
3. Any customer name or savings figure from Torus case studies; their page titles carry copy errors.
4. A name for the customer software other than Lasso unless Torus confirms it at the venue.

## The sentence to say twice
"Planning alone, our own charging pushed the substation over its limit 8 days out of 30. A real time guard fixed all of them, even on EIA's real forecast. Price only, which ignores the limit, overloaded it 10 days. And with the same Station this substation can take 5.75 MW of new load instead of 1, 7.25 in summer."

## Questions to ask Torus at the venue
1. What would you need from us to run this on one real feeder?
2. Real Spin and Pulse specs or a case study we may use?
3. Final rubric weights and submission details; can one entry also go to Nucleus?
4. Is Lasso the screen customers open every day, or is there a separate customer view?
