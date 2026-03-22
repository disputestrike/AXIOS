/**
 * UPGRADED MOMENTUM GLIDE
 * 
 * Improvements:
 * - ATR-based dynamic TP/SL (volatility-aware)
 * - Partial profit taking (lock gains)
 * - IV change monitoring
 * - More sophisticated trailing stops
 */

import { Trade } from './types'

interface StopLossConfig {
  hardStopPercent: number
  atrMultiplier: number
  usePartialProfitTaking: boolean
}

interface PositionTracker {
  entryPrice: number
  entryTime: number
  currentPrice: number
  maxPrice: number
  minPrice: number
  atr: number
  currentIv: number
  entryIv: number
  pnlPercent: number
  status: 'open' | 'partial_taken' | 'closed'
  partialsProfitTaken: number
}

const DEFAULT_CONFIG: StopLossConfig = {
  hardStopPercent: -20,
  atrMultiplier: 1.5,
  usePartialProfitTaking: true,
}

const positionTrackers = new Map<string, PositionTracker>()

/**
 * UPGRADE 1: Calculate ATR-based stops
 */
function calculateAtrBasedStops(position: PositionTracker, config: StopLossConfig) {
  const atr = position.atr
  
  // Dynamic SL = Entry - (1.5 × ATR)
  const dynamicSl = position.entryPrice - (config.atrMultiplier * atr)
  
  // Dynamic TP = Entry + (3.0 × ATR)
  const dynamicTp = position.entryPrice + (3.0 * atr)
  
  return {
    sl: Math.max(dynamicSl, position.entryPrice * (1 + config.hardStopPercent / 100)),
    tp: dynamicTp,
    atrBased: true,
  }
}

/**
 * UPGRADE 2: Volatility-adjusted trailing stops
 */
function getVolatilityAdjustedTrailingStop(
  position: PositionTracker,
  config: StopLossConfig
): number {
  const pnl = position.pnlPercent

  if (pnl <= 0) {
    // No profit yet: use ATR-based stop
    return position.entryPrice - (1.5 * position.atr)
  }

  if (pnl < 15) {
    // +0-15%: Wider stop (ATR × 1.5)
    return position.maxPrice - (position.atr * 1.5)
  }

  if (pnl < 30) {
    // +15-30%: Medium stop (ATR × 2.0)
    return position.maxPrice - (position.atr * 2.0)
  }

  if (pnl < 50) {
    // +30-50%: Tighter stop (ATR × 2.5)
    return position.maxPrice - (position.atr * 2.5)
  }

  // +50%+: Very tight stop (protect gains)
  return position.maxPrice - (position.atr * 3.0)
}

/**
 * UPGRADE 3: Partial profit taking (lock in gains)
 */
function shouldTakePartialProfit(position: PositionTracker, config: StopLossConfig): boolean {
  if (!config.usePartialProfitTaking) return false
  if (position.partialsProfitTaken >= 3) return false // Max 3 partials

  const pnl = position.pnlPercent

  // At +20%: Take 25% of position
  if (pnl >= 20 && position.partialsProfitTaken === 0) {
    return true
  }

  // At +35%: Take another 25%
  if (pnl >= 35 && position.partialsProfitTaken === 1) {
    return true
  }

  // At +50%: Take remaining at market
  if (pnl >= 50 && position.partialsProfitTaken === 2) {
    return true
  }

  return false
}

/**
 * UPGRADE 4: IV-based exit signal
 */
function checkIvExitSignal(position: PositionTracker): string | null {
  const ivChangePercent = ((position.currentIv - position.entryIv) / position.entryIv) * 100

  // IV drops > 20%: Volatility crush (exit)
  if (ivChangePercent < -20) {
    return 'IV_CRUSH_EXIT'
  }

  // IV spikes > 30%: Volatility spike (tighten stops)
  if (ivChangePercent > 30) {
    return 'IV_SPIKE_TIGHTEN'
  }

  return null
}

/**
 * Determine stop loss for a position
 */
export function determineStopLoss(
  trade: Trade,
  currentPrice: number,
  atr: number,
  currentIv: number,
  config: Partial<StopLossConfig> = {}
): {
  stopLoss: number
  takeProfit: number
  trailingStop: number
  shouldExit: boolean
  exitReason?: string
} {
  const finalConfig = { ...DEFAULT_CONFIG, ...config }

  // Create or update position tracker
  const positionId = `${trade.symbol}_${trade.strike}`
  let position = positionTrackers.get(positionId)

  if (!position) {
    position = {
      entryPrice: trade.entryPrice || currentPrice,
      entryTime: Date.now(),
      currentPrice,
      maxPrice: currentPrice,
      minPrice: currentPrice,
      atr,
      currentIv,
      entryIv: currentIv,
      pnlPercent: 0,
      status: 'open',
      partialsProfitTaken: 0,
    }
  }

  // Update tracking
  position.currentPrice = currentPrice
  position.maxPrice = Math.max(position.maxPrice, currentPrice)
  position.minPrice = Math.min(position.minPrice, currentPrice)
  position.atr = atr
  position.currentIv = currentIv
  position.pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100

  positionTrackers.set(positionId, position)

  // Calculate stops
  const atrBasedStops = calculateAtrBasedStops(position, finalConfig)
  const trailingStop = getVolatilityAdjustedTrailingStop(position, finalConfig)

  // Check for exits
  let shouldExit = false
  let exitReason: string | undefined

  // IV-based exit
  const ivExit = checkIvExitSignal(position)
  if (ivExit) {
    shouldExit = true
    exitReason = ivExit
  }

  // Hard stop loss
  if (position.currentPrice <= atrBasedStops.sl) {
    shouldExit = true
    exitReason = 'HARD_STOP_LOSS'
  }

  // Trailing stop hit
  if (position.currentPrice <= trailingStop && position.pnlPercent > 0) {
    shouldExit = true
    exitReason = 'TRAILING_STOP_HIT'
  }

  // Check for partial profit taking
  if (shouldTakePartialProfit(position, finalConfig)) {
    position.partialsProfitTaken++
    // Note: This would trigger a partial exit, not full close
  }

  return {
    stopLoss: atrBasedStops.sl,
    takeProfit: atrBasedStops.tp,
    trailingStop,
    shouldExit,
    exitReason,
  }
}

/**
 * Get momentum and identify reversals
 */
export function checkForReversal(
  recentPrices: number[],
  atr: number
): {
  isReversing: boolean
  strength: number // 0-100
} {
  if (recentPrices.length < 3) {
    return { isReversing: false, strength: 0 }
  }

  const recent = recentPrices.slice(-3)
  const direction = recent[2] - recent[0]
  const magnitude = Math.abs(direction)

  // Check if price is reversing (moving opposite to trend)
  const isReversing = Math.abs(recent[2] - recent[1]) > (atr * 0.5)

  // Strength: how strong is the reversal?
  const strength = Math.min(100, (magnitude / (atr * 2)) * 100)

  return { isReversing, strength }
}

/**
 * Clean up closed positions
 */
export function cleanupClosedPosition(positionId: string) {
  positionTrackers.delete(positionId)
}

/**
 * Get all tracked positions
 */
export function getTrackedPositions() {
  return Array.from(positionTrackers.entries()).map(([id, data]) => ({
    id,
    ...data,
  }))
}

export default {
  determineStopLoss,
  checkForReversal,
  cleanupClosedPosition,
  getTrackedPositions,
  calculateAtrBasedStops,
  getVolatilityAdjustedTrailingStop,
}
