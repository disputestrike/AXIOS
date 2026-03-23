#!/usr/bin/env node

/**
 * AOIX-1 TRADING SYSTEM - MAIN SERVER
 * Express app with React frontend + Trading backend
 */

import dotenv from 'dotenv'
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = parseInt(process.env.PORT || '5001')
const mode = process.env.ENABLE_LIVE_TRADING?.toLowerCase() === 'true' ? 'LIVE' : 'PAPER'

app.use(express.json())

// Serve static React frontend
app.use(express.static(path.join(__dirname, '../dist')))

console.log('\n' + '═'.repeat(80))
console.log('║' + ' '.repeat(78) + '║')
console.log('║' + '  🚀 AOIX-1 TRADING SYSTEM'.padEnd(78) + '║')
console.log('║' + ' '.repeat(78) + '║')
console.log('═'.repeat(80) + '\n')

// ============================================================================
// API ENDPOINTS
// ============================================================================

// Root route
app.get('/', (req, res) => {
  res.json({
    system: 'AOIX-1 Trading System',
    status: 'ready',
    mode,
    version: '1.1.0',
    endpoints: {
      root: '/',
      health: '/health',
      status: '/api/status'
    }
  })
})

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', mode, timestamp: new Date().toISOString() })
})

// Status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    system: 'AOIX-1 Trading System',
    version: '1.1.0',
    status: 'running',
    mode,
    config: {
      symbol: process.env.TRADING_SYMBOL || 'SPX',
      strategyMode: process.env.TRADING_MODE || 'BALANCED_AGGRESSIVE',
      positionSize: parseInt(process.env.TRADING_POSITION_SIZE || '750')
    }
  })
})

// ============================================================================
// TRADING API ENDPOINTS (mock data - will integrate with real trading engine)
// ============================================================================

let systemConfig = {
  symbols: ['SPX', 'SPY', 'QQQ', 'IWM'],
  positionSize: 750,
  dailyLossLimit: 150,
  strategy: 'BALANCED_AGGRESSIVE',
  mode: mode
}

let opportunities = [
  {
    id: '1',
    symbol: 'SPX',
    strike: 5900,
    expiry: '2026-03-28',
    optionType: 'CALL' as const,
    score: 87,
    confidence: 0.92,
    expectedMove: 2.3,
    signal: 'gamma_flip'
  },
  {
    id: '2',
    symbol: 'QQQ',
    strike: 410,
    expiry: '2026-03-28',
    optionType: 'PUT' as const,
    score: 84,
    confidence: 0.87,
    expectedMove: 1.8,
    signal: 'vol_expansion'
  },
  {
    id: '3',
    symbol: 'IWM',
    strike: 220,
    expiry: '2026-03-28',
    optionType: 'CALL' as const,
    score: 79,
    confidence: 0.78,
    expectedMove: 1.5,
    signal: 'momentum'
  }
]

let positions = [
  {
    symbol: 'SPX',
    strike: 5900,
    entryPrice: 12.5,
    currentPrice: 12.9,
    pnl: 234,
    pnlPercent: 3.2
  }
]

// GET opportunities
app.get('/api/opportunities', (req, res) => {
  res.json({
    opportunities: opportunities,
    timestamp: new Date().toISOString()
  })
})

// GET positions
app.get('/api/positions', (req, res) => {
  const dayPnL = positions.reduce((sum, pos) => sum + pos.pnl, 0)
  res.json({
    positions: positions,
    dayPnL: dayPnL,
    totalPnL: dayPnL,
    timestamp: new Date().toISOString()
  })
})

// POST execute trade
app.post('/api/execute', (req, res) => {
  const { symbol, strike, type, expiry } = req.body
  
  if (!symbol || !strike || !type) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters: symbol, strike, type'
    })
  }

  // Mock execution
  const newPosition = {
    symbol,
    strike,
    entryPrice: Math.random() * 20 + 5,
    currentPrice: Math.random() * 20 + 5,
    pnl: Math.random() * 500 - 100,
    pnlPercent: Math.random() * 10 - 2
  }
  
  positions.push(newPosition)

  res.json({
    success: true,
    message: `✅ Order executed: ${symbol} ${strike}${type[0]}`,
    position: newPosition,
    mode: systemConfig.mode
  })
})

// POST config update
app.post('/api/config', (req, res) => {
  const newConfig = req.body
  
  if (newConfig.symbols) systemConfig.symbols = newConfig.symbols
  if (newConfig.positionSize) systemConfig.positionSize = newConfig.positionSize
  if (newConfig.dailyLossLimit) systemConfig.dailyLossLimit = newConfig.dailyLossLimit
  if (newConfig.strategy) systemConfig.strategy = newConfig.strategy

  res.json({
    success: true,
    config: systemConfig
  })
})

// POST mode toggle
app.post('/api/config/mode', (req, res) => {
  const { mode: newMode } = req.body
  
  if (!newMode || !['PAPER', 'LIVE'].includes(newMode)) {
    return res.status(400).json({
      success: false,
      error: 'Mode must be PAPER or LIVE'
    })
  }

  systemConfig.mode = newMode
  process.env.ENABLE_LIVE_TRADING = newMode === 'LIVE' ? 'true' : 'false'

  res.json({
    success: true,
    mode: newMode,
    message: `Switched to ${newMode} trading mode`
  })
})

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'), (err) => {
    if (err) {
      res.json({
        system: 'AOIX-1 Trading System',
        status: 'ready',
        mode: systemConfig.mode,
        note: 'Frontend not built yet. Run: npm run build'
      })
    }
  })
})

// Start server
app.listen(port, () => {
  console.log(`[SERVER] ✅ AOIX-1 Ready`)
  console.log(`[SERVER] 📊 Mode: ${systemConfig.mode} TRADING`)
  console.log(`[SERVER] 🎯 Symbols: ${systemConfig.symbols.join(', ')}`)
  console.log(`[SERVER] 🔗 Port: ${port}`)
  console.log(`[SERVER] 🌐 Frontend: http://localhost:${port}`)
  console.log(`[SERVER] 💰 Ready for trading\n`)
})

process.on('SIGINT', () => {
  console.log('\n[SERVER] Shutting down...')
  process.exit(0)
})
