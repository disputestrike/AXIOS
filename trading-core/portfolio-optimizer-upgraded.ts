/**
 * UPGRADED PORTFOLIO OPTIMIZER
 * 
 * Improvements:
 * - Volatility-scaled position sizing (VIX-aware)
 * - Equity-based dynamic sizing
 * - Correlation-aware positioning
 * - Kelly Criterion enhancement
 */

import { Trade } from './types'

interface PortfolioState {
  startingEquity: number
  currentEquity: number
  openPositions: Trade[]
  maxDrawdown: number
  correlationMatrix: Map<string, number> // positionId -> correlation
}

interface SizingParams {
  baseSize: number            // 5% of account
  minSize: number             // 2%
  maxSize: number             // 6%
  maxTotalExposure: number    // 30%
  useDynamicScaling: boolean
  useKellyCriterion: boolean
}

const DEFAULT_PARAMS: SizingParams = {
  baseSize: 0.05,
  minSize: 0.02,
  maxSize: 0.06,
  maxTotalExposure: 0.30,
  useDynamicScaling: true,
  useKellyCriterion: true,
}

let portfolioState: PortfolioState = {
  startingEquity: 100000,
  currentEquity: 100000,
  openPositions: [],
  maxDrawdown: 0,
  correlationMatrix: new Map(),
}

/**
 * UPGRADE 1: Volatility-scaled position sizing
 */
function getVolatilityScaledSize(baseSize: number, vixLevel: number): number {
  let scaleFactor = 1.0

  if (vixLevel < 12) {
    // Low volatility: Can increase size
    scaleFactor = 1.2
  } else if (vixLevel >= 12 && vixLevel <= 20) {
    // Normal volatility
    scaleFactor = 1.0
  } else if (vixLevel > 20 && vixLevel <= 30) {
    // Elevated volatility: Reduce size
    scaleFactor = 0.7
  } else {
    // Extreme volatility: Minimize size
    scaleFactor = 0.4
  }

  return baseSize * scaleFactor
}

/**
 * UPGRADE 2: Equity-based dynamic sizing
 */
function getEquityAdjustedSize(baseSize: number, startingEquity: number, currentEquity: number): number {
  const equityChange = ((currentEquity - startingEquity) / startingEquity) * 100

  let sizeFactor = 1.0

  if (equityChange > 10) {
    // Up 10%+: Can increase size
    sizeFactor = 1.3
  } else if (equityChange > 5) {
    // Up 5-10%
    sizeFactor = 1.15
  } else if (equityChange < -5) {
    // Down 5%-: Reduce size
    sizeFactor = 0.7
  } else if (equityChange < -10) {
    // Down 10%+: Further reduce
    sizeFactor = 0.5
  }

  return baseSize * sizeFactor
}

/**
 * UPGRADE 3: Calculate correlation between positions
 */
function calculateCorrelation(pos1: Trade, pos2: Trade): number {
  // Same underlying = high correlation
  if (pos1.symbol === pos2.symbol) {
    // Both calls or both puts = very correlated
    if (pos1.type === pos2.type) {
      return 0.95
    }
    // Call + put on same symbol = negatively correlated
    return -0.8
  }

  // Different underlyings: estimate based on sector/market correlation
  const correlations: { [key: string]: number } = {
    'SPY_QQQ': 0.85,
    'SPY_IWM': 0.75,
    'SPY_TLT': -0.3,
    'QQQ_IWM': 0.70,
    'QQQ_TLT': -0.25,
    'IWM_TLT': -0.2,
  }

  const key = [pos1.symbol, pos2.symbol].sort().join('_')
  return correlations[key] || 0.3 // Default: low correlation
}

/**
 * UPGRADE 4: Correlation-aware position sizing
 */
function adjustForCorrelation(
  proposedSize: number,
  openPositions: Trade[],
  newTrade: Trade
): number {
  let adjustedSize = proposedSize

  for (const openPos of openPositions) {
    const correlation = calculateCorrelation(openPos, newTrade)

    // If highly correlated (> 0.80) and both losing
    if (correlation > 0.80) {
      const openPosPnl = (openPos.currentPrice || openPos.entryPrice) - (openPos.entryPrice || 0)
      if (openPosPnl < 0) {
        // Reduce new position size to reduce correlation risk
        adjustedSize *= 0.5
      }
    }

    // If negatively correlated, we can size up (hedging benefit)
    if (correlation < -0.5) {
      adjustedSize *= 1.2
    }
  }

  return adjustedSize
}

/**
 * UPGRADE 5: Kelly Criterion enhancement
 */
function kellyCriterionSize(
  winRate: number,
  avgWin: number,
  avgLoss: number,
  currentEquity: number,
  conservativeFactor: number = 0.5 // Half Kelly for safety
): number {
  if (avgWin === 0) return 0

  // f* = (win% × avgWin - loss% × avgLoss) / avgWin
  const kellyFraction =
    ((winRate * avgWin - (1 - winRate) * avgLoss) / avgWin) * conservativeFactor

  // Convert to percentage (0.05 = 5% of account)
  return Math.max(0.01, Math.min(0.10, kellyFraction))
}

/**
 * Calculate optimal position size
 */
export function calculatePositionSize(
  trade: Trade,
  vixLevel: number,
  currentEquity: number,
  startingEquity: number,
  openPositions: Trade[] = [],
  recentWinRate: number = 0.55,
  avgWin: number = 0.015,
  avgLoss: number = 0.01,
  params: Partial<SizingParams> = {}
): {
  size: number
  reason: string
  exposurePercent: number
} {
  const finalParams = { ...DEFAULT_PARAMS, ...params }

  // Start with base size
  let size = finalParams.baseSize

  // UPGRADE 1: Apply volatility scaling
  if (finalParams.useDynamicScaling) {
    size = getVolatilityScaledSize(size, vixLevel)
  }

  // UPGRADE 2: Apply equity scaling
  if (finalParams.useDynamicScaling) {
    size = getEquityAdjustedSize(size, startingEquity, currentEquity)
  }

  // UPGRADE 4: Adjust for correlation
  size = adjustForCorrelation(size, openPositions, trade)

  // UPGRADE 5: Apply Kelly Criterion if desired
  if (finalParams.useKellyCriterion && recentWinRate > 0.45) {
    const kellySize = kellyCriterionSize(recentWinRate, avgWin, avgLoss, currentEquity)
    size = (size + kellySize) / 2 // Average of standard and Kelly
  }

  // Enforce bounds
  size = Math.max(finalParams.minSize, Math.min(finalParams.maxSize, size))

  // Check total exposure
  const currentExposure = openPositions.reduce((sum, pos) => {
    return sum + ((pos.positionSize || finalParams.baseSize) * (pos.entryPrice || 0))
  }, 0)

  const maxExposure = currentEquity * finalParams.maxTotalExposure
  if (currentExposure + size * (trade.entryPrice || 0) > maxExposure) {
    size = Math.max(0, (maxExposure - currentExposure) / (trade.entryPrice || finalParams.baseSize))
  }

  const reason = `VIX=${vixLevel.toFixed(1)}, Equity=${((currentEquity / startingEquity - 1) * 100).toFixed(1)}%, WinRate=${(recentWinRate * 100).toFixed(1)}%`
  const exposurePercent = (size * (trade.entryPrice || 0)) / currentEquity * 100

  return {
    size: Math.max(finalParams.minSize, size),
    reason,
    exposurePercent,
  }
}

/**
 * Update portfolio state
 */
export function updatePortfolioState(
  newEquity: number,
  openPositions: Trade[] = []
) {
  portfolioState.currentEquity = newEquity

  // Track max drawdown
  const drawdown = ((newEquity - portfolioState.startingEquity) / portfolioState.startingEquity) * 100
  if (drawdown < portfolioState.maxDrawdown) {
    portfolioState.maxDrawdown = drawdown
  }

  portfolioState.openPositions = openPositions
}

/**
 * Get portfolio metrics
 */
export function getPortfolioMetrics() {
  return {
    startingEquity: portfolioState.startingEquity,
    currentEquity: portfolioState.currentEquity,
    profit: portfolioState.currentEquity - portfolioState.startingEquity,
    returnPercent: ((portfolioState.currentEquity - portfolioState.startingEquity) / portfolioState.startingEquity) * 100,
    maxDrawdown: portfolioState.maxDrawdown,
    openPositionCount: portfolioState.openPositions.length,
    totalExposure: portfolioState.openPositions.reduce((sum, pos) => {
      return sum + ((pos.positionSize || 0.05) * (pos.currentPrice || pos.entryPrice || 0))
    }, 0),
  }
}

export default {
  calculatePositionSize,
  updatePortfolioState,
  getPortfolioMetrics,
  getVolatilityScaledSize,
  getEquityAdjustedSize,
  kellyCriterionSize,
}
