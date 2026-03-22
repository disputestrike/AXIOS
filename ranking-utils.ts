/**
 * Ranking optimization: regime-signal alignment, regime-specific bounds,
 * volatility-regime-aware expected return, stability penalty, IV calibration.
 * Used by market-scanner for score, win probability, and expected return.
 */

/**
 * Regime–signal affinity: multiplier for score when signal type fits regime (0.7–1.3).
 * Expanded matrix: regime × signal class (A=dealer_gamma, B=flow, C=momentum, D=vol/event).
 */
export function getRegimeSignalAlignment(regime: string, signalClass: string): number {
  const r = (regime || '').toLowerCase();
  const c = (signalClass || '').toUpperCase();
  // Strong fit (1.15–1.2)
  if ((r === 'mean_reverting' || r === 'chaotic') && (c === 'A' || c === 'C')) return 1.2;
  if (r === 'trending_bull' && c === 'A') return 1.15;
  if (r === 'trending_bear' && (c === 'A' || c === 'B')) return 1.15;
  if (r.includes('bull_vol_compression') && (c === 'A' || c === 'B')) return 1.1;
  if (r.includes('bear_vol_expansion') && c === 'B') return 1.1;
  if (r === 'crisis' && (c === 'A' || c === 'D')) return 1.05;
  if (r === 'liquidity_drought' && c === 'B') return 1.05; // flow in thin markets
  if (r === 'sector_rotation' && (c === 'A' || c === 'C')) return 1.05;
  if (r.includes('bull_vol_expansion') && (c === 'A' || c === 'D')) return 1.05;
  if (r.includes('bear_vol_compression') && c === 'B') return 1.05;
  // Poor fit: slight penalty (0.85–0.9)
  if (r === 'mean_reverting' && c === 'D') return 0.9;
  if (r === 'crisis' && c === 'C') return 0.85;
  if (r === 'liquidity_drought' && c === 'C') return 0.9; // momentum noisy in drought
  return 1.0;
}

/** Regime-specific win probability bounds (min, max). */
export function getRegimeWinProbBounds(regime: string): { min: number; max: number } {
  const r = (regime || '').toLowerCase();
  if (r === 'mean_reverting') return { min: 0.58, max: 0.9 };
  if (r === 'trending_bull' || r.includes('bull_vol_compression')) return { min: 0.55, max: 0.85 };
  if (r === 'trending_bear' || r.includes('bear_vol_compression')) return { min: 0.52, max: 0.82 };
  if (r === 'crisis') return { min: 0.25, max: 0.65 };
  if (r === 'chaotic') return { min: 0.4, max: 0.7 };
  if (r === 'liquidity_drought') return { min: 0.45, max: 0.75 };
  if (r.includes('bull_vol_expansion') || r.includes('bear_vol_expansion')) return { min: 0.5, max: 0.78 };
  if (r === 'sector_rotation') return { min: 0.52, max: 0.82 };
  return { min: 0.35, max: 0.85 };
}

/** Volatility-regime-aware expected return multiplier. */
export function getRegimeExpectedReturnMultiplier(regime: string): number {
  const r = (regime || '').toLowerCase();
  if (r.includes('bull_vol_expansion')) return 1.3;
  if (r.includes('bull_vol_compression') || r === 'trending_bull') return 1.0;
  if (r === 'mean_reverting') return 0.8;
  if (r === 'crisis') return 0.5;
  if (r === 'chaotic') return 0.7;
  if (r === 'liquidity_drought') return 0.75;
  if (r.includes('bear')) return 0.85;
  return 1.0;
}

/** Instability penalty factor for composite/score: 1 - penalty (0–0.2). */
export function getStabilityPenalty(regimeStability?: number, transitionProbability?: number): number {
  let penalty = 0;
  if (transitionProbability != null && transitionProbability > 0.4) penalty += 0.15;
  if (regimeStability != null && regimeStability < 0.5) penalty += 0.2;
  return Math.min(0.25, penalty);
}

/** IV rank bonus multiplier by regime: premium-selling favors lower IV rank for entry; vol expansion favors high IV. */
export function getIVRegimeMultiplier(regime: string, ivRank: number): number {
  const r = (regime || '').toLowerCase();
  // Bull vol compression / mean reverting: selling premium; low IV rank (20–40) can be better entry
  if (r.includes('bull_vol_compression') || r === 'mean_reverting') {
    if (ivRank >= 20 && ivRank <= 40) return 1.15;
    if (ivRank > 70) return 0.95;
  }
  // Bull vol expansion: long vol; high IV rank (70+) favorable
  if (r.includes('bull_vol_expansion')) {
    if (ivRank > 70) return 1.2;
    if (ivRank < 30) return 0.9;
  }
  return 1.0;
}

/** Greeks-based score component for structure/regime (optional; +5 to -5). */
export function getStructureGreeksScore(
  regime: string,
  structureType: string,
  greeks?: { theta?: number; gamma?: number; vega?: number }
): number {
  if (!greeks) return 0;
  const r = (regime || '').toLowerCase();
  const s = (structureType || '').toLowerCase();
  let score = 0;
  const premiumSelling = r.includes('bull_vol_compression') || r === 'mean_reverting' || r.includes('trending_bull');
  if (premiumSelling) {
    const netTheta = greeks.theta ?? 0;
    const netGamma = greeks.gamma ?? 0;
    if (netTheta > 0) score += 3;
    if (netGamma < 0 && s.includes('condor')) score += 2; // short gamma in condor in calm regime
  }
  if (r.includes('bull_vol_expansion') && (greeks.vega ?? 0) > 0) score += 2;
  return Math.max(-5, Math.min(5, score));
}

/** Data freshness penalty: 1.0 if fresh, 0.95 if > 2 min old (live engine). */
export function getDataFreshnessFactor(timestamp: number, maxAgeMs: number = 120_000): number {
  return Date.now() - timestamp > maxAgeMs ? 0.95 : 1.0;
}

/** DTE score factor. Spec: -15% &lt;3 DTE, +5% 15–30, -8% &gt;60. */
export function getDTEScoreFactor(daysToExpiry?: number): number {
  if (daysToExpiry == null) return 1.0;
  if (daysToExpiry < 3) return 0.85;
  if (daysToExpiry >= 15 && daysToExpiry <= 30) return 1.05;
  if (daysToExpiry > 60) return 0.92;
  return 1.0;
}

/** Data source factor: IBKR only. */
export function getDataSourceFactor(dataSource?: 'ibkr'): number {
  return dataSource === 'ibkr' ? 1.03 : 1.0;
}

/** Preferred regimes for live ranking (align with backtest default): boost score so these rank higher. Returns 1.0–1.05. */
export const PREFERRED_REGIMES_RANKING = ['bull_vol_compression', 'mean_reverting', 'trending_bull'] as const;

export function getRegimeRankingBonus(regime?: string): number {
  if (!regime) return 1.0;
  const r = regime.toLowerCase();
  return PREFERRED_REGIMES_RANKING.some((p) => r.includes(p)) ? 1.05 : 1.0;
}

/**
 * Portfolio correlation alignment: reduce score when new opportunity is highly correlated with existing positions
 * (e.g. same delta direction, same sector). Returns 0.8–1.0; apply as multiplier to composite/explosive score.
 */
export function getCorrelationAlignment(
  opportunity: { symbol: string; greeks?: { delta?: number } },
  existingPositions: { symbol: string; delta?: number }[]
): number {
  if (!existingPositions?.length) return 1.0;
  let drag = 0;
  const oppDelta = opportunity.greeks?.delta ?? 0;
  for (const pos of existingPositions) {
    if (pos.symbol === opportunity.symbol) continue; // same symbol = same trade, no drag
    const posDelta = pos.delta ?? 0;
    // Proxy correlation: same sign = correlated (both long or both short delta)
    const sameDirection = (oppDelta > 0 && posDelta > 0) || (oppDelta < 0 && posDelta < 0);
    const magnitude = Math.min(1, (Math.abs(oppDelta) + Math.abs(posDelta)) / 2);
    const correlationProxy = sameDirection ? 0.5 + magnitude * 0.4 : 0.2;
    if (correlationProxy > 0.7) drag += 0.20;  // spec: ≥20% reduction when corr > 0.7
    else if (correlationProxy > 0.5) drag += 0.08;
  }
  return Math.max(0.8, 1.0 - Math.min(0.25, drag));
}
