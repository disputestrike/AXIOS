/**
 * TRADE LOGGER
 * 
 * Logs every trade to disk for:
 * - Audit trail
 * - Analysis
 * - Performance review
 * - Compliance
 */

import fs from 'fs'
import path from 'path'

const LOG_DIR = './logs'
const TRADE_LOG_FILE = path.join(LOG_DIR, 'trades.json')
const SESSION_LOG_FILE = path.join(LOG_DIR, 'session.json')

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

interface LogEntry {
  id: string
  timestamp: string
  isoTime: number
  symbol: string
  strike: number
  expiry: string
  type: 'C' | 'P'
  score: number
  mlProb?: number
  entry: number
  filled?: number
  filledPrice?: number
  filledSize?: number
  pnl?: number
  status: 'pending' | 'filled' | 'rejected' | 'error'
  error?: string
  notes?: string
}

/**
 * Log a trade
 */
export function logTrade(trade: any, result: any) {
  const entry: LogEntry = {
    id: generateTradeId(),
    timestamp: new Date().toISOString(),
    isoTime: Date.now(),
    symbol: trade.symbol,
    strike: trade.strike,
    expiry: trade.expiry,
    type: trade.type,
    score: trade.score || 0,
    mlProb: trade.mlProb || 0,
    entry: (trade.bid + trade.ask) / 2,
    filled: result.filled ? 1 : 0,
    filledPrice: result.filledPrice,
    filledSize: result.filledSize,
    pnl: result.pnl,
    status: result.filled ? 'filled' : 'rejected',
    error: result.error
  }

  // Load existing trades
  let trades: LogEntry[] = []
  if (fs.existsSync(TRADE_LOG_FILE)) {
    try {
      trades = JSON.parse(fs.readFileSync(TRADE_LOG_FILE, 'utf8'))
    } catch (err) {
      console.warn('[LOGGER] Failed to read existing trades')
    }
  }

  // Append new trade
  trades.push(entry)

  // Save back
  try {
    fs.writeFileSync(TRADE_LOG_FILE, JSON.stringify(trades, null, 2))
    console.log(`[LOGGER] Trade logged: ${entry.id}`)
  } catch (err) {
    console.error('[LOGGER] Failed to write trade log:', err)
  }
}

/**
 * Log session start
 */
export function logSessionStart(config: any) {
  const session = {
    startTime: new Date().toISOString(),
    startTimeMs: Date.now(),
    config,
    stats: {
      trades: 0,
      pnl: 0,
      wins: 0,
      losses: 0
    }
  }

  try {
    fs.writeFileSync(SESSION_LOG_FILE, JSON.stringify(session, null, 2))
    console.log('[LOGGER] Session started')
  } catch (err) {
    console.error('[LOGGER] Failed to log session:', err)
  }
}

/**
 * Log session end
 */
export function logSessionEnd(stats: any) {
  const session = {
    endTime: new Date().toISOString(),
    endTimeMs: Date.now(),
    stats
  }

  try {
    fs.writeFileSync(SESSION_LOG_FILE, JSON.stringify(session, null, 2))
    console.log('[LOGGER] Session ended')
  } catch (err) {
    console.error('[LOGGER] Failed to end session:', err)
  }
}

/**
 * Get trade history from log
 */
export function getTradeLog(): LogEntry[] {
  try {
    if (fs.existsSync(TRADE_LOG_FILE)) {
      return JSON.parse(fs.readFileSync(TRADE_LOG_FILE, 'utf8'))
    }
  } catch (err) {
    console.error('[LOGGER] Failed to read trade log:', err)
  }
  return []
}

/**
 * Generate unique trade ID
 */
function generateTradeId(): string {
  return `TRADE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Clear logs
 */
export function clearLogs() {
  try {
    if (fs.existsSync(TRADE_LOG_FILE)) fs.unlinkSync(TRADE_LOG_FILE)
    if (fs.existsSync(SESSION_LOG_FILE)) fs.unlinkSync(SESSION_LOG_FILE)
    console.log('[LOGGER] Logs cleared')
  } catch (err) {
    console.error('[LOGGER] Failed to clear logs:', err)
  }
}
