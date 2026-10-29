// Phase 1 step 1: run DETOUR's own planner and month replay on our EIA data, and compare with its
// published July 2026 airport result: DETOUR $11,546 saved, fixed-threshold battery $5,980,
// perfect hindsight $15,137 (Schedule 8).
import highsLoader from 'highs';
import { BacktestRunnerHelper } from '../src/detour/core/backtest/backtest-runner.helper';
import type { ILpSolver } from '../src/detour/core/backtest/backtest.interfaces';
import { LpStrategyHelper } from '../src/detour/core/backtest/lp-strategy.helper';
import { NaiveShaverHelper } from '../src/detour/core/backtest/naive-shaver.helper';
import { PlanEngineHelper } from '../src/detour/core/plan/plan-engine.helper';
import type { ILpInput } from '../src/detour/core/plan/plan-engine.interfaces';
import { EmissionsHelper } from '../src/detour/core/signals/emissions.helper';
import { SitesHelper } from '../src/detour/core/sites/sites.helper';
import { tariffSchedules } from '../src/detour/core/tariff/tariff.constants';
import { loadGridMonths } from '../src/merge/grid-months';

async function main(): Promise<void> {
  const month = process.argv[2] ?? '2026-07';
  const siteId = process.argv[3] ?? 'airport';
  const gridMonths = loadGridMonths();
  const marginal = EmissionsHelper.marginalSeries(
    EmissionsHelper.buildRows(gridMonths.flatMap(m => m.hours)),
    'fossil-generation',
  );
  const highs = await highsLoader();
  const solver: ILpSolver = { solve: async (input: ILpInput) => PlanEngineHelper.solve(highs, input) };
  const strategies = [
    NaiveShaverHelper.noStorage,
    NaiveShaverHelper.naiveShaver,
    LpStrategyHelper.detour(solver),
    LpStrategyHelper.oracle(solver),
  ];
  const site = SitesHelper.listArchetypes().find(s => s.id === siteId);
  if (!site) throw new Error(`no site ${siteId}`);
  const gridMonth = gridMonths.find(m => m.month === month);
  if (!gridMonth) throw new Error(`no grid month ${month}`);
  const t0 = Date.now();
  const input = BacktestRunnerHelper.buildInput(
    site,
    tariffSchedules.SCHEDULE_8,
    SitesHelper.getAssets(site.id)!,
    gridMonth,
    null,
    marginal,
    month,
    null,
  );
  const result = await BacktestRunnerHelper.run(input, strategies);
  for (const r of result.strategies) {
    const capture = r.captureRate === null ? '' : `  capture ${(r.captureRate * 100).toFixed(0)}%`;
    console.log(
      `${r.strategy.id.padEnd(18)} bill $${r.bill.total.toFixed(0).padStart(7)}  saved $${r.savings.total.toFixed(0)}${capture}`,
    );
  }
  console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
main();
