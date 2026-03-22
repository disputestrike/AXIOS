/**
 * A+++ Pillar 3: Greeks-aware expected value.
 * Black–Scholes expected move, realized vol decay, Greeks profile (delta, gamma, theta, vega).
 */

/** Black–Scholes 1σ expected move: spot × IV × sqrt(DTE/365). */
export function blackScholesExpectedMove(
  spot: number,
  iv: number,
  daysToExpiry: number
): number {
  const t = Math.max(0.01, daysToExpiry / 365);
  return spot * iv * Math.sqrt(t);
}

/** Realized vol decay adjustment: realized_vol_20d / IV ratio (cap 0.5–1.5). */
export function realizedVolDecayRatio(realizedVol20d: number, iv: number): number {
  if (!iv || iv <= 0) return 1.0;
  const ratio = realizedVol20d / iv;
  return Math.max(0.5, Math.min(1.5, ratio));
}

/**
 * Greeks-aware expected return proxy.
 * baseExpectedReturn × regimeMultiplier × volDecayRatio + greeksBonus (theta/gamma/vega by regime).
 */
export function greeksAwareExpectedReturn(
  baseExpectedReturn: number,
  regimeMultiplier: number,
  volDecayRatio: number,
  greeks?: { theta?: number; gamma?: number; vega?: number },
  regime?: string,
  structureType?: string
): number {
  let ev = baseExpectedReturn * regimeMultiplier * volDecayRatio;
  if (!greeks || !regime) return ev;
  const r = (regime || '').toLowerCase();
  const s = (structureType || '').toLowerCase();
  const premiumSelling = r.includes('bull_vol_compression') || r === 'mean_reverting' || r.includes('trending_bull');
  if (premiumSelling && (greeks.theta ?? 0) > 0) ev += 0.5;
  if (premiumSelling && (greeks.gamma ?? 0) < 0 && s.includes('condor')) ev += 0.3;
  if (r.includes('bull_vol_expansion') && (greeks.vega ?? 0) > 0) ev += 0.4;
  return Math.max(0, ev);
}

/**
 * Normalized Greeks profile score 0–1 for composite (theta, gamma, vega vs regime).
 */
export function greeksProfileScore(
  regime: string,
  structureType: string,
  greeks?: { theta?: number; gamma?: number; vega?: number }
): number {
  if (!greeks) return 0.5;
  const r = (regime || '').toLowerCase();
  const s = (structureType || '').toLowerCase();
  let score = 0.5;
  const premiumSelling = r.includes('bull_vol_compression') || r === 'mean_reverting' || r.includes('trending_bull');
  if (premiumSelling) {
    if ((greeks.theta ?? 0) > 0) score += 0.15;
    if ((greeks.gamma ?? 0) < 0 && s.includes('condor')) score += 0.1;
  }
  if (r.includes('bull_vol_expansion') && (greeks.vega ?? 0) > 0) score += 0.15;
  return Math.max(0, Math.min(1, score));
}
