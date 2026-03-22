/**
 * Advanced Position Sizing Algorithms
 * Implements Kelly Criterion, Fixed Fractional, and Adaptive sizing.
 * Blueprint: confidence scales within allowed risk; never increases absolute cap.
 */

/**
 * Confidence multiplier for position sizing (smooth, clipped).
 * Formula: 0.7 + (confidence * 0.6), clamped [0.7, 1.25].
 * Max upside +25%, downside protection −30%. Turn on with ENABLE_CONFIDENCE_SIZING.
 */
export function getConfidenceMultiplier(confidence?: number): number {
  if (confidence == null) return 1.0;
  return Math.min(1.25, Math.max(0.7, 0.7 + confidence * 0.6));
}

export interface PositionSizeResult {
  quantity: number;
  riskAmount: number;
  positionValue: number;
  sizingMethod: 'kelly' | 'fractional_kelly' | 'fixed_fractional' | 'adaptive';
  kellyPercent?: number;
  recommendedSize: number;
  maxSize: number;
  rationale: string;
}

export interface SizingInputs {
  accountBalance: number;
  winProbability: number; // 0-1
  avgWinSize: number; // Average winning trade %
  avgLossSize: number; // Average losing trade %
  currentDrawdown: number; // Current drawdown %
  volatility: number; // Current market volatility
  correlation: number; // Correlation with existing positions
  /** Maximum risk % of account (e.g. 0.01 = 1%). For options, should reflect max loss per structure: e.g. (width×100 − credit) for spreads, (strike×100 − premium) for CSP. */
  maxRiskPerTrade: number;
  optionPrice: number;
  strike: number;
  currentPrice: number;
}

/**
 * Calculate optimal position size using Kelly Criterion
 * Kelly % = (Win Probability * Avg Win - Loss Probability * Avg Loss) / Avg Win
 */
export function calculateKellyPositionSize(inputs: SizingInputs): PositionSizeResult {
  const { winProbability, avgWinSize, avgLossSize, accountBalance, optionPrice, maxRiskPerTrade } = inputs;
  
  const lossProbability = 1 - winProbability;
  
  // Full Kelly Criterion
  const kellyPercent = (winProbability * avgWinSize - lossProbability * avgLossSize) / avgWinSize;
  
  // Use fractional Kelly (typically 25-50% of full Kelly for safety)
  const fractionalKelly = kellyPercent * 0.25; // 25% of Kelly for conservative approach
  
  // Calculate position size
  const riskAmount = accountBalance * Math.min(fractionalKelly, maxRiskPerTrade);
  const quantity = Math.floor(riskAmount / (optionPrice * 100));
  
  const positionValue = quantity * optionPrice * 100;
  
  return {
    quantity: Math.max(1, quantity),
    riskAmount,
    positionValue,
    sizingMethod: 'fractional_kelly',
    kellyPercent: kellyPercent * 100,
    recommendedSize: quantity,
    maxSize: Math.floor((accountBalance * maxRiskPerTrade) / (optionPrice * 100)),
    rationale: `Kelly Criterion: ${(kellyPercent * 100).toFixed(2)}% (using 25% fractional = ${(fractionalKelly * 100).toFixed(2)}%)`,
  };
}

/**
 * Calculate position size using Fixed Fractional method
 * Risk a fixed percentage of account on each trade
 */
export function calculateFixedFractionalSize(inputs: SizingInputs): PositionSizeResult {
  const { accountBalance, optionPrice, maxRiskPerTrade } = inputs;
  
  const riskAmount = accountBalance * maxRiskPerTrade;
  const quantity = Math.floor(riskAmount / (optionPrice * 100));
  const positionValue = quantity * optionPrice * 100;
  
  return {
    quantity: Math.max(1, quantity),
    riskAmount,
    positionValue,
    sizingMethod: 'fixed_fractional',
    recommendedSize: quantity,
    maxSize: quantity,
    rationale: `Fixed fractional: ${(maxRiskPerTrade * 100).toFixed(2)}% of account = $${riskAmount.toFixed(2)} risk`,
  };
}

/**
 * Adaptive position sizing based on recent performance and market conditions
 */
export function calculateAdaptiveSize(inputs: SizingInputs): PositionSizeResult {
  const { 
    accountBalance, 
    optionPrice, 
    maxRiskPerTrade,
    currentDrawdown,
    volatility,
    correlation,
    winProbability,
  } = inputs;
  
  // Base risk
  let riskPercent = maxRiskPerTrade;
  
  // Reduce size during drawdowns
  if (currentDrawdown > 0.05) { // 5% drawdown
    riskPercent *= 0.5; // Cut size in half
  } else if (currentDrawdown > 0.02) { // 2% drawdown
    riskPercent *= 0.75; // Reduce by 25%
  }
  
  // Reduce size in high volatility
  if (volatility > 0.35) {
    riskPercent *= 0.7; // Reduce 30% in high vol
  } else if (volatility > 0.25) {
    riskPercent *= 0.85; // Reduce 15% in medium-high vol
  }
  
  // Reduce size for correlated positions
  if (correlation > 0.7) {
    riskPercent *= 0.6; // Reduce 40% for high correlation
  } else if (correlation > 0.5) {
    riskPercent *= 0.8; // Reduce 20% for medium correlation
  }
  
  // Increase size slightly for high-probability trades
  if (winProbability > 0.70) {
    riskPercent *= 1.1; // Increase 10% for high probability
  } else if (winProbability < 0.55) {
    riskPercent *= 0.8; // Reduce 20% for lower probability
  }
  
  // Ensure we don't exceed max risk
  riskPercent = Math.min(riskPercent, maxRiskPerTrade);
  
  const riskAmount = accountBalance * riskPercent;
  const quantity = Math.floor(riskAmount / (optionPrice * 100));
  const positionValue = quantity * optionPrice * 100;
  
  return {
    quantity: Math.max(1, quantity),
    riskAmount,
    positionValue,
    sizingMethod: 'adaptive',
    recommendedSize: quantity,
    maxSize: Math.floor((accountBalance * maxRiskPerTrade) / (optionPrice * 100)),
    rationale: `Adaptive sizing: ${(riskPercent * 100).toFixed(2)}% (adjusted for drawdown: ${(currentDrawdown * 100).toFixed(1)}%, vol: ${(volatility * 100).toFixed(1)}%, correlation: ${(correlation * 100).toFixed(1)}%)`,
  };
}

/**
 * Calculate optimal position size (uses best method based on inputs)
 */
export function calculateOptimalPositionSize(inputs: SizingInputs): PositionSizeResult {
  // If we have win probability and historical data, use Kelly
  if (inputs.winProbability > 0 && inputs.avgWinSize > 0 && inputs.avgLossSize > 0) {
    const kellyResult = calculateKellyPositionSize(inputs);
    
    // Use adaptive sizing as a safety check
    const adaptiveResult = calculateAdaptiveSize(inputs);
    
    // Use the more conservative of the two
    if (kellyResult.quantity <= adaptiveResult.quantity) {
      return {
        ...kellyResult,
        rationale: `${kellyResult.rationale} | Adaptive check: ${adaptiveResult.rationale}`,
      };
    } else {
      return {
        ...adaptiveResult,
        sizingMethod: 'fractional_kelly',
        kellyPercent: kellyResult.kellyPercent,
        rationale: `Kelly suggests ${kellyResult.quantity} but adaptive limits to ${adaptiveResult.quantity} | ${adaptiveResult.rationale}`,
      };
    }
  }
  
  // Otherwise use adaptive sizing
  return calculateAdaptiveSize(inputs);
}

/**
 * Calculate portfolio-level position sizing (considering all positions)
 */
export function calculatePortfolioAwareSize(
  inputs: SizingInputs,
  existingPositions: Array<{ symbol: string; quantity: number; delta: number }>
): PositionSizeResult {
  // Calculate correlation-adjusted size
  const baseSize = calculateOptimalPositionSize(inputs);
  
  // Check total portfolio exposure
  const totalExposure = existingPositions.reduce((sum, pos) => sum + Math.abs(pos.delta * pos.quantity), 0);
  const maxPortfolioExposure = inputs.accountBalance * 0.15; // Max 15% total delta exposure
  
  if (totalExposure + baseSize.positionValue > maxPortfolioExposure) {
    // Reduce size to fit within portfolio limits
    const availableExposure = maxPortfolioExposure - totalExposure;
    const adjustedQuantity = Math.floor(availableExposure / (inputs.optionPrice * 100));
    
    return {
      ...baseSize,
      quantity: Math.max(1, adjustedQuantity),
      positionValue: adjustedQuantity * inputs.optionPrice * 100,
      rationale: `${baseSize.rationale} | Portfolio limit: reduced to ${adjustedQuantity} to stay within 15% total exposure`,
    };
  }
  
  return baseSize;
}
