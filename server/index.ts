#!/usr/bin/env node

/**
 * AOIX-1 TRADING SYSTEM - MAIN SERVER
 * Clean entry point for Railway deployment
 */

import dotenv from 'dotenv'
import express from 'express'

dotenv.config()

const app = express()
const port = parseInt(process.env.PORT || '5001')
const mode = process.env.ENABLE_LIVE_TRADING?.toLowerCase() === 'true' ? 'LIVE' : 'PAPER'

app.use(express.json())

console.log('\n' + '═'.repeat(80))
console.log('║' + ' '.repeat(78) + '║')
console.log('║' + '  🚀 AOIX-1 TRADING SYSTEM'.padEnd(78) + '║')
console.log('║' + ' '.repeat(78) + '║')
console.log('═'.repeat(80) + '\n')

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

// Start server
app.listen(port, () => {
  console.log(`[SERVER] ✅ AOIX-1 Ready`)
  console.log(`[SERVER] 📊 Mode: ${mode} TRADING`)
  console.log(`[SERVER] 🎯 Symbol: ${process.env.TRADING_SYMBOL || 'SPX'}`)
  console.log(`[SERVER] 🔗 Port: ${port}`)
  console.log('[SERVER] 💰 Ready for trading\n')
})

process.on('SIGINT', () => {
  console.log('\n[SERVER] Shutting down...')
  process.exit(0)
})
