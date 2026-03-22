/**
 * BACKTEST ENGINE
 * 
 * Runs trading system against historical data:
 * - Simulates fills
 * - Tracks equity curve
 * - Calculates metrics
 * - Validates logic
 */

import { analyzePerformance } from './performance-engine'
import { BacktestResult } from './types'

interface HistoricalSnapshot {
  timestamp: number
  symbol: string
  price: number
  bid: number
  ask: number
  volume: number
  openInterest: number
}

/**
 * Run backtest against historical data
 */
export async function runBacktest(
  historicalData: HistoricalSnapshot[],
  startingEquity: number = 100000
): Promise<BacktestResult> {
  console.log('[BACKTEST] Starting backtest...')
  console.log(`[BACKTEST] Data points: ${historicalData.length}`)
  console.log(`[BACKTEST] Starting equity: $${startingEquity}`)

  let equity = startingEquity
  let trades: any[] = []
  const equityHistory: number[] = [equity]

  // Group data by symbol
  const symbolData = groupBySymbol(historicalData)

  // Simulate trading through historical data
  for (const [symbol, snapshots] of Object.entries(symbolData)) {
    for (let i = 0; i < snapshots.length - 1; i++) {
      const current = snapshots[i]
      const next = snapshots[i + 1]

      // Simple strategy: if price moving up 2%, generate buy signal
      const priceChange = (next.price - current.price) / current.price

      if (priceChange > 0.02) {
        // Simulate trade
        const entryPrice = current.ask
        const exitPrice = next.bid

        const pnl = (exitPrice - entryPrice) * 100 // options multiplier

        trades.push({
          symbol,
          entry: entryPrice,
          exit: exitPrice,
          pnl,
          timestamp: current.timestamp
        })

        equity += pnl
        equityHistory.push(equity)

        if (trades.length % 50 === 0) {
          console.log(`[BACKTEST] ${trades.length} trades, equity: $${equity.toFixed(0)}`)
        }
      }
    }
  }

  // Calculate metrics
  const metrics = analyzePerformance(trades)

  const result: BacktestResult = {
    totalTrades: trades.length,
    wins: metrics.wins,
    losses: metrics.losses,
    winRate: metrics.winRate,
    totalPnL: metrics.totalPnL,
    maxDrawdown: metrics.maxDrawdown,
    sharpe: metrics.sharpe,
    profitFactor: metrics.profitFactor,
    equity: equityHistory
  }

  console.log('[BACKTEST] Results:')
  console.log(`  Trades: ${result.totalTrades}`)
  console.log(`  Win Rate: ${(result.winRate * 100).toFixed(1)}%`)
  console.log(`  P&L: $${result.totalPnL.toFixed(0)}`)
  console.log(`  Sharpe: ${result.sharpe.toFixed(2)}`)

  return result
}

/**
 * Group historical data by symbol
 */
function groupBySymbol(data: HistoricalSnapshot[]): Record<string, HistoricalSnapshot[]> {
  const grouped: Record<string, HistoricalSnapshot[]> = {}

  for (const snapshot of data) {
    if (!grouped[snapshot.symbol]) {
      grouped[snapshot.symbol] = []
    }
    grouped[snapshot.symbol].push(snapshot)
  }

  return grouped
}

/**
 * Walk-forward validation (train/test split)
 */
export async function walkForwardValidation(
  historicalData: HistoricalSnapshot[],
  trainPeriod: number,
  testPeriod: number
) {
  console.log('[BACKTEST] Running walk-forward validation...')

  let results: BacktestResult[] = []

  for (let i = 0; i < historicalData.length - trainPeriod - testPeriod; i += testPeriod) {
    const trainData = historicalData.slice(i, i + trainPeriod)
    const testData = historicalData.slice(i + trainPeriod, i + trainPeriod + testPeriod)

    console.log(
      `[BACKTEST] Window ${Math.floor(i / testPeriod) + 1}: Training on ${trainData.length}, ` +
      `Testing on ${testData.length}`
    )

    const result = await runBacktest(testData)
    results.push(result)
  }

  // Aggregate results
  const avgWinRate = results.reduce((s, r) => s + r.winRate, 0) / results.length
  const avgPnL = results.reduce((s, r) => s + r.totalPnL, 0) / results.length
  const avgSharpe = results.reduce((s, r) => s + r.sharpe, 0) / results.length

  console.log('[BACKTEST] Walk-forward Summary:')
  console.log(`  Windows: ${results.length}`)
  console.log(`  Avg Win Rate: ${(avgWinRate * 100).toFixed(1)}%`)
  console.log(`  Avg P&L: $${avgPnL.toFixed(0)}`)
  console.log(`  Avg Sharpe: ${avgSharpe.toFixed(2)}`)

  return { windows: results.length, avgWinRate, avgPnL, avgSharpe }
}

/**
 * Monte Carlo simulation (stress test)
 */
export function monteCarlo(trades: any[], iterations: number = 1000) {
  console.log('[BACKTEST] Running Monte Carlo simulation...')

  const pnls = trades.map(t => t.pnl)
  const results: number[] = []

  for (let i = 0; i < iterations; i++) {
    let equity = 100000
    let simTrades = 0

    while (simTrades < trades.length) {
      const randomIdx = Math.floor(Math.random() * pnls.length)
      const pnl = pnls[randomIdx]
      equity += pnl

      if (equity < 50000) break // Bankruptcy check

      simTrades++
    }

    results.push(equity)
  }

  // Calculate statistics
  results.sort((a, b) => a - b)
  const worst5 = results[Math.floor(iterations * 0.05)]
  const worst1 = results[Math.floor(iterations * 0.01)]
  const median = results[Math.floor(iterations * 0.5)]
  const best5 = results[Math.floor(iterations * 0.95)]

  console.log('[BACKTEST] Monte Carlo Results:')
  console.log(`  1st Percentile: $${worst1.toFixed(0)} (worst case)`)
  console.log(`  5th Percentile: $${worst5.toFixed(0)}`)
  console.log(`  Median: $${median.toFixed(0)}`)
  console.log(`  95th Percentile: $${best5.toFixed(0)}`)

  return { worst1, worst5, median, best5 }
}
