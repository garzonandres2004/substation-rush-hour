# Demo script and Q and A prep

## 5 minute flow (deck: Substation Rush Hour, 10 slides; speaker notes carry the full script)
1. Cover, 15 s.
2. Problem, 30 s: new load arrives faster than new wires; price following charged into the limit on 10 of 30 days.
3. What we built, 20 s.
4. Live demo, 90 s: jam 5 PM to 7 PM, tap a step for the why; Follows price only shows red overload; Capacity cut 10% shows the battery holding the line; scroll to the three cards.
5. Finding 1, 40 s: planning once overloaded on 8 of 30 real days; replanning alone 9; margin 3 at $81 a day; replan plus real time guard 0 at about $10 a day.
6. Finding 2, 40 s: 1 MW to 5.75 MW of new load with a 10 MW, 4 h Station; fixed rating 3.75 to 8.25 MW; five line rule 5.25 MW, most room is the Station.
7. Finding 3, 40 s: hourly plan hides 2,438 minutes above the planning limit; battery alone 34 minutes and 62 power changes a day; 3 MW flywheel plus battery 0 and 12.
8. Tradeoffs, 20 s: index buys 7.3 MWh a day more jam relief for $12 a day.
9. Torus fit, 20 s. 10. Limits and the pilot question, 20 s.

## Hardest questions
1. "Your substation is system load scaled to 100 MW and the limit moves with its own load. What congestion did you model?"
   Two signals on purpose: grid traffic is a soft cost, the local limit is a hard rule held first. We also ran one fixed rating (90.9 MW): 3.75 to 8.25 MW. A real feeder's load and rating only swap the inputs.
2. "A transformer does not trip on one minute over nameplate."
   Agree: the worst minute is 1.3 MW, about 2 percent. The point is who absorbs a 4.9 MW a minute swing all day. The battery can, but it changes power 62 times a day instead of 11 and still misses 34 minutes. Spin for power, Pulse for energy.
3. "Who gets paid the $314 a day? Wattsmart Stations are under utility dispatch."
   Price is a stress signal, not a revenue pitch. The value is capacity on the same wires. Under Wattsmart, jam hours are candidate event windows.
4. "30 autumn days. What is the number in July?"
   Not run yet: the data starts in late August. Summer with a fixed rating is the next run; interconnection studies use the summer peak.
5. "Your battery discharges in the morning when nothing is jammed and sits at the limit all afternoon."
   The plan must end the day half full and 6 PM scores higher than 5 PM. A headroom rule (charge only to 90 percent of the limit) is a one line change with a measurable cost.
6. "So you fixed a problem your own battery created?"
   Yes. Any battery charging near a limit can create one. Planning alone let it happen on 8 of 30 real days; the guard makes sure it never does.
7. "Turn off the traffic index. Do you still get zero overloads?"
   Yes, the guard holds the limit either way. The index decides the rest of the day: 12.1 MWh a day of jam relief vs 4.8 for price alone, for $12 a day.
8. "Did your forecast see tomorrow's weather?"
   In the backtest, yes, observed weather. So beating EIA (5.0 vs 8.7 percent) is an upper bound, and the page says so.

## Questions to ask Torus at the venue
1. What would you need from us to run this on one real feeder?
2. Real Spin and Pulse specs or a case study we may use?
3. Final rubric weights and submission details; can one entry also go to Nucleus?
