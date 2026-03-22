/**
 * UNIFIED TRADING ENGINE
 * 
 * Main trading loop that orchestrates:
 * - Decision making
 * - Execution
 * - Learning
 * - Risk management
 * 
 * This is the HEART of the system
 */

import { runDecisionEngine } from './decision-engine'
import { logSessionStart, logSessionEnd } from './trade-logger'
import { getRiskState, resetDailyLimits } from './risk-engine'
import { calculateMetrics, getTotalPnL } from './learning-engine'
import { analyzePerformance, formatMetrics } from './performance-engine'

interface EngineConfig {
  scanIntervalMs: number
  paperTrading: boolean
  maxPositions: number
  maxRiskPerTrade: number
}

interface EngineState {
  isRunning: boolean
  startTime: number
  cycleCount: number
  trades: any[]
  positions: any[]
  accountBalance: number
  totalPnL: number
  cycleTime: number
  lastError?: string
}

let engineState: EngineState = {
  isRunning: false,
  startTime: 0,
  cycleCount: 0,
  trades: [],
  positions: [],
  accountBalance: 100000,
  totalPnL: 0,
  cycleTime: 0
}

const DEFAULT_CONFIG: EngineConfig = {
  scanIntervalMs: 5000,
  paperTrading: true,
  maxPositions: 3,
  maxRiskPerTrade: 0.01
}

/**
 * Start the trading engine
 */
export async function startEngine(
  scanner: any,
  ibkr: any,
  config: Partial<EngineConfig> = {}
): Promise<void> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config }

  console.log('\n╔════════════════════════════════════════════════════════════╗')
  console.log('║          🚀 AOIX-1 TRADING ENGINE STARTING                  ║')
  console.log('╚════════════════════════════════════════════════════════════╝\n')

  console.log('[ENGINE] Configuration:')
  console.log(`  Mode: ${finalConfig.paperTrading ? 'PAPER' : '🔴 LIVE'}`)
  console.log(`  Scan Interval: ${finalConfig.scanIntervalMs}ms`)
  console.log(`  Max Positions: ${finalConfig.maxPositions}`)
  console.log(`  Max Risk/Trade: ${(finalConfig.maxRiskPerTrade * 100).toFixed(1)}%\n`)

  engineState.isRunning = true
  engineState.startTime = Date.now()

  logSessionStart(finalConfig)

  try {
    // Main trading loop
    while (engineState.isRunning) {
      engineState.cycleCount++

      const cycleStartTime = Date.now()

      try {
        console.log(`\n[ENGINE] Cycle ${engineState.cycleCount} starting...`)

        // Get account info
        let account = { equity: engineState.accountBalance }
        try {
          account = await ibkr.getAccount()
        } catch (err) {
          console.warn('[ENGINE] Failed to get account:', err)
        }

        // Run decision engine (scan → enrich → score → rank → allocate → execute)
        const results = await runDecisionEngine({
          scanner,
          ibkr,
          account,
          logger: true
        })

        // Update state
        engineState.trades.push(...results)
        engineState.accountBalance = account.equity || engineState.accountBalance
        engineState.totalPnL = getTotalPnL()

        // Measure cycle time
        engineState.cycleTime = Date.now() - cycleStartTime

        // Log cycle summary
        console.log(
          `[ENGINE] Cycle complete in ${engineState.cycleTime}ms. ` +
          `Trades: ${results.length}, P&L: $${engineState.totalPnL.toFixed(0)}`
        )

        // Show metrics every 10 cycles
        if (engineState.cycleCount % 10 === 0) {
          showEngineStatus()
        }
      } catch (err) {
        engineState.lastError = err instanceof Error ? err.message : String(err)
        console.error(`[ENGINE] Cycle error:`, err)

        // Check if it's a fatal error
        if (err instanceof Error && err.message.includes('Kill switch')) {
          console.error('[ENGINE] ⚠️  Trading halted due to risk limit')
          break
        }
      }

      // Wait before next cycle
      await new Promise(resolve => setTimeout(resolve, finalConfig.scanIntervalMs))
    }
  } finally {
    await stopEngine()
  }
}

/**
 * Stop the engine
 */
export async function stopEngine() {
  console.log('\n[ENGINE] Shutting down...')

  engineState.isRunning = false

  // Show final statistics
  showEngineStatus()

  // Log session end
  const metrics = calculateMetrics()
  logSessionEnd(metrics)

  console.log('[ENGINE] ✅ Engine stopped\n')
}

/**
 * Show engine status
 */
function showEngineStatus() {
  const metrics = calculateMetrics()
  const riskState = getRiskState(engineState.accountBalance)

  console.log(`\n${'='.repeat(50)}`)
  console.log(formatMetrics({
    totalTrades: metrics.totalTrades,
    wins: metrics.wins,
    losses: metrics.losses,
    winRate: metrics.winRate,
    avgWin: metrics.avgWin,
    avgLoss: metrics.avgLoss,
    profitFactor: metrics.profitFactor,
    totalPnL: metrics.totalPnL,
    maxDrawdown: metrics.maxDrawdown,
    sharpe: metrics.sharpe,
    returnOnRisk: metrics.returnOnRisk || 0
  }))
  console.log(`${'='.repeat(50)}\n`)
}

/**
 * Get engine state
 */
export function getEngineState(): EngineState {
  return { ...engineState }
}

/**
 * Pause engine
 */
export function pauseEngine() {
  engineState.isRunning = false
  console.log('[ENGINE] Paused')
}

/**
 * Resume engine
 */
export function resumeEngine() {
  engineState.isRunning = true
  console.log('[ENGINE] Resumed')
}

/**
 * Reset engine (for testing)
 */
export function resetEngine() {
  engineState = {
    isRunning: false,
    startTime: 0,
    cycleCount: 0,
    trades: [],
    positions: [],
    accountBalance: 100000,
    totalPnL: 0,
    cycleTime: 0
  }
  resetDailyLimits()
  console.log('[ENGINE] Reset')
}
