/**
 * Core backend services for AOIX-1 system
 * Implements regime analysis, signal generation, risk calculations, and execution logic
 */

// ============================================================================
// REGIME CLASSIFICATION ENGINE
// ============================================================================

export type RegimeType =
  | "bull_vol_compression" | "bull_vol_expansion" | "bear_vol_compression" | "bear_vol_expansion"
  | "mean_reverting" | "chaotic"
  | "crisis" | "liquidity_drought" | "trending_bull" | "trending_bear" | "sector_rotation";

export interface RegimeAnalysis {
  regime: RegimeType;
  transitionProbability: number;
  liquidityStressIndex: number;
  confidenceScore: number;
  metadata: Record<string, any>;
}

export function analyzeRegime(
  spotPrice: number,
  priceMA20: number,
  impliedVol: number,
  historicalVol: number,
  sofr: number,
  moveIndex: number,
  fxVol: number,
  orderBookDepth: number
): RegimeAnalysis {
  // Determine trend direction
  const isBullish = spotPrice > priceMA20;
  
  // Determine volatility regime
  const ivRvRatio = impliedVol / (historicalVol || 0.01);
  const isVolExpanding = ivRvRatio > 1.1; // IV > RV suggests expansion
  
  // Calculate Liquidity Stress Index (LSI)
  const sofrOisSpread = sofr * 0.005; // Simplified spread calculation
  const lsi = (sofrOisSpread + moveIndex * 0.3 + fxVol * 0.2 + (1 / (orderBookDepth || 1)) * 0.5) / 2;
  
  // Strong trend (momentum): |trend| > 5% over MA
  const trendPct = (spotPrice - priceMA20) / (priceMA20 || 1);
  const isStrongMomentum = Math.abs(trendPct) > 0.05;
  const LOW_LIQUIDITY_DEPTH = 50; // orderBookDepth below this = liquidity drought

  // Determine regime (order matters: most specific first)
  let regime: RegimeAnalysis["regime"];
  let confidenceScore = 0.5;

  if (lsi > 0.85) {
    regime = "crisis";
    confidenceScore = 0.35;
  } else if (lsi > 0.7) {
    regime = "chaotic";
    confidenceScore = 0.4;
  } else if ((orderBookDepth || 0) < LOW_LIQUIDITY_DEPTH && lsi < 0.7) {
    regime = "liquidity_drought";
    confidenceScore = 0.5;
  } else if (isStrongMomentum && isBullish) {
    regime = "trending_bull";
    confidenceScore = 0.72;
  } else if (isStrongMomentum && !isBullish) {
    regime = "trending_bear";
    confidenceScore = 0.72;
  } else if (isVolExpanding && isBullish) {
    regime = "bull_vol_expansion";
    confidenceScore = 0.7;
  } else if (!isVolExpanding && isBullish) {
    regime = "bull_vol_compression";
    confidenceScore = 0.75;
  } else if (isVolExpanding && !isBullish) {
    regime = "bear_vol_expansion";
    confidenceScore = 0.7;
  } else if (!isVolExpanding && !isBullish) {
    regime = "bear_vol_compression";
    confidenceScore = 0.75;
  } else {
    regime = "mean_reverting";
    confidenceScore = 0.6;
  }
  // sector_rotation: set by caller when sector leadership data is available (not set here)
  
  // Calculate transition probability
  const transitionProbability = Math.min(lsi * 0.8, 1.0);
  
  return {
    regime,
    transitionProbability,
    liquidityStressIndex: lsi,
    confidenceScore,
    metadata: {
      ivRvRatio,
      trend: isBullish ? "bullish" : "bearish",
      volExpanding: isVolExpanding,
    },
  };
}

// ============================================================================
// SIGNAL ENGINE
// ============================================================================

export interface SignalAnalysis {
  signalType: string;
  signalClass: "A" | "B" | "C" | "D";
  confidenceScore: number;
  confidenceDecayRate: number;
  expectedMoveRange: { lower: number; upper: number };
  volatilityExpansionProbability: number;
  asymmetryScore: number;
  failureMode: string;
}

export function generateDealerGammaSignal(
  gex: number,
  vegaExposure: number,
  spotPrice: number,
  iv: number
): SignalAnalysis {
  // Class A: Structural signal based on dealer positioning
  const absGex = Math.abs(gex);
  const gexIntensity = Math.min(absGex / 1000000, 1.0); // Normalize
  
  return {
    signalType: "dealer_gamma",
    signalClass: "A",
    confidenceScore: 0.6 + gexIntensity * 0.3,
    confidenceDecayRate: 0.05, // Decays slowly (5% per hour)
    expectedMoveRange: {
      lower: -spotPrice * (iv * 0.5),
      upper: spotPrice * (iv * 0.5),
    },
    volatilityExpansionProbability: gex > 0 ? 0.3 : 0.7,
    asymmetryScore: gex > 0 ? 1.2 : 0.8, // Upside/downside ratio
    failureMode: "Dealer positioning changes rapidly due to market moves",
  };
}

export function generateFlowSignal(
  sweepVolume: number,
  avgVolume: number,
  blockTradeCount: number,
  bidAskSpread: number
): SignalAnalysis {
  // Class B: Flow signal based on unusual activity
  const volumeRatio = sweepVolume / (avgVolume || 1);
  const flowIntensity = Math.min(volumeRatio * blockTradeCount / 100, 1.0);
  
  return {
    signalType: "unusual_flow",
    signalClass: "B",
    confidenceScore: 0.5 + flowIntensity * 0.4,
    confidenceDecayRate: 0.15, // Decays faster (15% per hour)
    expectedMoveRange: {
      lower: -2,
      upper: 3,
    },
    volatilityExpansionProbability: volumeRatio > 1.5 ? 0.6 : 0.4,
    asymmetryScore: blockTradeCount > 5 ? 1.3 : 0.9,
    failureMode: "Flow patterns reverse quickly; retail participation unpredictable",
  };
}

export function generateMomentumSignal(
  roc: number,
  rsi: number,
  bbPosition: number,
  volatility: number
): SignalAnalysis {
  // Class C: Momentum signal (low persistence, noise-prone)
  const rocIntensity = Math.min(Math.abs(roc) / 5, 1.0);
  const rsiExtreme = rsi < 30 || rsi > 70 ? 0.5 : 0;
  
  return {
    signalType: "momentum_rsi",
    signalClass: "C",
    confidenceScore: 0.4 + rocIntensity * 0.3 + rsiExtreme * 0.2,
    confidenceDecayRate: 0.25, // Decays very fast (25% per hour)
    expectedMoveRange: {
      lower: -volatility * 1.5,
      upper: volatility * 1.5,
    },
    volatilityExpansionProbability: Math.abs(roc) > 2 ? 0.5 : 0.3,
    asymmetryScore: roc > 0 ? 1.1 : 0.9,
    failureMode: "Mean reversion kills momentum trades; noise dominates signal",
  };
}

export function generateCatalystSignal(
  daysToEvent: number,
  expectedMove: number,
  historicalMove: number
): SignalAnalysis {
  // Class D: Catalyst signal (binary events)
  const eventProximity = Math.max(1 - daysToEvent / 5, 0);
  const moveDeviation = Math.abs(expectedMove - historicalMove) / (historicalMove || 1);
  
  return {
    signalType: "earnings_catalyst",
    signalClass: "D",
    confidenceScore: 0.5 + eventProximity * 0.3 + Math.min(moveDeviation * 0.2, 0.2),
    confidenceDecayRate: 0.5, // Decays very fast post-event
    expectedMoveRange: {
      lower: -expectedMove,
      upper: expectedMove,
    },
    volatilityExpansionProbability: 0.8,
    asymmetryScore: 1.0,
    failureMode: "Event outcome differs from market expectations; IV crush asymmetry",
  };
}

// ============================================================================
// OPTIONS STRUCTURE SELECTOR
// ============================================================================

export interface StructureRecommendation {
  structureType: string;
  direction: "bullish" | "bearish" | "neutral";
  expectedValue: number;
  cvar: number; // Conditional Value at Risk
  deltaExposure: number;
  gammaExposure: number;
  thetaExposure: number;
  vegaExposure: number;
  maxProfit: number;
  maxLoss: number;
  breakeven: number[];
  justification: string;
}

/**
 * Pick best structure per opportunity: use regime + confidence + IV + symbolHint to vary across
 * vertical call/put, iron condor, straddle, strangle, CSP, covered call, calendar, iron butterfly, diagonal.
 * symbolHint (e.g. symbol ticker) spreads choices across symbols so we get iron condor, butterfly, etc., not just vertical spread.
 */
export function selectOptimalStructure(
  regime: string,
  signalConfidence: number,
  expectedMove: number,
  iv: number,
  ivPercentile: number,
  symbolHint?: string
): StructureRecommendation {
  const ivPct = Math.min(100, Math.max(0, ivPercentile));
  const conf = Math.min(1, Math.max(0, signalConfidence));
  const sym = (symbolHint ?? "").toUpperCase();
  const hash = (seed: string = "") => {
    let h = 0;
    for (let i = 0; i < seed.length; i++)
      h = ((h << 5) - h) + regime.charCodeAt(i % regime.length) + ivPct + conf * 100 + (sym ? sym.charCodeAt(i % sym.length) : 0) | 0;
    return Math.abs(h);
  };

  const base = (structureType: string, direction: "bullish" | "bearish" | "neutral", ev: number, cvar: number, delta: number, theta: number, justification: string): StructureRecommendation => ({
    structureType,
    direction,
    expectedValue: ev,
    cvar,
    deltaExposure: delta,
    gammaExposure: 0.1,
    thetaExposure: theta,
    vegaExposure: -0.05,
    maxProfit: expectedMove * 0.6,
    maxLoss: expectedMove * 0.4,
    breakeven: [expectedMove * 0.4, expectedMove * 1.6],
    justification,
  });

  if (regime === "bull_vol_compression") {
    const choices: Array<{ type: string; justification: string }> = [
      { type: "vertical_call_spread", justification: `Bull calm, high conf (${(conf * 100).toFixed(0)}%). Vertical call spread for defined upside.` },
      { type: "covered_call", justification: `Bull calm, sell premium. Covered call for income.` },
      { type: "cash_secured_put", justification: `Bull calm, elevated IV (${ivPct}). CSP to collect premium.` },
      { type: "iron_condor", justification: `Bull calm. Iron condor for defined risk and theta.` },
      { type: "calendar_spread", justification: `Bull calm. Calendar for time decay.` },
    ];
    const idx = hash("bull_c") % choices.length;
    const c = choices[idx];
    return base(c.type, "bullish", expectedMove * 0.6, -expectedMove * 0.2, 0.4, 0.08, c.justification);
  }

  if (regime === "bull_vol_expansion") {
    const choices: Array<{ type: string; justification: string }> = [
      { type: "vertical_call_spread", justification: `Bull with vol expansion. Call spread for directional + defined risk.` },
      { type: "straddle", justification: `Bull vol expansion. Straddle for big move either way.` },
      { type: "strangle", justification: `Bull vol expansion, cheaper vol play. Strangle.` },
      { type: "iron_condor", justification: `Bull vol expansion. Iron condor for defined risk.` },
      { type: "iron_butterfly", justification: `Bull vol expansion. Iron butterfly for range.` },
    ];
    const idx = hash("bull_e") % choices.length;
    const c = choices[idx];
    return base(c.type, "bullish", expectedMove * 0.5, -expectedMove * 0.3, 0.3, 0.06, c.justification);
  }

  if (regime === "bear_vol_compression") {
    const choices: Array<{ type: string; justification: string }> = [
      { type: "vertical_put_spread", justification: `Bear calm. Put spread for defined downside.` },
      { type: "iron_condor", justification: `Bear calm. Iron condor for theta.` },
      { type: "vertical_put_spread", justification: `Bear calm, conf ${(conf * 100).toFixed(0)}%. Put spread.` },
    ];
    const idx = hash("bear_c") % choices.length;
    const c = choices[idx];
    return base(c.type, "bearish", expectedMove * 0.5, -expectedMove * 0.3, -0.3, 0.1, c.justification);
  }

  if (regime === "bear_vol_expansion") {
    const choices: Array<{ type: string; justification: string }> = [
      { type: "iron_condor", justification: `Bear vol expansion. Iron condor for theta and tail risk.` },
      { type: "vertical_put_spread", justification: `Bear vol expansion. Put spread for downside.` },
      { type: "iron_butterfly", justification: `Bear vol expansion. Iron butterfly for range.` },
    ];
    const idx = hash("bear_e") % choices.length;
    const c = choices[idx];
    return base(c.type, "bearish", expectedMove * 0.4, -expectedMove * 0.5, -0.3, 0.12, c.justification);
  }

  if (regime === "mean_reverting") {
    const choices: Array<{ type: string; justification: string }> = [
      { type: "iron_condor", justification: `Mean-reverting. Iron condor for theta.` },
      { type: "iron_butterfly", justification: `Mean-reverting. Iron butterfly at ATM.` },
      { type: "calendar_spread", justification: `Mean-reverting. Calendar for time decay.` },
      { type: "iron_condor", justification: `Mean-reverting, IV ${ivPct}. Iron condor.` },
    ];
    const idx = hash("mean_r") % choices.length;
    const c = choices[idx];
    return base(c.type, "neutral", expectedMove * 0.4, -expectedMove * 0.4, 0.05, 0.12, c.justification);
  }

  if (regime === "chaotic") {
    const choices: Array<{ type: string; justification: string }> = [
      { type: "calendar_spread", justification: `Chaotic regime. Calendar for minimal direction.` },
      { type: "iron_condor", justification: `Chaotic. Iron condor for defined risk.` },
      { type: "strangle", justification: `Chaotic. Strangle for large move.` },
    ];
    const idx = hash("chaos") % choices.length;
    const c = choices[idx];
    return base(c.type, "neutral", expectedMove * 0.3, -expectedMove * 0.4, 0, 0.1, c.justification);
  }

  if (regime === "crisis") {
    const choices: Array<{ type: string; justification: string }> = [
      { type: "vertical_put_spread", justification: `Crisis. Defensive put spread for tail risk.` },
      { type: "calendar_spread", justification: `Crisis. Minimal size, calendar for theta.` },
      { type: "iron_condor", justification: `Crisis. Defined risk only, tight wings.` },
    ];
    const idx = hash("crisis") % choices.length;
    const c = choices[idx];
    return base(c.type, "bearish", expectedMove * 0.2, -expectedMove * 0.3, -0.2, 0.06, c.justification);
  }

  if (regime === "liquidity_drought") {
    const choices: Array<{ type: string; justification: string }> = [
      { type: "calendar_spread", justification: `Liquidity drought. Small size, calendar.` },
      { type: "iron_condor", justification: `Liquidity drought. Defined risk, avoid illiquid legs.` },
    ];
    const idx = hash("liq_drought") % choices.length;
    const c = choices[idx];
    return base(c.type, "neutral", expectedMove * 0.25, -expectedMove * 0.35, 0, 0.08, c.justification);
  }

  if (regime === "trending_bull") {
    const choices: Array<{ type: string; justification: string }> = [
      { type: "vertical_call_spread", justification: `Strong momentum up. Call spread for directional.` },
      { type: "cash_secured_put", justification: `Trending bull. CSP to collect premium.` },
      { type: "iron_condor", justification: `Trending bull. Iron condor for defined risk.` },
      { type: "covered_call", justification: `Trending bull. Covered call for income.` },
      { type: "iron_butterfly", justification: `Trending bull. Iron butterfly for range.` },
    ];
    const idx = hash("trend_bull") % choices.length;
    const c = choices[idx];
    return base(c.type, "bullish", expectedMove * 0.65, -expectedMove * 0.25, 0.45, 0.07, c.justification);
  }

  if (regime === "trending_bear") {
    const choices: Array<{ type: string; justification: string }> = [
      { type: "vertical_put_spread", justification: `Strong momentum down. Put spread for directional.` },
      { type: "iron_condor", justification: `Trending bear. Iron condor, defined risk.` },
    ];
    const idx = hash("trend_bear") % choices.length;
    const c = choices[idx];
    return base(c.type, "bearish", expectedMove * 0.55, -expectedMove * 0.35, -0.4, 0.09, c.justification);
  }

  if (regime === "sector_rotation") {
    const choices: Array<{ type: string; justification: string }> = [
      { type: "iron_condor", justification: `Sector rotation. Neutral, iron condor.` },
      { type: "calendar_spread", justification: `Sector rotation. Calendar for theta.` },
    ];
    const idx = hash("sector") % choices.length;
    const c = choices[idx];
    return base(c.type, "neutral", expectedMove * 0.4, -expectedMove * 0.4, 0.05, 0.1, c.justification);
  }

  const choices: Array<{ type: string; justification: string }> = [
    { type: "calendar_spread", justification: `Neutral/low conf. Calendar for theta.` },
    { type: "iron_condor", justification: `Default. Iron condor for range.` },
    { type: "vertical_call_spread", justification: `Default. Call spread for mild upside.` },
(Content truncated due to size limit. Use line ranges to read remaining content)