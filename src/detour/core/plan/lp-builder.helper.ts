import { TariffHelper } from '../tariff/tariff.helper';
import { planEngineSettings } from './plan-engine.constants';
import { ILpInput, ILpModel, ILpTerm } from './plan-engine.interfaces';

export class LpBuilderHelper {
  public static build(input: ILpInput): ILpModel {
    const { request, schedule, assets, intervals, loadKw } = input;
    const intervalCount = intervals.length;
    const stepHours = intervalCount > 0 ? intervals[0].hours : 0.25;
    const pulse = assets.pulse;
    const spin = assets.spin;
    const co2Weight = request.co2WeightPerKg;
    const demandRate = intervalCount > 0 ? TariffHelper.seasonRatesFor(schedule, intervals[0].localDate).demandRatePerKw : 0;
    const isOnPeakBasis = schedule.demandBasis === 'on-peak';
    const demandFloorKw = isOnPeakBasis ? request.peakSoFarOnPeakKw : request.peakSoFarAllHoursKw;
    const pulseMinSocKwh = pulse.minSocFraction * pulse.energyKwh;
    const pulseMaxSocKwh = pulse.maxSocFraction * pulse.energyKwh;
    const spinEfficiency = Math.sqrt(spin.roundTripEfficiency);
    const spinRetention = 1 - spin.selfDischargePerStep;
    const rampLimitKw = pulse.rampLimitKwPerStep;
    const hasRampRows = rampLimitKw < 2 * pulse.powerKw;
    const hasReserve = request.wattsmartReserveKwh > 0;
    const gridReliefRate = request.gridReliefPerKw ?? 0;
    const hasRelief = gridReliefRate > 0 && input.rushHourMask.some((isRush: boolean) => isRush);
    const lines: string[] = [];

    lines.push(
      `\\ DETOUR day-ahead plan (simulated Torus Station)`,
      `\\ Site: ${request.siteId} | Schedule: ${schedule.name} | Date: ${request.date} | Horizon: ${intervalCount} x ${stepHours} h`,
      `\\ CO2 weight lambda: ${LpBuilderHelper.formatNumber(co2Weight)} $/kg | Wattsmart reserve: ${LpBuilderHelper.formatNumber(request.wattsmartReserveKwh)} kWh`,
      `\\ Peak so far: on-peak ${LpBuilderHelper.formatNumber(request.peakSoFarOnPeakKw)} kW, all-hours ${LpBuilderHelper.formatNumber(request.peakSoFarAllHoursKw)} kW`,
      '\\ What this is: every 15 minutes of the next two days, priced for energy, carbon and wear, with the rules the station must obey.',
      '\\ HiGHS finds the cheapest schedule that breaks no rule. Paste this file into any LP solver to check it.',
      '\\ SIMULATED Torus Station, seed 42. No device is connected.',
      '',
      hasRelief
        ? '\\ Objective: energy price + lambda * marginal CO2 + demand + facilities + grid relief + degradation'
        : '\\ Objective: energy price + lambda * marginal CO2 + demand + facilities + degradation',
      'Minimize',
    );

    const objectiveTerms: ILpTerm[] = [];

    for (let t = 0; t < intervalCount; t++) {
      const carbonCost = co2Weight === 0 ? 0 : co2Weight * input.marginalKgCo2PerKwh[t];
      objectiveTerms.push({ coefficient: (input.energyPricePerKwh[t] + carbonCost) * stepHours, variable: `g_${t}` });
    }

    objectiveTerms.push({ coefficient: demandRate, variable: 'D' });
    objectiveTerms.push({ coefficient: schedule.facilitiesRatePerKw, variable: 'Df' });

    if (hasRelief) {
      objectiveTerms.push({ coefficient: gridReliefRate, variable: 'R' });
    }

    for (let t = 0; t < intervalCount; t++) {
      objectiveTerms.push({ coefficient: pulse.degradationCostPerKwh * stepHours, variable: `pd_${t}` });
    }

    for (let t = 0; t < intervalCount; t++) {
      objectiveTerms.push({ coefficient: spin.degradationCostPerKwh * stepHours, variable: `fd_${t}` });
    }

    lines.push(...LpBuilderHelper.formatRow('obj', objectiveTerms, '', 0, false));
    lines.push('', 'Subject To', '', '\\ Balance: grid - charge + discharge = site load');

    for (let t = 0; t < intervalCount; t++) {
      lines.push(
        ...LpBuilderHelper.formatRow(
          `bal_${t}`,
          [
            { coefficient: 1, variable: `g_${t}` },
            { coefficient: -1, variable: `pc_${t}` },
            { coefficient: 1, variable: `pd_${t}` },
            { coefficient: -1, variable: `fc_${t}` },
            { coefficient: 1, variable: `fd_${t}` },
          ],
          '=',
          loadKw[t],
        ),
      );
    }

    lines.push('', '\\ Pulse SOC: sp_t = sp_(t-1) + eta_c * dt * pc_t - dt / eta_d * pd_t');

    for (let t = 0; t < intervalCount; t++) {
      const terms: ILpTerm[] = [{ coefficient: 1, variable: `sp_${t}` }];

      if (t > 0) {
        terms.push({ coefficient: -1, variable: `sp_${t - 1}` });
      }

      terms.push(
        { coefficient: -pulse.chargeEfficiency * stepHours, variable: `pc_${t}` },
        { coefficient: stepHours / pulse.dischargeEfficiency, variable: `pd_${t}` },
      );
      lines.push(...LpBuilderHelper.formatRow(`psoc_${t}`, terms, '=', t === 0 ? request.initialPulseSocKwh : 0));
    }

    lines.push('', '\\ Spin SOC: sf_t = (1 - sigma) * sf_(t-1) + sqrt(RTE) * dt * fc_t - dt / sqrt(RTE) * fd_t');

    for (let t = 0; t < intervalCount; t++) {
      const terms: ILpTerm[] = [{ coefficient: 1, variable: `sf_${t}` }];

      if (t > 0) {
        terms.push({ coefficient: -spinRetention, variable: `sf_${t - 1}` });
      }

      terms.push(
        { coefficient: -spinEfficiency * stepHours, variable: `fc_${t}` },
        { coefficient: stepHours / spinEfficiency, variable: `fd_${t}` },
      );
      lines.push(
        ...LpBuilderHelper.formatRow(`fsoc_${t}`, terms, '=', t === 0 ? spinRetention * request.initialSpinSocKwh : 0),
      );
    }

    lines.push('', `\\ Pulse ramp: |net_t - net_(t-1)| <= ${LpBuilderHelper.formatNumber(rampLimitKw)} kW per step`);

    if (!hasRampRows) {
      lines.push('\\ (ramp limit is at least twice rated power: no ramp rows)');
    }

    if (hasRampRows && intervalCount > 0 && request.initialPulseNetKw !== undefined) {
      const terms: ILpTerm[] = [
        { coefficient: 1, variable: 'pd_0' },
        { coefficient: -1, variable: 'pc_0' },
      ];
      lines.push(...LpBuilderHelper.formatRow('rampup_0', terms, '<=', request.initialPulseNetKw + rampLimitKw));
      lines.push(...LpBuilderHelper.formatRow('rampdn_0', terms, '>=', request.initialPulseNetKw - rampLimitKw));
    }

    for (let t = 1; t < intervalCount && hasRampRows; t++) {
      const terms: ILpTerm[] = [
        { coefficient: 1, variable: `pd_${t}` },
        { coefficient: -1, variable: `pc_${t}` },
        { coefficient: -1, variable: `pd_${t - 1}` },
        { coefficient: 1, variable: `pc_${t - 1}` },
      ];
      lines.push(...LpBuilderHelper.formatRow(`rampup_${t}`, terms, '<=', rampLimitKw));
      lines.push(...LpBuilderHelper.formatRow(`rampdn_${t}`, terms, '>=', -rampLimitKw));
    }

    lines.push('', `\\ Demand epigraph: D >= grid in ${isOnPeakBasis ? 'on-peak' : 'all'} intervals`);

    for (let t = 0; t < intervalCount; t++) {
      if (isOnPeakBasis && !input.onPeakMask[t]) {
        continue;
      }

      lines.push(
        ...LpBuilderHelper.formatRow(
          `dem_${t}`,
          [
            { coefficient: 1, variable: 'D' },
            { coefficient: -1, variable: `g_${t}` },
          ],
          '>=',
          0,
        ),
      );
    }

    lines.push('', '\\ Facilities epigraph: Df >= grid in every interval');

    for (let t = 0; t < intervalCount; t++) {
      lines.push(
        ...LpBuilderHelper.formatRow(
          `fac_${t}`,
          [
            { coefficient: 1, variable: 'Df' },
            { coefficient: -1, variable: `g_${t}` },
          ],
          '>=',
          0,
        ),
      );
    }

    if (hasRelief) {
      lines.push('', `\\ Grid relief: R >= grid in PACE's rush hour, priced at ${LpBuilderHelper.formatNumber(gridReliefRate)} $/kW`);

      for (let t = 0; t < intervalCount; t++) {
        if (!input.rushHourMask[t]) {
          continue;
        }

        lines.push(
          ...LpBuilderHelper.formatRow(
            `rush_${t}`,
            [
              { coefficient: 1, variable: 'R' },
              { coefficient: -1, variable: `g_${t}` },
            ],
            '>=',
            0,
          ),
        );
      }
    }

    lines.push('', `\\ Wattsmart reserve: Pulse energy above its floor >= ${LpBuilderHelper.formatNumber(request.wattsmartReserveKwh)} kWh in rush hour`);

    for (let t = 0; t < intervalCount && hasReserve; t++) {
      if (!input.rushHourMask[t]) {
        continue;
      }

      lines.push(
        ...LpBuilderHelper.formatRow(
          `res_${t}`,
          [{ coefficient: 1, variable: `sp_${t}` }],
          '>=',
          request.wattsmartReserveKwh + pulseMinSocKwh,
        ),
      );
    }

    lines.push(
      '',
      request.terminalPulseSocKwh === undefined
        ? '\\ Terminal SOC: end the horizon at least as full as it started'
        : '\\ Terminal SOC: Pulse ends the day recharged for tomorrow, Spin at least as full as it started',
    );

    if (intervalCount > 0) {
      const lastIndex = intervalCount - 1;
      lines.push(
        ...LpBuilderHelper.formatRow(
          'term_pulse',
          [{ coefficient: 1, variable: `sp_${lastIndex}` }],
          '>=',
          request.terminalPulseSocKwh ?? request.initialPulseSocKwh,
        ),
        ...LpBuilderHelper.formatRow('term_spin', [{ coefficient: 1, variable: `sf_${lastIndex}` }], '>=', request.initialSpinSocKwh),
      );
    }

    lines.push('', 'Bounds', '\\ Bounds: power ratings, SOC windows, peak-so-far floors');
    lines.push(` ${LpBuilderHelper.formatNumber(demandFloorKw)} <= D <= +inf`);
    lines.push(` ${LpBuilderHelper.formatNumber(request.peakSoFarAllHoursKw)} <= Df <= +inf`);

    const columnNames: string[] = [];

    for (let t = 0; t < intervalCount; t++) {
      lines.push(
        ` 0 <= g_${t} <= +inf`,
        ` 0 <= pc_${t} <= ${LpBuilderHelper.formatNumber(pulse.powerKw)}`,
        ` 0 <= pd_${t} <= ${LpBuilderHelper.formatNumber(pulse.powerKw)}`,
        ` 0 <= fc_${t} <= ${LpBuilderHelper.formatNumber(spin.powerKw)}`,
        ` 0 <= fd_${t} <= ${LpBuilderHelper.formatNumber(spin.powerKw)}`,
        ` ${LpBuilderHelper.formatNumber(pulseMinSocKwh)} <= sp_${t} <= ${LpBuilderHelper.formatNumber(pulseMaxSocKwh)}`,
        ` 0 <= sf_${t} <= ${LpBuilderHelper.formatNumber(spin.energyKwh)}`,
      );
      columnNames.push(`g_${t}`, `pc_${t}`, `pd_${t}`, `fc_${t}`, `fd_${t}`, `sp_${t}`, `sf_${t}`);
    }

    columnNames.push('D', 'Df');

    if (hasRelief) {
      lines.push(' 0 <= R <= +inf');
      columnNames.push('R');
    }

    lines.push('', 'End', '');

    return {
      lpText: lines.join('\n'),
      columnNames,
      stats: {
        intervalCount,
        variableCount: columnNames.length,
        constraintCount: LpBuilderHelper.countConstraints(lines),
        solveMs: 0,
      },
    };
  }

  public static countConstraints(lines: string[]): number {
    const start = lines.indexOf('Subject To');
    const end = lines.indexOf('Bounds');

    if (start < 0 || end < start) {
      return 0;
    }

    return lines.slice(start + 1, end).filter((line: string) => /^ \w+:/.test(line)).length;
  }

  public static formatNumber(value: number): string {
    const fixed = value.toFixed(planEngineSettings.LP_DECIMALS);

    return Number(fixed) === 0 ? (0).toFixed(planEngineSettings.LP_DECIMALS) : fixed;
  }

  private static formatTerm(term: ILpTerm): string {
    const sign = term.coefficient < 0 ? '-' : '+';

    return `${sign} ${LpBuilderHelper.formatNumber(Math.abs(term.coefficient))} ${term.variable}`;
  }

  private static formatRow(
    name: string,
    terms: ILpTerm[],
    sense: string,
    rightHandSide: number,
    hasRightHandSide = true,
  ): string[] {
    const rows: string[] = [];
    const formattedTerms = terms.map((term: ILpTerm) => LpBuilderHelper.formatTerm(term));

    for (let i = 0; i < formattedTerms.length; i += planEngineSettings.LP_TERMS_PER_LINE) {
      const chunk = formattedTerms.slice(i, i + planEngineSettings.LP_TERMS_PER_LINE).join(' ');
      rows.push(i === 0 ? ` ${name}: ${chunk}` : `   ${chunk}`);
    }

    if (hasRightHandSide) {
      rows[rows.length - 1] = `${rows[rows.length - 1]} ${sense} ${LpBuilderHelper.formatNumber(rightHandSide)}`;
    }

    return rows;
  }
}
