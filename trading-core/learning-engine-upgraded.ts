/**
 * UPGRADED LEARNING ENGINE
 * 
 * Improvements:
 * - Active weight tuning every 10 trades
 * - Loss analysis and correction
 * - Bounded learning (safety guardrails)
 * - Session-based pattern learning
 */

interface LearningState {
  tradeHistory: Array<{
    timestamp: number
    symbol: string
    entryPrice: number
    exitPrice: number
    pnl: number
    pnlPercent: number
    mlScore: number
    deltaScore: number
    ivScore: number
    flowScore: number
    momentumScore: number
  }>
  currentWeights: {
    ml: number
    delta: number
    iv: number
    flow: number
    momentum: number
  }
  baseWeights: {
    ml: number
    delta: number
    iv: number
    flow: number
    momentum: number
  }
  tradesProcessed: number
  winRate: number
  profitFactor: number
  lastAdjustmentTrade: number
  adjustmentHistory: Array<{
    tradeCount: number
    previousWeights: any
    newWeights: any
    reason: string
    resultingWinRate: number
  }>
}

const DEFAULT_WEIGHTS = {
  ml: 0.30,
  delta: 0.25,
  iv: 0.20,
  flow: 0.15,
  momentum: 0.10,
}

let learningState: LearningState = {
  tradeHistory: [],
  currentWeights: { ...DEFAULT_WEIGHTS },
  baseWeights: { ...DEFAULT_WEIGHTS },
  tradesProcessed: 0,
  winRate: 0.55,
  profitFactor: 1.5,
  lastAdjustmentTrade: 0,
  adjustmentHistory: [],
}

/**
 * Record a completed trade
 */
export function recordTrade(trade: {
  symbol: string
  entryPrice: number
  exitPrice: number
  pnl: number
  mlScore: number
  deltaScore: number
  ivScore: number
  flowScore: number
  momentumScore: number
}) {
  const pnlPercent = ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100

  learningState.tradeHistory.push({
    timestamp: Date.now(),
    symbol: trade.symbol,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    pnl: trade.pnl,
    pnlPercent,
    mlScore: trade.mlScore,
    deltaScore: trade.deltaScore,
    ivScore: trade.ivScore,
    flowScore: trade.flowScore,
    momentumScore: trade.momentumScore,
  })

  learningState.tradesProcessed++

  // Keep only last 100 trades
  if (learningState.tradeHistory.length > 100) {
    learningState.tradeHistory.shift()
  }

  // Check if we should adjust weights (every 10 trades)
  if (learningState.tradesProcessed - learningState.lastAdjustmentTrade >= 10) {
    adjustWeightsBasedOnPerformance()
    learningState.lastAdjustmentTrade = learningState.tradesProcessed
  }
}

/**
 * UPGRADE 1: Analyze winning vs losing trades
 */
function analyzeTradeCharacteristics(): {
  winningTrades: LearningState['tradeHistory']
  losingTrades: LearningState['tradeHistory']
  winningCharacteristics: any
  losingCharacteristics: any
} {
  const winningTrades = learningState.tradeHistory.filter(t => t.pnl > 0)
  const losingTrades = learningState.tradeHistory.filter(t => t.pnl < 0)

  const avgScore = (trades: typeof learningState.tradeHistory, key: string) =>
    trades.length > 0
      ? trades.reduce((sum, t) => sum + (t[key as keyof typeof t] as number), 0) / trades.length
      : 0

  return {
    winningTrades,
    losingTrades,
    winningCharacteristics: {
      avgMlScore: avgScore(winningTrades, 'mlScore'),
      avgDeltaScore: avgScore(winningTrades, 'deltaScore'),
      avgIvScore: avgScore(winningTrades, 'ivScore'),
      avgFlowScore: avgScore(winningTrades, 'flowScore'),
      avgMomentumScore: avgScore(winningTrades, 'momentumScore'),
    },
    losingCharacteristics: {
      avgMlScore: avgScore(losingTrades, 'mlScore'),
      avgDeltaScore: avgScore(losingTrades, 'deltaScore'),
      avgIvScore: avgScore(losingTrades, 'ivScore'),
      avgFlowScore: avgScore(losingTrades, 'flowScore'),
      avgMomentumScore: avgScore(losingTrades, 'momentumScore'),
    },
  }
}

/**
 * UPGRADE 2: Adjust weights based on performance
 */
function adjustWeightsBasedOnPerformance() {
  if (learningState.tradeHistory.length < 10) {
    return // Need minimum sample
  }

  const analysis = analyzeTradeCharacteristics()
  const previousWeights = { ...learningState.currentWeights }

  // Calculate metrics
  const wins = analysis.winningTrades.length
  const losses = analysis.losingTrades.length
  const total = wins + losses

  learningState.winRate = total > 0 ? wins / total : 0.55
  learningState.profitFactor = calculateProfitFactor(analysis.winningTrades, analysis.losingTrades)

  // UPGRADE: Adjust weights toward winning factors
  if (learningState.winRate > 0.60) {
    // High win rate: increase winning factors
    const winChars = analysis.winningCharacteristics
    const losingChars = analysis.losingCharacteristics

    // Increase weight of factors that are better in winning trades
    if (winChars.avgMlScore > losingChars.avgMlScore) {
      learningState.currentWeights.ml = Math.min(
        learningState.currentWeights.ml + 0.02,
        0.35
      )
    }

    if (winChars.avgFlowScore > losingChars.avgFlowScore) {
      learningState.currentWeights.flow = Math.min(
        learningState.currentWeights.flow + 0.01,
        0.20
      )
    }

    // Decrease factors that are worse in winning trades
    if (winChars.avgMomentumScore < losingChars.avgMomentumScore) {
      learningState.currentWeights.momentum = Math.max(
        learningState.currentWeights.momentum - 0.02,
        0.05
      )
    }
  } else if (learningState.winRate < 0.45) {
    // Low win rate: increase risk management focus
    learningState.currentWeights.delta = Math.min(
      learningState.currentWeights.delta + 0.03,
      0.30
    )
    learningState.currentWeights.iv = Math.min(
      learningState.currentWeights.iv + 0.02,
      0.25
    )
    learningState.currentWeights.momentum = Math.max(
      learningState.currentWeights.momentum - 0.03,
      0.05
    )
  }

  // UPGRADE 3: Bounded learning - limit changes
  const maxChange = 0.05 // Max 5% change per adjustment
  for (const key in learningState.currentWeights) {
    const current = (learningState.currentWeights as any)[key]
    const previous = previousWeights[key as keyof typeof previousWeights]
    const maxAllowed = previous + maxChange

    if (current > maxAllowed) {
      (learningState.currentWeights as any)[key] = maxAllowed
    }
  }

  // Renormalize weights to sum to 1.0
  const weightSum = Object.values(learningState.currentWeights).reduce((a, b) => a + b, 0)
  for (const key in learningState.currentWeights) {
    (learningState.currentWeights as any)[key] /= weightSum
  }

  // Record adjustment
  learningState.adjustmentHistory.push({
    tradeCount: learningState.tradesProcessed,
    previousWeights,
    newWeights: { ...learningState.currentWeights },
    reason: `WinRate=${(learningState.winRate * 100).toFixed(1)}%, PF=${learningState.profitFactor.toFixed(2)}`,
    resultingWinRate: learningState.winRate,
  })

  // Keep only last 20 adjustments
  if (learningState.adjustmentHistory.length > 20) {
    learningState.adjustmentHistory.shift()
  }
}

/**
 * Calculate profit factor
 */
function calculateProfitFactor(
  winningTrades: LearningState['tradeHistory'],
  losingTrades: LearningState['tradeHistory']
): number {
  const totalWins = winningTrades.reduce((sum, t) => sum + t.pnl, 0)
  const totalLosses = losingTrades.reduce((sum, t) => sum + Math.abs(t.pnl), 0)

  if (totalLosses === 0) return totalWins > 0 ? 999 : 1.0

  return totalWins / totalLosses
}

/**
 * UPGRADE 4: Time-of-day learning
 */
export function analyzeTimeOfDayPerformance(): {
  hour: number
  tradeCount: number
  winRate: number
  avgPnl: number
}[] {
  const hourlyStats = new Map<
    number,
    {
      trades: LearningState['tradeHistory']
      wins: number
      totalPnl: number
    }
  >()

  for (const trade of learningState.tradeHistory) {
    const hour = new Date(trade.timestamp).getHours()
    const stats = hourlyStats.get(hour) || { trades: [], wins: 0, totalPnl: 0 }

    stats.trades.push(trade)
    if (trade.pnl > 0) stats.wins++
    stats.totalPnl += trade.pnl

    hourlyStats.set(hour, stats)
  }

  const results: any[] = []
  for (const [hour, stats] of hourlyStats.entries()) {
    results.push({
      hour,
      tradeCount: stats.trades.length,
      winRate: stats.trades.length > 0 ? stats.wins / stats.trades.length : 0,
      avgPnl: stats.trades.length > 0 ? stats.totalPnl / stats.trades.length : 0,
    })
  }

  return results.sort((a, b) => a.hour - b.hour)
}

/**
 * Get current learning state
 */
export function getLearningState() {
  return {
    tradesProcessed: learningState.tradesProcessed,
    winRate: (learningState.winRate * 100).toFixed(2) + '%',
    profitFactor: learningState.profitFactor.toFixed(2),
    currentWeights: learningState.currentWeights,
    baseWeights: learningState.baseWeights,
    adjustmentHistory: learningState.adjustmentHistory,
    recentTrades: learningState.tradeHistory.slice(-10),
  }
}

/**
 * Reset learning
 */
export function resetLearning() {
  learningState = {
    tradeHistory: [],
    currentWeights: { ...DEFAULT_WEIGHTS },
    baseWeights: { ...DEFAULT_WEIGHTS },
    tradesProcessed: 0,
    winRate: 0.55,
    profitFactor: 1.5,
    lastAdjustmentTrade: 0,
    adjustmentHistory: [],
  }
}

export default {
  recordTrade,
  getLearningState,
  resetLearning,
  analyzeTimeOfDayPerformance,
}
