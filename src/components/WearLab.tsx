import wearRaw from '../../public/data/lab-wear.json';

// Section L: how much the everyday plan depends on what battery wear costs. Read from
// public/data/lab-wear.json (scripts/lab-wear.ts).

interface Row {
  costPerMWhThroughput: number;
  valuePerDay: number;
  jamReliefMWhPerDay: number;
  throughputMWhPerDay: number;
  daysOver: number;
  days: number;
}
const wear = wearRaw as unknown as {
  pageAssumption: number;
  detour: { pulsePerMWhDischarged: number; spinPerMWhDischarged: number; pulsePerMWhThroughputApprox: number };
  rows: Row[];
};
const money = (x: number) => `${x < 0 ? '−' : ''}$${Math.abs(Math.round(x)).toLocaleString('en-US')}`;

export default function WearLab() {
  const page = wear.rows.find(r => r.costPerMWhThroughput === wear.pageAssumption)!;
  const top = wear.rows.at(-1)!;
  return (
    <section className="evidence" aria-labelledby="wear-h">
      <p className="eyebrow">L · Battery wear</p>
      <h2 id="wear-h">
        The everyday value rests on cheap battery wear. At DETOUR's wear cost the Station earns almost nothing from
        prices, and the limit still holds.
      </h2>
      <p className="sub">
        The page assumes ${wear.pageAssumption} of wear per MWh the battery moves. DETOUR assumes Nova Pulse costs $
        {wear.detour.pulsePerMWhDischarged} per MWh discharged (about $
        {Math.round(wear.detour.pulsePerMWhThroughputApprox)} per MWh moved): $450 per kWh over 7,500 cycles. Neither is
        a Torus number. Same {page.days} days, same planner, the wear cost both in the plan and in the score.
      </p>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Wear per MWh moved</th>
              <th>Value a day, after wear</th>
              <th>Jam relief a day</th>
              <th>Energy moved a day</th>
              <th>Days over the limit</th>
            </tr>
          </thead>
          <tbody>
            {wear.rows.map(r => (
              <tr key={r.costPerMWhThroughput} className={r === page ? 'best' : ''}>
                <th scope="row">
                  ${r.costPerMWhThroughput}
                  {r === page ? ' (the page)' : r === top ? ' (about DETOUR)' : ''}
                </th>
                <td>{money(r.valuePerDay)}</td>
                <td>{r.jamReliefMWhPerDay.toFixed(1)} MWh</td>
                <td>{r.throughputMWhPerDay.toFixed(0)} MWh</td>
                <td>
                  {r.daysOver} of {r.days}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="notes">
        <li>
          Price spreads in PacifiCorp East this autumn are small, so once wear costs more than a few dollars the plan
          stops cycling for money. Jam relief falls with it: the traffic premium alone does not pay for the wear.
        </li>
        <li>
          What does not move: the guard holds the limit at every wear cost, and capacity for new load comes from
          discharging only when the meter is over, which uses the battery little.
        </li>
        <li>
          So the Station's case on this feeder is capacity and reliability first, money second, unless real wear costs
          are near the low end. Torus's own cost per cycle would settle it.
        </li>
      </ul>
    </section>
  );
}
