/**
 * PERFORMANCE ENGINE
 * 
 * Measures:
 * - Win rate
 * - Profit factor
 * - Sharpe ratio
 * - Max drawdown
 * - Return on risk
 */

interface PerformanceMetrics {
  totalTrades: number
  wins: number
  losses: number
  winRate: number
  avgWin: number
  avgLoss: number
  profitFactor: number
  totalPnL: number
  maxDrawdown: number
  sharpe: number
  returnOnRisk: number
}

/**
 * Analyze trades and return metrics
 */
export function analyzePerformance(trades: any[]): PerformanceMetrics {
  if (trades.length === 0) {
    return getEmptyMetrics()
  }

  const fills = trades.filter(t => t.filled || t.result?.filled)

  if (fills.length === 0) {
    return getEmptyMetrics()
  }

  const pnls = fills.map(t => t.pnl || t.result?.pnl || 0)
  const wins = pnls.filter(p => p > 0)
  const losses = pnls.filter(p => p <= 0)

  const totalPnL = pnls.reduce((a, b) => a + b, 0)
  const winRate = wins.length / fills.length
  const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0

  const totalWins = wins.reduce((a, b) => a + b, 0)
  const totalLosses = Math.abs(losses.reduce((a, b) => a + b, 0))
  const profitFactor = totalLosses === 0 ? totalWins : totalWins / totalLosses

  // Max drawdown
  let peak = 0
  let maxDD = 0
  let equity = 100000
  for (const pnl of pnls) {
    equity += pnl
    peak = Math.max(peak, equity)
    const dd = (peak - equity) / peak
    maxDD = Math.max(maxDD, dd)
  }

  // Sharpe ratio
  const mean = totalPnL / fills.length
  const variance = pnls.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / fills.length
  const stdDev = Math.sqrt(variance)
  const sharpe = stdDev === 0 ? 0 : (mean * Math.sqrt(252)) / stdDev // annualized

  // Return on risk
  const totalRisk = Math.abs(avgLoss) * losses.length
  const returnOnRisk = totalPnL / totalRisk

  return {
    totalTrades: fills.length,
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
 * Get empty metrics
 */
function getEmptyMetrics(): PerformanceMetrics {
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
    sharpe: 0,
    returnOnRisk: 0
  }
}

/**
 * Format metrics for display
 */
export function formatMetrics(m: PerformanceMetrics): string {
  return `
╔════════════════════════════════════════╗
║         PERFORMANCE METRICS             ║
╠════════════════════════════════════════╣
║ Trades:      ${String(m.totalTrades).padEnd(15)} ║
║ Win Rate:    ${(m.winRate * 100).toFixed(1)}%${' '.repeat(12)} ║
║ Profit:      $${m.totalPnL.toFixed(0).padEnd(14)} ║
║ P. Factor:   ${m.profitFactor.toFixed(2)}${' '.repeat(14)} ║
║ Max DD:      ${(m.maxDrawdown * 100).toFixed(1)}%${' '.repeat(12)} ║
║ Sharpe:      ${m.sharpe.toFixed(2)}${' '.repeat(14)} ║
║ RoR:         ${m.returnOnRisk.toFixed(2)}x${' '.repeat(14)} ║
╚════════════════════════════════════════╝
  `
}

/**
 * Compare performance against benchmarks
 */
export function compareAgainstBenchmark(metrics: PerformanceMetrics) {
  const benchmarks = {
    winRate: { good: 0.55, excellent: 0.65 },
    profitFactor: { good: 1.5, excellent: 2.0 },
    sharpe: { good: 1.0, excellent: 2.0 },
    maxDrawdown: { good: -0.15, excellent: -0.1 }
  }

  console.log('[PERFORMANCE] Benchmark Comparison:')

  if (metrics.winRate >= benchmarks.winRate.excellent) {
    console.log('  ✅ Win Rate: EXCELLENT')
  } else if (metrics.winRate >= benchmarks.winRate.good) {
    console.log('  ✅ Win Rate: GOOD')
  } else {
    console.log('  ⚠️  Win Rate: NEEDS IMPROVEMENT')
  }

  if (metrics.profitFactor >= benchmarks.profitFactor.excellent) {
    console.log('  ✅ Profit Factor: EXCELLENT')
  } else if (metrics.profitFactor >= benchmarks.profitFactor.good) {
    console.log('  ✅ Profit Factor: GOOD')
  } else {
    console.log('  ⚠️  Profit Factor: NEEDS IMPROVEMENT')
  }

  if (metrics.sharpe >= benchmarks.sharpe.excellent) {
    console.log('  ✅ Sharpe Ratio: EXCELLENT')
  } else if (metrics.sharpe >= benchmarks.sharpe.good) {
    console.log('  ✅ Sharpe Ratio: GOOD')
  } else {
    console.log('  ⚠️  Sharpe Ratio: NEEDS IMPROVEMENT')
  }
}
