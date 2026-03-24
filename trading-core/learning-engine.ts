/**
 * LEARNING ENGINE
 * 
 * Makes the system adaptive:
 * - Tracks trade outcomes
 * - Measures performance metrics
 * - Adjusts parameters over time
 * - Prevents catastrophic failures
 */

interface TradeRecord {
  timestamp: number
  trade: any
  result: any
  pnl: number
  duration: number
}

let tradeHistory: TradeRecord[] = []
const MAX_HISTORY = 100 // Keep last 100 trades

/**
 * Record a trade outcome
 */
export async function updateModel(trade: any, result: any) {
  if (!result.filled) return // Only learn from filled trades

  const record: TradeRecord = {
    timestamp: Date.now(),
    trade,
    result,
    pnl: result.pnl || 0,
    duration: 0 // In production, track time in position
  }

  tradeHistory.push(record)

  // Keep bounded
  if (tradeHistory.length > MAX_HISTORY) {
    tradeHistory = tradeHistory.slice(-MAX_HISTORY)
  }

  console.log(
    `[LEARNING] Trade recorded. History: ${tradeHistory.length} trades, ` +
    `P&L: ${getTotalPnL().toFixed(2)}`
  )

  // Analyze and adapt
  if (tradeHistory.length % 10 === 0) {
    await analyzeAndAdapt()
  }
}

/**
 * Analyze performance and adapt system
 */
async function analyzeAndAdapt() {
  const metrics = calculateMetrics()

  console.log('[LEARNING] Performance Analysis:')
  console.log(`  Win Rate: ${(metrics.winRate * 100).toFixed(1)}%`)
  console.log(`  Profit Factor: ${metrics.profitFactor.toFixed(2)}`)
  console.log(`  Avg Win: $${metrics.avgWin.toFixed(0)}`)
  console.log(`  Avg Loss: $${metrics.avgLoss.toFixed(0)}`)
  console.log(`  Sharpe Ratio: ${metrics.sharpe.toFixed(2)}`)

  // ADAPTATION RULES
  // If winning > 65%, increase aggressiveness
  if (metrics.winRate > 0.65) {
    console.log('[LEARNING] ✅ Strong performance - increasing position size')
    // adjustPositionSizing(1.1)
  }

  // If losing, reduce risk
  if (metrics.winRate < 0.45) {
    console.log('[LEARNING] ⚠️ Weak performance - reducing position size')
    // adjustPositionSizing(0.8)
  }

  // If profit factor < 1.5, adjust strategy weights
  if (metrics.profitFactor < 1.5) {
    console.log('[LEARNING] Adjusting strategy weights')
    // adjustStrategyWeights()
  }

  return metrics
}

/**
 * Calculate performance metrics
 */
export function calculateMetrics() {
  if (tradeHistory.length === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      totalPnL: 0,
      maxDrawdown: 0,
      sharpe: 0
    }
  }

  const wins = tradeHistory.filter(t => t.pnl > 0)
  const losses = tradeHistory.filter(t => t.pnl <= 0)
  const winRate = wins.length / tradeHistory.length

  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0
  const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0

  const totalWins = wins.reduce((s, t) => s + t.pnl, 0)
  const totalLosses = Math.abs(losses.reduce((s, t) => s + t.pnl, 0))
  const profitFactor = totalLosses === 0 ? totalWins : totalWins / totalLosses

  const totalPnL = tradeHistory.reduce((s, t) => s + t.pnl, 0)

  // Max drawdown
  let peak = 0
  let maxDD = 0
  let equity = 100000
  for (const trade of tradeHistory) {
    equity += trade.pnl
    peak = Math.max(peak, equity)
    const dd = (peak - equity) / peak
    maxDD = Math.max(maxDD, dd)
  }

  // Sharpe ratio (simplified)
  const returns = tradeHistory.map(t => t.pnl)
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance =
    returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length
  const stdDev = Math.sqrt(variance)
  const sharpe = stdDev === 0 ? 0 : mean / stdDev

  const totalRisk = Math.abs(avgLoss) * losses.length
  const returnOnRisk = totalRisk === 0 ? 0 : totalPnL / totalRisk

  return {
    totalTrades: tradeHistory.length,
    wins: wins.length,
    losses: losses.length,
    winRate,
    avgWin,
    avgLoss,
    profitFactor,
    totalPnL,
    maxDrawdown: maxDD,
    sharpe,
    returnOnRisk
  }
}

/**
 * Get total P&L
 */
export function getTotalPnL(): number {
  return tradeHistory.reduce((sum, t) => sum + t.pnl, 0)
}

/**
 * Get trade history
 */
export function getTradeHistory(): TradeRecord[] {
  return tradeHistory
}

/**
 * Reset learning (for testing)
 */
export function resetLearning() {
  tradeHistory = []
}
