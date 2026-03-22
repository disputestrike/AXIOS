/**
 * UPGRADED TRADE SCORER
 * 
 * Improvements:
 * - Dynamic weight adjustment based on recent performance
 * - Improved hard filters (tighter thresholds)
 * - Volatility-based adaptation
 * - Score decay logic
 */

import { Trade, ScoredTrade } from './types'

interface ScorerWeights {
  ml: number              // ML probability
  greeks: number          // Greeks quality
  iv: number              // IV rank
  flow: number            // Flow analysis
  momentum: number        // Momentum
}

interface ScorerState {
  baseWeights: ScorerWeights
  currentWeights: ScorerWeights
  recentTrades: Trade[]
  cyclesSinceAdjustment: number
}

const DEFAULT_WEIGHTS: ScorerWeights = {
  ml: 0.30,
  greeks: 0.25,
  iv: 0.20,
  flow: 0.15,
  momentum: 0.10,
}

// UPGRADE: Track scorer state for dynamic adjustment
let scorerState: ScorerState = {
  baseWeights: { ...DEFAULT_WEIGHTS },
  currentWeights: { ...DEFAULT_WEIGHTS },
  recentTrades: [],
  cyclesSinceAdjustment: 0,
}

/**
 * UPGRADE 1: Dynamically adjust weights based on recent performance
 */
function adjustWeightsFromPerformance(trades: Trade[]) {
  if (trades.length < 10) return // Need minimum sample

  const recentWins = trades.filter(t => t.pnl && t.pnl > 0)
  const winRate = recentWins.length / trades.length

  // Get average characteristics of winning trades
  const winningTradeCharacteristics = {
    avgMlScore: recentWins.reduce((sum, t) => sum + (t.mlScore || 0), 0) / recentWins.length,
    avgDelta: recentWins.reduce((sum, t) => sum + (t.delta || 0), 0) / recentWins.length,
    avgIvRank: recentWins.reduce((sum, t) => sum + (t.ivRank || 0), 0) / recentWins.length,
    avgFlowScore: recentWins.reduce((sum, t) => sum + (t.flowScore || 0), 0) / recentWins.length,
  }

  // UPGRADE: Adjust weights toward winning characteristics
  if (winRate > 0.60) {
    // Increase weight of winning factors
    scorerState.currentWeights.ml = Math.min(scorerState.currentWeights.ml + 0.02, 0.35)
    scorerState.currentWeights.iv = Math.max(scorerState.currentWeights.iv - 0.01, 0.15)
  } else if (winRate < 0.45) {
    // Increase risk management focus
    scorerState.currentWeights.greeks = Math.min(scorerState.currentWeights.greeks + 0.03, 0.30)
    scorerState.currentWeights.momentum = Math.max(scorerState.currentWeights.momentum - 0.02, 0.05)
  }

  // Renormalize weights
  const weightSum = Object.values(scorerState.currentWeights).reduce((a, b) => a + b, 0)
  for (const key in scorerState.currentWeights) {
    (scorerState.currentWeights as any)[key] /= weightSum
  }
}

/**
 * UPGRADE 2: Volatility-based adaptation
 */
function getVolatilityAdjustedWeights(vixLevel: number): ScorerWeights {
  const weights = { ...scorerState.currentWeights }

  // High VIX = reduce aggressive signals
  if (vixLevel > 25) {
    weights.momentum = Math.max(weights.momentum - 0.02, 0.05)
    weights.greeks = Math.min(weights.greeks + 0.02, 0.30)
  }
  // Low VIX = can be more aggressive
  else if (vixLevel < 12) {
    weights.momentum = Math.min(weights.momentum + 0.02, 0.15)
    weights.ml = Math.max(weights.ml - 0.01, 0.25)
  }

  // Renormalize
  const weightSum = Object.values(weights).reduce((a, b) => a + b, 0)
  for (const key in weights) {
    (weights as any)[key] /= weightSum
  }

  return weights
}

/**
 * UPGRADE 3: Improved hard filters
 */
function passesHardFilters(trade: Trade, vixLevel: number): boolean {
  // UPGRADE: Tighter delta range (0.35-0.65 instead of 0.30-0.70)
  if (!trade.delta || trade.delta < 0.35 || trade.delta > 0.65) {
    return false
  }

  // UPGRADE: Higher volume requirement (800+ instead of 500)
  if (!trade.volume || trade.volume < 800) {
    return false
  }

  // UPGRADE: Higher OI requirement (1500+ instead of 1000)
  if (!trade.openInterest || trade.openInterest < 1500) {
    return false
  }

  // UPGRADE: Tighter spread requirement (< 3% instead of < 5%)
  const spreadPercent = ((trade.ask || 0) - (trade.bid || 0)) / ((trade.bid || 1) * 100)
  if (spreadPercent > 0.03) {
    return false
  }

  // UPGRADE: Higher ML threshold (> 0.70 instead of > 0.65)
  if (!trade.mlScore || trade.mlScore < 0.70) {
    return false
  }

  // UPGRADE: Volatility-adjusted filtering
  if (vixLevel > 30) {
    // Extreme volatility: raise all thresholds
    if ((trade.volume || 0) < 1200) return false
    if ((trade.mlScore || 0) < 0.75) return false
  }

  return true
}

/**
 * Score a trade based on multiple factors
 */
export function scoreTrade(trade: Trade, vixLevel: number = 20): ScoredTrade {
  // Check hard filters first
  if (!passesHardFilters(trade, vixLevel)) {
    return {
      ...trade,
      score: 0,
      passesFilters: false,
      confidence: 0,
    }
  }

  // Get volatility-adjusted weights
  const weights = getVolatilityAdjustedWeights(vixLevel)

  // Calculate weighted score
  let score = 0
  score += (trade.mlScore || 0) * weights.ml * 100          // 0-100
  score += ((trade.greeksQuality || 0.5) * weights.greeks * 100)  // 0-100 (normalized)
  score += (trade.ivRank || 0) * weights.iv                 // 0-100
  score += (trade.flowScore || 0) * weights.flow            // 0-100
  score += (trade.momentum || 0) * weights.momentum * 100    // 0-100

  // Normalize to 0-100
  score = Math.min(100, Math.max(0, score))

  // UPGRADE 4: Score decay logic
  const expiryDaysLeft = trade.expiryDaysToExpiration || 0
  let decayFactor = 1.0
  
  if (expiryDaysLeft < 1) {
    decayFactor = 0.5 // Last day: 50% decay
  } else if (expiryDaysLeft < 3) {
    decayFactor = 0.75 // Last 3 days: 25% decay
  }

  score = score * decayFactor

  return {
    ...trade,
    score: Math.round(score),
    passesFilters: true,
    confidence: calculateConfidence(trade),
    weights: weights,
  }
}

/**
 * Calculate confidence based on factor alignment
 */
function calculateConfidence(trade: Trade): number {
  let alignedFactors = 0

  if ((trade.mlScore || 0) > 0.72) alignedFactors++
  if ((trade.ivRank || 0) > 55) alignedFactors++
  if ((trade.flowScore || 0) > 60) alignedFactors++
  if ((trade.delta || 0) > 0.45 && (trade.delta || 0) < 0.55) alignedFactors++
  if ((trade.volume || 0) > 1500) alignedFactors++

  // 0-5 factors aligned → 0-100 confidence
  return (alignedFactors / 5) * 100
}

/**
 * Score multiple trades and return ranked list
 */
export function scoreAndRank(trades: Trade[], vixLevel: number = 20): ScoredTrade[] {
  return trades
    .map(trade => scoreTrade(trade, vixLevel))
    .filter(scored => scored.score > 0)
    .sort((a, b) => {
      // Sort by score, then by confidence
      if (b.score !== a.score) return b.score - a.score
      return (b.confidence || 0) - (a.confidence || 0)
    })
}

/**
 * Update scorer with recent trades for learning
 */
export function updateScorerWithTrades(trades: Trade[]) {
  scorerState.recentTrades = [...scorerState.recentTrades, ...trades].slice(-100) // Keep last 100

  scorerState.cyclesSinceAdjustment++

  // Adjust weights every 10 trades
  if (scorerState.cyclesSinceAdjustment >= 10) {
    adjustWeightsFromPerformance(scorerState.recentTrades)
    scorerState.cyclesSinceAdjustment = 0
  }
}

/**
 * Get current scorer state (for debugging/analysis)
 */
export function getScorerState() {
  return {
    baseWeights: scorerState.baseWeights,
    currentWeights: scorerState.currentWeights,
    recentTradeCount: scorerState.recentTrades.length,
    recentWinRate: 
      scorerState.recentTrades.filter(t => t.pnl && t.pnl > 0).length /
      Math.max(1, scorerState.recentTrades.length),
  }
}

export default {
  scoreTrade,
  scoreAndRank,
  updateScorerWithTrades,
  getScorerState,
  getVolatilityAdjustedWeights,
  passesHardFilters,
}
