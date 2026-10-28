import flexRaw from '../../public/data/lab-flex.json';

interface ByBudget {
  budgetPct: number;
  mw: number;
  pausedHoursPerYear: number;
  pausedMWhPerYear: number;
  maxPauseShare: number;
  pausedKgPerMWh: number | null;
  byShare: { share: number; mw: number }[];
}
interface Flex {
  days: number;
  first: string;
  last: string;
  ratingMW: number;
  stepMW: number;
  gridKgPerMWhMean: number;
  budgetsPct: number[];
  shares: number[];
  result: { label: string; byBudget: ByBudget[] }[];
}
const fx = flexRaw as unknown as Flex;

const pctLabel = (b: number) => (b === 0 ? 'No pauses (firm load)' : `Pauses up to ${b}% of yearly energy`);
const hrs = (h: number) => `${Math.round(h)} h a year`;
const longDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

export default function FlexLab() {
  const none = fx.result[0];
  const st = fx.result[1];
  const at = (r: (typeof fx.result)[number], b: number) => r.byBudget.find(x => x.budgetPct === b)!;
  const half = 0.5;
  const n0 = at(none, 0);
  const nH = at(none, half);
  const s0 = at(st, 0);
  const sH = at(st, half);
  const kgPaused = sH.pausedKgPerMWh;
  return (
    <section className="evidence" aria-labelledby="fx-h">
      <p className="eyebrow">F · Compute that yields to traffic</p>
      <h2 id="fx-h">
        If the data center pauses for {half}% of its yearly energy, this substation takes {nH.mw} MW instead of {n0.mw}{' '}
        without storage, and {sH.mw} MW instead of {s0.mw} with a 10 MW, 4 h Station.
      </h2>
      <p className="sub">
        The bounty's second question, where and when AI should run, asked at one substation. Same year as above: rated
        for its own annual peak ({fx.ratingMW} MW), planned every night on issued forecasts, graded on real demand,{' '}
        {fx.days} days ({longDate(fx.first)} to {longDate(fx.last)}). The new load is an AI data center that agrees to
        pause training whenever the substation would still be over its rating after the Station has done its part,
        capped at a share of its yearly energy. That framing comes from Duke's{' '}
        <a href="https://nicholasinstitute.duke.edu/sites/default/files/publications/rethinking-load-growth.pdf">
          Rethinking Load Growth
        </a>{' '}
        (2025), which found about 76 GW of room on US grids at 0.25% and 126 GW at 1%, with about 85 and 366 paused
        hours a year. Our pause hours land close to theirs.
      </p>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>New load that fits, MW (hours it pauses)</th>
              {fx.result.map(r => (
                <th key={r.label}>{r.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fx.budgetsPct.map(b => (
              <tr key={b}>
                <th scope="row">{pctLabel(b)}</th>
                {fx.result.map(r => {
                  const q = at(r, b);
                  return (
                    <td key={r.label}>
                      <b>{q.mw}</b>
                      {b > 0 ? ` (${hrs(q.pausedHoursPerYear)})` : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>At {half}%, if only part of the site can pause</th>
              {fx.result.map(r => (
                <th key={r.label}>{r.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fx.shares.map((s, i) => (
              <tr key={s}>
                <th scope="row">
                  {s === 1 ? 'Whole site can pause' : `Only ${Math.round(s * 100)}% of the site can pause`}
                </th>
                {fx.result.map(r => (
                  <td key={r.label}>{at(r, half).byShare[i].mw} MW</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="notes">
        <li>
          <b>Storage and flexibility stack.</b> Without storage, pauses alone take this substation from {n0.mw} to{' '}
          {nH.mw} MW. With the Station they take it from {s0.mw} to {sH.mw} MW, and it pauses fewer hours (
          {hrs(sH.pausedHoursPerYear)} against {hrs(nH.pausedHoursPerYear)}) even though the load is bigger: the Station
          handles the hours it can, the data center only steps back for what is left.
        </li>
        <li>
          <b>The pause reacts to the meter, like the guard.</b> No forecast is needed for it: when the substation would
          still be over after the Station, the site steps back by exactly that much. But the rare worst hours need deep
          pauses, up to {Math.round(sH.maxPauseShare * 100)}% of the site: if only half of it can pause, the Station
          case falls back to {sH.byShare.find(x => x.share === 0.5)?.mw} MW. The agreement has to cover the whole site,
          for very few hours.
        </li>
        {kgPaused !== null ? (
          <li>
            <b>When, and how clean.</b> The paused hours are the substation's peak hours, and the grid here is only
            slightly dirtier then: about {Math.round(kgPaused)} kg CO2 per MWh, against{' '}
            {Math.round(fx.gridKgPerMWhMean)} on average over the year. At this substation, yielding to traffic is about
            congestion, not carbon. Where the cleanest power is, the other half of the bounty's question, needs other
            regions' data.
          </li>
        ) : null}
        <li>
          <b>What it means for Torus.</b> A Station sized for the firm part and a flexible load agreement for the rest:
          the utility gets a data center connected sooner, the data center gives up a few hours a year, and the Station
          keeps those hours few.
        </li>
        <li>
          Limits: one substation, PacifiCorp East demand scaled to 100 MW; sizes tested every {fx.stepMW} MW; paused
          work is counted as lost here, not made up later at this substation; grid intensity counts coal and gas only
          (EIA rates) and ignores imports.
        </li>
      </ul>
    </section>
  );
}
