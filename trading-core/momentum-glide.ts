/**
 * MOMENTUM GLIDE ENGINE
 * 
 * Locks in profits while letting winners run:
 * - Trailing stops (tighten as profit grows)
 * - Momentum continuation
 * - Anti-reversal logic
 * - Profit protection
 */

interface Position {
  symbol: string
  strike: number
  expiry: string
  type: 'C' | 'P'
  entryPrice: number
  entryTime: number
  currentPrice: number
  maxPrice: number // highest price achieved
  quantity: number
  pnl?: number
  pnlPercent?: number
}

interface GlideAction {
  hold: boolean
  exit: boolean
  reason?: string
  stopPrice?: number
}

/**
 * Momentum glide logic - adaptive trailing stops
 */
export function momentumGlide(position: Position): GlideAction {
  // Update max price achieved
  position.maxPrice = Math.max(position.maxPrice || position.entryPrice, position.currentPrice)

  // Calculate profit
  const profit = position.currentPrice - position.entryPrice
  const profitPercent = (profit / position.entryPrice) * 100

  position.pnl = profit * position.quantity
  position.pnlPercent = profitPercent

  // ===== HARD STOP LOSSES =====
  // -20% stop: absolute max loss
  if (profitPercent < -20) {
    return {
      hold: false,
      exit: true,
      reason: 'Hard stop loss (-20%)',
      stopPrice: position.entryPrice * 0.8
    }
  }

  // ===== TRAILING STOPS (adaptive based on profit) =====
  // No profit yet - loose stop
  if (profitPercent < 0) {
    const stop = position.maxPrice * 0.95 // 5% trail
    return {
      hold: position.currentPrice > stop,
      exit: position.currentPrice <= stop,
      reason: profitPercent < -10 ? 'Stop loss' : undefined,
      stopPrice: stop
    }
  }

  // Small profit (0-10%) - medium trail
  if (profitPercent >= 0 && profitPercent < 10) {
    const trail = 0.1 // 10% trailing stop
    const stop = position.maxPrice * (1 - trail)
    return {
      hold: position.currentPrice > stop,
      exit: position.currentPrice <= stop,
      stopPrice: stop
    }
  }

  // Medium profit (10-20%) - tighter trail
  if (profitPercent >= 10 && profitPercent < 20) {
    const trail = 0.075 // 7.5% trailing stop
    const stop = position.maxPrice * (1 - trail)
    return {
      hold: position.currentPrice > stop,
      exit: position.currentPrice <= stop,
      stopPrice: stop
    }
  }

  // Good profit (20-30%) - aggressive trail
  if (profitPercent >= 20 && profitPercent < 30) {
    const trail = 0.05 // 5% trailing stop
    const stop = position.maxPrice * (1 - trail)
    return {
      hold: position.currentPrice > stop,
      exit: position.currentPrice <= stop,
      stopPrice: stop
    }
  }

  // ===== TAKE PROFITS AT TARGETS =====
  // +30% - LOCK PROFITS, exit
  if (profitPercent >= 30) {
    return {
      hold: false,
      exit: true,
      reason: 'Take profit target (+30%)',
      stopPrice: position.currentPrice
    }
  }

  // Default: hold
  return {
    hold: true,
    exit: false
  }
}

/**
 * Detect reversal patterns (exit before momentum turns)
 */
export function detectReversal(position: Position, historicalPrices: number[]): boolean {
  if (historicalPrices.length < 3) return false

  const recent = historicalPrices.slice(-3)
  const [p1, p2, p3] = recent

  // Check for reversal pattern
  // Higher-High-Lower (bearish reversal on call)
  if (p1 < p2 && p2 > p3 && position.type === 'C') {
    console.log(`[GLIDE] Reversal detected for ${position.symbol} - consider exiting`)
    return true
  }

  // Lower-Low-Higher (bullish reversal on put)
  if (p1 > p2 && p2 < p3 && position.type === 'P') {
    console.log(`[GLIDE] Reversal detected for ${position.symbol} - consider exiting`)
    return true
  }

  return false
}

/**
 * Manage time decay for options
 */
export function checkTimeDecay(position: Position, expiryDate: Date): GlideAction {
  const now = new Date()
  const daysToExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  // Exit if theta is winning (approaching expiry with small profit)
  if (daysToExpiry <= 1 && position.pnlPercent! < 5) {
    return {
      hold: false,
      exit: true,
      reason: `Time decay risk (${daysToExpiry} days to expiry)`
    }
  }

  return {
    hold: true,
    exit: false
  }
}

/**
 * Smart position scaling (take partial profits)
 */
export function scaleOut(position: Position): { holdQuantity: number; exitQuantity: number } {
  if (position.pnlPercent! < 10) {
    // No scaling yet
    return { holdQuantity: position.quantity, exitQuantity: 0 }
  }

  if (position.pnlPercent! < 20) {
    // Take 25% profit
    const exit = Math.floor(position.quantity * 0.25)
    return { holdQuantity: position.quantity - exit, exitQuantity: exit }
  }

  if (position.pnlPercent! < 30) {
    // Take 50% profit
    const exit = Math.floor(position.quantity * 0.5)
    return { holdQuantity: position.quantity - exit, exitQuantity: exit }
  }

  // Take everything
  return { holdQuantity: 0, exitQuantity: position.quantity }
}
