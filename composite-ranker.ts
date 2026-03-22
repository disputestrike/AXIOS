/**
 * AOIX-1 A+++ Composite Ranker — 9-Pillar Architecture
 * FINAL_SCORE = (p1×0.22 + p2×0.18 + p3×0.16 + p4×0.15 + p5×0.13 + p6×0.11 + p7×0.10 + p8×0.08 + p9×0.07) × 100
 * Tier: 85–100 Elite | 70–84 Strong | 55–69 Moderate | 40–54 Watch | 0–39 Reject
 */

import {
  getRegimeSignalAlignment,
  getStabilityPenalty,
  getIVRegimeMultiplier,
  getStructureGreeksScore,
  getDataFreshnessFactor,
  getDTEScoreFactor,
  getDataSourceFactor,
  getCorrelationAlignment,
} from './ranking-utils';
import { getStructureAffinity } from './structure-selector';
import { greeksProfileScore } from './greeks-engine';
import { regimeVolAlignment } from './iv-surface-analyzer';

export type APlusTier = 'elite' | 'strong' | 'moderate' | 'watch' | 'reject';

export interface CompositeRankerInput {
  symbol: string;
  /** Opportunity score 0–100 (from calculateRealScore). */
  score: number;
  /** Win probability 0–1. */
  winProbability: number;
  /** Expected return (e.g. %). */
  expectedReturn: number;
  /** Signal confidence 0–1 (multi-TF adjusted). */
  signalConfidence: number;
  /** Signal class (A/B/C/D). */
  signalClass: string;
  /** Regime ID. */
  regime: string;
  /** Regime stability 0–1. */
  regimeStability?: number;
  /** Transition probability 0–1. */
  transitionProbability?: number;
  /** Structure type (e.g. iron_condor, vertical_spread). */
  structureType: string;
  /** IV rank 0–100. */
  ivRank?: number;
  /** Data freshness timestamp (ms). */
  timestamp: number;
  /** Data source. */
  dataSource?: 'ibkr';
  /** Days to expiry. */
  daysToExpiry?: number;
  /** Greeks (optional). */
  greeks?: { delta?: number; theta?: number; gamma?: number; vega?: number };
  /** Volume / avgVolume (flow proxy). */
  volumeRatio?: number;
  /** Unusual flow / sweep count from options flow (optional). */
  unusualFlow?: boolean;
  sweepCount?: number;
  /** Phase 3: precomputed microstructure composite 0–1. */
  microstructureCompositeScore?: number;
  /** Phase 4: precomputed execution cost multiplier 0.95–1.0. */
  executionCostMultiplier?: number;
  /** Phase 4: OOS penalty factor 0.85–1.0. */
  oosPenaltyFactor?: number;
}

export interface ExistingPosition {
  symbol: string;
  delta?: number;
}

export interface CompositeRankerResult {
  /** Final score 0–100. */
  score: number;
  tier: APlusTier;
  /** Tier label for UI. */
  tierLabel: string;
  /** Per-pillar scores 0–1 (for diagnostics). */
  pillarScores: {
    p1_signal: number;
    p2_regime: number;
    p3_greeks_ev: number;
    p4_correlation: number;
    p5_microstructure: number;
    p6_iv_regime: number;
    p7_structure: number;
    p8_execution: number;
    p9_oos: number;
  };
}

const PILLAR_WEIGHTS = [0.22, 0.18, 0.16, 0.15, 0.13, 0.11, 0.10, 0.08, 0.07] as const;

function getTier(score: number): { tier: APlusTier; tierLabel: string } {
  if (score >= 85) return { tier: 'elite', tierLabel: 'Elite' };
  if (score >= 70) return { tier: 'strong', tierLabel: 'Strong' };
  if (score >= 55) return { tier: 'moderate', tierLabel: 'Moderate' };
  if (score >= 40) return { tier: 'watch', tierLabel: 'Watch' };
  return { tier: 'reject', tierLabel: 'Reject' };
}

/**
 * Compute 9-pillar composite score and tier from opportunity + optional existing positions.
 * Uses existing ranking-utils for alignment, stability, IV, DTE, data source, correlation, structure Greeks.
 */
export function computeCompositeRank(
  opp: CompositeRankerInput,
  existingPositions: ExistingPosition[] = []
): CompositeRankerResult {
  // P1: Signal confidence & multi-TF (22%). Normalize score contribution + regime-signal alignment.
  const regimeSignalMult = getRegimeSignalAlignment(opp.regime, opp.signalClass);
  const p1 = Math.min(1, (opp.signalConfidence * 0.7 + (opp.score / 100) * 0.3) * regimeSignalMult);

  // P2: Regime classification & persistence (18%). Stability, low transition = higher.
  const stabilityPenalty = getStabilityPenalty(opp.regimeStability, opp.transitionProbability);
  const p2 = Math.max(0, 1 - stabilityPenalty);

  // P3: Greeks-aware expected value (16%). Expected return proxy + Greeks profile (Phase 2).
  const evNorm = Math.min(1, opp.expectedReturn / 25);
  const structureGreeks = opp.greeks
    ? greeksProfileScore(opp.regime, opp.structureType, opp.greeks)
    : (getStructureGreeksScore(opp.regime, opp.structureType, undefined) + 5) / 10;
  const p3 = Math.min(1, evNorm * 0.6 + structureGreeks * 0.4);

  // P4: Risk contribution & portfolio correlation (15%).
  const correlationAlignment = getCorrelationAlignment(
    { symbol: opp.symbol, greeks: opp.greeks },
    existingPositions
  );
  const p4 = correlationAlignment;

  // P5: Market microstructure & flow (13%). Volume ratio + unusual flow/sweeps.
  let p5 = 0.5;
  if (opp.volumeRatio != null) {
    if (opp.volumeRatio > 2) p5 = 0.9;
    else if (opp.volumeRatio > 1.5) p5 = 0.75;
    else if (opp.volumeRatio > 1.2) p5 = 0.6;
  }
  if (opp.unusualFlow) p5 = Math.min(1, p5 + 0.15);
  if ((opp.sweepCount ?? 0) > 0) p5 = Math.min(1, p5 + 0.1);

  // P6: Volatility regime & IV term structure (11%). IV rank + regime vol alignment (Phase 2).
  const ivRank = opp.ivRank ?? 50;
  const ivMult = getIVRegimeMultiplier(opp.regime, ivRank);
  const volAlign = regimeVolAlignment(opp.regime, ivRank);
  const p6 = (ivRank / 100) * ivMult * volAlign;
  const p6Clamped = Math.min(1, Math.max(0, p6));

  // P7: Structure suitability & Greeks profile (10%). Regime-structure fit + DTE.
  const dteFactor = getDTEScoreFactor(opp.daysToExpiry);
  const structureFit = regimeSignalMult; // reuse; full 150 triplets = Phase 2
  const p7 = Math.min(1, (structureFit * 0.6 + dteFactor * 0.4));

  // P8: Execution cost & slippage (8%). Phase 3: execution cost model or freshness + data source.
  const freshness = getDataFreshnessFactor(opp.timestamp);
  const dataSource = getDataSourceFactor(opp.dataSource);
  const p8 = (opp.executionCostMultiplier ?? 1.0) * freshness * dataSource;

  // P9: Live track record & overfitting (7%). Phase 4: OOS validator penalty.
  const p9 = opp.oosPenaltyFactor ?? 1.0;

  const raw =
    p1 * PILLAR_WEIGHTS[0] +
    p2 * PILLAR_WEIGHTS[1] +
    p3 * PILLAR_WEIGHTS[2] +
    p4 * PILLAR_WEIGHTS[3] +
    p5 * PILLAR_WEIGHTS[4] +
    p6Clamped * PILLAR_WEIGHTS[5] +
    p7 * PILLAR_WEIGHTS[6] +
    p8 * PILLAR_WEIGHTS[7] +
    p9 * PILLAR_WEIGHTS[8];
  const score = Math.max(0, Math.min(100, raw * 100));
  const { tier, tierLabel } = getTier(score);

  return {
    score,
    tier,
    tierLabel,
    pillarScores: {
      p1_signal: p1,
      p2_regime: p2,
      p3_greeks_ev: p3,
      p4_correlation: p4,
      p5_microstructure: p5,
      p6_iv_regime: p6Clamped,
      p7_structure: p7,
      p8_execution: p8,
      p9_oos: p9,
    },
  };
}

/** Tier thresholds for sizing: Elite 100%, Strong 75%, Moderate 50%, Watch 25%, Reject 0%. */
export function getTierSizingMultiplier(tier: APlusTier): number {
  switch (tier) {
    case 'elite':
      return 1.0;
    case 'strong':
      return 0.75;
    case 'moderate':
      return 0.5;
    case 'watch':
      return 0.25;
    case 'reject':
      return 0;
    default:
      return 0.5;
  }
}
