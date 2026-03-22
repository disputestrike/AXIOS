/**
 * TRADING SYSTEM INITIALIZATION
 * 
 * Boots the entire system:
 * - Load environment
 * - Initialize IBKR connection
 * - Start market scanner
 * - Initialize learning engine
 * - Start main trading loop
 * - Setup error handlers
 */

import { startEngine } from '../../trading-core/unified-engine'
import { startScanning, getScanner } from '../../trading-core/market-scanner'
import { getIBKRConnection } from '../../trading-core/ibkr-unified'
import { resetLearning } from '../../trading-core/learning-engine'
import { resetDailyLimits } from '../../trading-core/risk-engine'
import { logSessionStart } from '../../trading-core/trade-logger'
import * as fs from 'fs'
import * as path from 'path'

interface SystemConfig {
  paperTrading: boolean
  scanIntervalMs: number
  maxPositions: number
  maxRiskPerTrade: number
  ibkrHost: string
  ibkrPort: number
  ibkrSessionToken: string
  symbols: string[]
  logDir: string
}

let systemRunning = false
let systemConfig: SystemConfig

/**
 * Load configuration from environment
 */
function loadConfig(): SystemConfig {
  const config: SystemConfig = {
    paperTrading: process.env.ENABLE_LIVE_TRADING?.toLowerCase() !== 'true',
    scanIntervalMs: parseInt(process.env.SCAN_INTERVAL_MS || '5000', 10),
    maxPositions: parseInt(process.env.MAX_POSITIONS || '3', 10),
    maxRiskPerTrade: parseFloat(process.env.MAX_RISK_PER_TRADE || '0.01'),
    ibkrHost: process.env.IBKR_HOST || 'localhost',
    ibkrPort: parseInt(process.env.IBKR_PORT || '5000', 10),
    ibkrSessionToken: process.env.IBKR_SESSION_TOKEN || '',
    symbols: (process.env.TRADING_SYMBOLS || 'SPY,QQQ,AAPL,NVDA,TSLA,META,AMD').split(','),
    logDir: process.env.LOG_DIR || './logs'
  }

  return config
}

/**
 * Validate configuration
 */
function validateConfig(config: SystemConfig): boolean {
  console.log('[INIT] Validating configuration...')

  if (!config.ibkrSessionToken && !config.paperTrading) {
    console.error('[INIT] ❌ IBKR session token required for live trading')
    return false
  }

  if (config.scanIntervalMs < 1000) {
    console.warn('[INIT] ⚠️  Scan interval < 1000ms may cause issues')
  }

  if (config.maxRiskPerTrade > 0.1) {
    console.warn('[INIT] ⚠️  Risk per trade > 10% is very aggressive')
  }

  console.log('[INIT] ✅ Configuration valid')
  return true
}

/**
 * Initialize IBKR connection
 */
async function initializeIBKR(config: SystemConfig): Promise<boolean> {
  console.log('[INIT] Initializing IBKR connection...')

  try {
    const ibkr = getIBKRConnection({
      host: config.ibkrHost,
      port: config.ibkrPort,
      sessionToken: config.ibkrSessionToken,
      paperTrading: config.paperTrading
    })

    // Test connection
    try {
      const account = await ibkr.getAccount()
      console.log('[INIT] ✅ IBKR connected')
      console.log(`[INIT] Account: ${account.accountId || 'PAPER'}`)
      console.log(`[INIT] Equity: $${account.equity?.toFixed(0) || 'N/A'}`)
      return true
    } catch (err) {
      console.error('[INIT] ❌ Failed to fetch account:', err)
      if (config.paperTrading) {
        console.log('[INIT] ℹ️  Continuing in paper mode without connection')
        return true
      }
      return false
    }
  } catch (err) {
    console.error('[INIT] ❌ IBKR initialization failed:', err)
    return false
  }
}

/**
 * Initialize market scanner
 */
async function initializeScanner(config: SystemConfig): Promise<boolean> {
  console.log('[INIT] Initializing market scanner...')

  try {
    const scanner = getScanner({
      symbols: config.symbols,
      paperTrading: config.paperTrading
    })

    console.log('[INIT] ✅ Scanner initialized')
    console.log(`[INIT] Scanning ${config.symbols.length} symbols: ${config.symbols.join(', ')}`)

    return true
  } catch (err) {
    console.error('[INIT] ❌ Scanner initialization failed:', err)
    return false
  }
}

/**
 * Setup global error handlers
 */
function setupErrorHandlers() {
  console.log('[INIT] Setting up error handlers...')

  process.on('uncaughtException', (err) => {
    console.error('[INIT] 🔴 UNCAUGHT EXCEPTION:', err)
    console.error(err.stack)
    process.exit(1)
  })

  process.on('unhandledRejection', (reason, promise) => {
    console.error('[INIT] 🔴 UNHANDLED REJECTION at', promise, 'reason:', reason)
  })

  process.on('SIGINT', async () => {
    console.log('\n[INIT] Received SIGINT, shutting down gracefully...')
    await shutdown()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    console.log('\n[INIT] Received SIGTERM, shutting down gracefully...')
    await shutdown()
    process.exit(0)
  })

  console.log('[INIT] ✅ Error handlers configured')
}

/**
 * Setup logging directory
 */
function setupLogging(config: SystemConfig) {
  console.log('[INIT] Setting up logging...')

  if (!fs.existsSync(config.logDir)) {
    fs.mkdirSync(config.logDir, { recursive: true })
  }

  console.log(`[INIT] ✅ Logging directory: ${config.logDir}`)
}

/**
 * Initialize the trading system
 */
export async function initializeSystem(): Promise<boolean> {
  console.log('\n╔═══════════════════════════════════════════════════════════╗')
  console.log('║         AOIX-1 TRADING SYSTEM - INITIALIZATION            ║')
  console.log('╚═══════════════════════════════════════════════════════════╝\n')

  try {
    // 1. Load configuration
    systemConfig = loadConfig()

    console.log('[INIT] Configuration loaded:')
    console.log(`  Mode: ${systemConfig.paperTrading ? '📄 PAPER' : '🔴 LIVE'}`)
    console.log(`  Scan Interval: ${systemConfig.scanIntervalMs}ms`)
    console.log(`  Max Positions: ${systemConfig.maxPositions}`)
    console.log(`  Max Risk/Trade: ${(systemConfig.maxRiskPerTrade * 100).toFixed(1)}%`)
    console.log(`  Symbols: ${systemConfig.symbols.length}\n`)

    // 2. Validate configuration
    if (!validateConfig(systemConfig)) {
      return false
    }

    // 3. Setup logging
    setupLogging(systemConfig)

    // 4. Setup error handlers
    setupErrorHandlers()

    // 5. Initialize IBKR
    if (!await initializeIBKR(systemConfig)) {
      console.error('[INIT] ❌ Failed to initialize IBKR')
      return false
    }

    // 6. Initialize scanner
    if (!await initializeScanner(systemConfig)) {
      console.error('[INIT] ❌ Failed to initialize scanner')
      return false
    }

    // 7. Reset learning engine
    resetLearning()
    console.log('[INIT] ✅ Learning engine initialized')

    // 8. Reset daily limits
    resetDailyLimits()
    console.log('[INIT] ✅ Risk engine initialized')

    // 9. Log session start
    logSessionStart(systemConfig)

    console.log('\n[INIT] ✅ System initialization complete')
    console.log('[INIT] Ready to start trading\n')

    return true
  } catch (err) {
    console.error('[INIT] ❌ Initialization failed:', err)
    return false
  }
}

/**
 * Start the trading system
 */
export async function startSystem(): Promise<void> {
  if (systemRunning) {
    console.log('[INIT] System already running')
    return
  }

  if (!systemConfig) {
    console.error('[INIT] System not initialized. Call initializeSystem() first.')
    return
  }

  systemRunning = true

  console.log('\n[INIT] Starting trading engine...\n')

  try {
    const ibkr = getIBKRConnection({
      host: systemConfig.ibkrHost,
      port: systemConfig.ibkrPort,
      sessionToken: systemConfig.ibkrSessionToken,
      paperTrading: systemConfig.paperTrading
    })

    const scanner = getScanner({
      symbols: systemConfig.symbols,
      paperTrading: systemConfig.paperTrading
    })

    // Start main engine
    await startEngine(scanner, ibkr, {
      scanIntervalMs: systemConfig.scanIntervalMs,
      paperTrading: systemConfig.paperTrading,
      maxPositions: systemConfig.maxPositions,
      maxRiskPerTrade: systemConfig.maxRiskPerTrade
    })
  } catch (err) {
    console.error('[INIT] ❌ Engine error:', err)
    systemRunning = false
  }
}

/**
 * Shutdown the system
 */
export async function shutdown(): Promise<void> {
  console.log('[INIT] Shutting down system...')
  systemRunning = false

  // Close connections, save state, etc.
  console.log('[INIT] System shutdown complete')
}

/**
 * Get system status
 */
export function getSystemStatus() {
  return {
    running: systemRunning,
    config: systemConfig,
    timestamp: new Date().toISOString()
  }
}

export default {
  initializeSystem,
  startSystem,
  shutdown,
  getSystemStatus
}
