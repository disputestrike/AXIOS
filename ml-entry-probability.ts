/**
 * ML-Style Entry Probability (Hedge Fund Style)
 * Factor ensemble that combines score, win prob, signal confidence, regime, volatility
 * into a single "entry probability" 0–1. Plug point for real ML (TensorFlow/XGBoost) later.
 */

export interface EntryProbabilityInputs {
  score: number;           // 0–100
  winProbability: number;  // 0–1
  signalConfidence: number; // 0–1
  expectedReturn: number;   // % (e.g. 2.5)
  regime: string;
  volatility: number;      // e.g. 0.25
  volumeRatio?: number;    // volume / avgVolume
  ivRank?: number;         // 0–100
}

/**
 * Factor-ensemble "entry probability" (no external ML yet).
 * Weights: score 25%, win prob 30%, signal conf 25%, regime 10%, vol/return 10%.
 * Top firms replace this with a trained model (Random Forest / neural net on same features).
 */
export function computeEntryProbability(inputs: EntryProbabilityInputs): {
  probability: number;
  rationale: string;
} {
  const { score, winProbability, signalConfidence, expectedReturn, regime, volatility, volumeRatio = 1, ivRank = 50 } = inputs;
  const scoreNorm = Math.min(100, Math.max(0, score)) / 100;
  const regimeBonus = regime.includes('bull') ? 0.08 : regime.includes('bear') ? -0.05 : 0;
  const volPenalty = volatility > 0.35 ? -0.05 : volatility > 0.25 ? -0.02 : 0;
  const returnBonus = Math.min(10, Math.max(0, expectedReturn)) / 100;
  const volumeBonus = volumeRatio > 1.5 ? 0.03 : volumeRatio > 1.2 ? 0.01 : 0;
  const ivBonus = ivRank > 60 ? 0.02 : ivRank > 40 ? 0.01 : 0;

  let prob = scoreNorm * 0.25 + winProbability * 0.30 + signalConfidence * 0.25
    + (0.1 + regimeBonus + volPenalty + returnBonus * 0.5 + volumeBonus + ivBonus);
  prob = Math.max(0, Math.min(1, prob));

  const rationale = `Entry prob ${(prob * 100).toFixed(1)}% (score ${scoreNorm.toFixed(2)}, win ${(winProbability * 100).toFixed(0)}%, conf ${(signalConfidence * 100).toFixed(0)}%, regime ${regime})`;
  return { probability: prob, rationale };
}

/**
 * Threshold for "trade or skip" — hedge fund style: only enter when probability exceeds this.
 * 10/10: configurable via env ENTRY_PROBABILITY_THRESHOLD (0–1). Default 0.65.
 */
export const ENTRY_PROBABILITY_THRESHOLD = (() => {
  const v = process.env.ENTRY_PROBABILITY_THRESHOLD;
  if (v == null || v === '') return 0.65;
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.65;
})();

export function shouldEnterByProbability(probability: number, threshold: number = ENTRY_PROBABILITY_THRESHOLD): boolean {
  return probability >= threshold;
}
