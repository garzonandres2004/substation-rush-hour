// Transformer heat model, after the IEEE C57.91 exponential method (clause 7), at hourly steps.
// A transformer's real limit is its winding hot spot temperature, not a fixed MW number: on a cold
// day it can carry more than nameplate, on a hot day less. All parameters are ASSUMED typical
// values for an oil filled ONAF power transformer, not the rating of any real substation.

export interface Xfmr {
  topOilRiseRatedC: number; // top oil rise over ambient at rated load
  hotSpotRiseRatedC: number; // hot spot rise over top oil at rated load
  lossRatio: number; // R: load losses over no load losses at rated load
  n: number; // top oil exponent
  m: number; // winding exponent
  tauTopOilH: number; // top oil time constant, hours
  hotSpotLimitC: number; // normal life loading limit
  refAmbientC: number; // ambient at which nameplate gives the limit
}

export const XFMR: Xfmr = {
  topOilRiseRatedC: 55,
  hotSpotRiseRatedC: 25,
  lossRatio: 4.5,
  n: 0.9,
  m: 0.8,
  tauTopOilH: 2.5,
  hotSpotLimitC: 110,
  refAmbientC: 30,
};

const topOilRiseSteady = (k: number, x: Xfmr) =>
  x.topOilRiseRatedC * ((k * k * x.lossRatio + 1) / (x.lossRatio + 1)) ** x.n;
const hotSpotRise = (k: number, x: Xfmr) => x.hotSpotRiseRatedC * k ** (2 * x.m);

// Steady state hot spot (C) at per unit load k and ambient (C).
export const hotSpotSteady = (k: number, ambientC: number, x = XFMR) =>
  ambientC + topOilRiseSteady(k, x) + hotSpotRise(k, x);

// Per unit load that holds the hot spot exactly at the limit, at a constant ambient.
// Steady state, so it ignores the oil's thermal inertia: a conservative hourly rating.
export function ratingPU(ambientC: number, x = XFMR): number {
  let lo = 0.2,
    hi = 2.5;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (hotSpotSteady(mid, ambientC, x) > x.hotSpotLimitC) hi = mid;
    else lo = mid;
  }
  return lo;
}

// Aging acceleration factor: 1 at a 110 C hot spot, doubling roughly every 6 to 7 C above it.
export const agingFactor = (hotSpotC: number) => Math.exp(15000 / 383 - 15000 / (hotSpotC + 273));

// Hour by hour simulation of one day. Top oil follows load with its time constant; the winding
// rise (minutes) is treated as instant at hourly steps. Starts in steady state at hour 0.
export function simulate(loadMW: number[], ambientC: number[], nameplateMW: number, x = XFMR) {
  const k = loadMW.map(l => Math.max(0, l) / nameplateMW);
  let topOil = topOilRiseSteady(k[0], x);
  const decay = Math.exp(-1 / x.tauTopOilH);
  const hotSpot: number[] = [];
  let agingHours = 0;
  for (let t = 0; t < k.length; t++) {
    const target = topOilRiseSteady(k[t], x);
    topOil = target + (topOil - target) * decay;
    const hs = ambientC[t] + topOil + hotSpotRise(k[t], x);
    hotSpot.push(hs);
    agingHours += agingFactor(hs);
  }
  return { hotSpot, maxHotSpotC: Math.max(...hotSpot), agingHours };
}
