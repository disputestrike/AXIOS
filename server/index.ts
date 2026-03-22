#!/usr/bin/env node

/**
 * AOIX-1 TRADING SYSTEM - MAIN SERVER STARTUP
 * 
 * This is the entry point that boots the entire system.
 * 
 * Usage:
 *   npm run dev          (development, paper trading)
 *   npm run start        (production, check ENABLE_LIVE_TRADING)
 *   npm run paper        (force paper trading)
 *   npm run live         (force live trading - CAREFUL!)
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

console.log('\n' + '═'.repeat(80))
console.log('║' + ' '.repeat(78) + '║')
console.log('║' + '  AOIX-1 TRADING SYSTEM - STARTUP'.padEnd(78) + '║')
console.log('║' + ' '.repeat(78) + '║')
console.log('═'.repeat(80) + '\n')

// ============================================================================
// PRE-FLIGHT CHECKS
// ============================================================================

console.log('[STARTUP] Running pre-flight checks...\n')

// Check Node version
const nodeVersion = process.version
const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1))
if (majorVersion < 18) {
  console.error(`❌ Node.js 18+ required (you have ${nodeVersion})`)
  process.exit(1)
}
console.log(`✅ Node.js version: ${nodeVersion}`)

// Check environment
const mode = process.env.ENABLE_LIVE_TRADING?.toLowerCase() === 'true' ? 'LIVE' : 'PAPER'
const modeIndicator = mode === 'LIVE' ? '🔴' : '📄'
console.log(`✅ Trading mode: ${modeIndicator} ${mode}`)

// Check IBKR configuration
if (mode === 'LIVE' && !process.env.IBKR_SESSION_TOKEN) {
  console.error('❌ LIVE trading requires IBKR_SESSION_TOKEN in environment')
  console.log('   See .env.example for setup instructions')
  process.exit(1)
}
console.log('✅ IBKR configuration valid')

// Check symbol configuration
const symbols = (process.env.TRADING_SYMBOLS || '').split(',').filter(s => s.trim())
if (symbols.length === 0) {
  console.error('❌ TRADING_SYMBOLS not configured')
  process.exit(1)
}
console.log(`✅ Trading ${symbols.length} symbols: ${symbols.join(', ')}`)

console.log('\n[STARTUP] All checks passed ✅\n')

// ============================================================================
// IMPORT & INITIALIZE SYSTEM
// ============================================================================

console.log('[STARTUP] Loading modules...')

// Import trading initialization
let tradingInit

try {
  const module = await import('./server/_core/trading-init.ts')
  tradingInit = module.default || module
  console.log('[STARTUP] ✅ Trading modules loaded')
} catch (err) {
  console.error('[STARTUP] ❌ Failed to load trading modules:', err)
  process.exit(1)
}

console.log('[STARTUP] Importing web server...')

// Import Express server (if needed)
let app

try {
  // Optional: Start Express server for API/Dashboard
  // For now, just focus on trading engine
  console.log('[STARTUP] ℹ️  Web server setup skipped (trading engine only)')
} catch (err) {
  console.log('[STARTUP] ℹ️  Web server optional')
}

// ============================================================================
// INITIALIZE TRADING SYSTEM
// ============================================================================

console.log('\n[STARTUP] Initializing trading system...\n')

async function main() {
  try {
    // Initialize system
    const initialized = await tradingInit.initializeSystem()

    if (!initialized) {
      console.error('[STARTUP] ❌ System initialization failed')
      process.exit(1)
    }

    // Start trading
    console.log('[STARTUP] ✅ System ready, starting trading engine\n')

    // Import the actual engine starter
    const engineModule = await import('./trading-core/unified-engine.ts')
    const { startEngine } = engineModule

    // Get scanner and IBKR
    const scannerModule = await import('./trading-core/market-scanner.ts')
    const ibkrModule = await import('./trading-core/ibkr-unified.ts')

    const scanner = scannerModule.getScanner?.({
      symbols,
      paperTrading: mode === 'PAPER'
    })

    const ibkr = ibkrModule.getIBKRConnection?.({
      host: process.env.IBKR_HOST || 'localhost',
      port: parseInt(process.env.IBKR_PORT || '5000'),
      sessionToken: process.env.IBKR_SESSION_TOKEN || '',
      paperTrading: mode === 'PAPER'
    })

    if (!scanner || !ibkr) {
      console.error('[STARTUP] ❌ Failed to initialize scanner or IBKR')
      process.exit(1)
    }

    // Start the engine
    await startEngine(scanner, ibkr, {
      scanIntervalMs: parseInt(process.env.SCAN_INTERVAL_MS || '5000'),
      paperTrading: mode === 'PAPER',
      maxPositions: parseInt(process.env.MAX_POSITIONS || '3'),
      maxRiskPerTrade: parseFloat(process.env.MAX_RISK_PER_TRADE || '0.01')
    })
  } catch (err) {
    console.error('[STARTUP] ❌ Fatal error:', err)
    process.exit(1)
  }
}

// Run main
main().catch(err => {
  console.error('[STARTUP] ❌ Uncaught error:', err)
  process.exit(1)
})

// ============================================================================
// SIGNAL HANDLERS
// ============================================================================

process.on('SIGINT', () => {
  console.log('\n[STARTUP] Received SIGINT, shutting down gracefully...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n[STARTUP] Received SIGTERM, shutting down gracefully...')
  process.exit(0)
})
