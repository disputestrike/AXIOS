/**
 * UPGRADED RISK ENGINE
 * 
 * Improvements:
 * - Soft warning system (not binary on/off)
 * - Adaptive position reduction as we approach limits
 * - Volatility-adjusted risk limits
 * - Intraday momentum checks
 */

interface RiskState {
  dailyStartEquity: number
  currentEquity: number
  dailyLossPercent: number
  dailyLossLimit: number
  tradesExecutedToday: number
  maxDailyTrades: number
  isKillSwitchActive: boolean
  riskLevel: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED'
  lastMomentumCheckTime: number
  inDrawdownCycle: boolean
}

interface RiskAlert {
  level: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED'
  message: string
  positionSizeMultiplier: number // 1.0 = normal, 0.5 = half, 0.25 = quarter
  shouldStopNewTrades: boolean
}

let riskState: RiskState = {
  dailyStartEquity: 100000,
  currentEquity: 100000,
  dailyLossPercent: 0,
  dailyLossLimit: -5.0,
  tradesExecutedToday: 0,
  maxDailyTrades: 50,
  isKillSwitchActive: false,
  riskLevel: 'GREEN',
  lastMomentumCheckTime: Date.now(),
  inDrawdownCycle: false,
}

/**
 * UPGRADE 1: Calculate risk level with soft warnings
 */
function calculateRiskLevel(dailyLossPercent: number, vixLevel: number): RiskAlert {
  // Adjust limits based on VIX
  let adjustedLimit = riskState.dailyLossLimit
  if (vixLevel > 30) {
    adjustedLimit = -3.0 // More conservative
  } else if (vixLevel < 12) {
    adjustedLimit = -7.0 // Can take more risk
  }

  // GREEN: No issues (0-50% of limit)
  if (dailyLossPercent > adjustedLimit * 0.5) {
    return {
      level: 'GREEN',
      message: `Normal trading. Daily P&L: ${dailyLossPercent.toFixed(2)}% (Limit: ${adjustedLimit}%)`,
      positionSizeMultiplier: 1.0,
      shouldStopNewTrades: false,
    }
  }

  // YELLOW: Caution (50-75% of limit)
  if (dailyLossPercent > adjustedLimit * 0.75) {
    return {
      level: 'YELLOW',
      message: `⚠️  YELLOW ALERT: Daily loss at ${(Math.abs(dailyLossPercent) / Math.abs(adjustedLimit) * 100).toFixed(0)}% of limit. Reducing position size to 50%.`,
      positionSizeMultiplier: 0.5,
      shouldStopNewTrades: false,
    }
  }

  // ORANGE: High caution (75-100% of limit)
  if (dailyLossPercent > adjustedLimit) {
    return {
      level: 'ORANGE',
      message: `🔴 ORANGE ALERT: Daily loss at 75-100% of limit. Reducing position size to 25%.`,
      positionSizeMultiplier: 0.25,
      shouldStopNewTrades: false,
    }
  }

  // RED: Kill switch (100%+ of limit)
  return {
    level: 'RED',
    message: `🛑 RED ALERT: Daily loss limit reached. KILL SWITCH ACTIVATED. No new trades.`,
    positionSizeMultiplier: 0.0,
    shouldStopNewTrades: true,
  }
}

/**
 * UPGRADE 2: Check for intraday drawdown cycles
 */
function checkForDrawdownCycle(
  recentTradeResults: number[],
  checkInterval: number = 1800000 // 30 minutes
): boolean {
  const now = Date.now()
  if (now - riskState.lastMomentumCheckTime < checkInterval) {
    return riskState.inDrawdownCycle
  }

  riskState.lastMomentumCheckTime = now

  if (recentTradeResults.length < 5) {
    riskState.inDrawdownCycle = false
    return false
  }

  // Check last 5 trades: are we in a losing streak?
  const recentLosses = recentTradeResults.filter(r => r < 0).length
  const inLossingStreak = recentLosses >= 4 // 4 out of 5 recent trades are losses

  riskState.inDrawdownCycle = inLossingStreak

  return inLossingStreak
}

/**
 * UPGRADE 3: Dynamic position reduction based on drawdown
 */
function getDrawdownAdjustedPositionSize(baseSize: number): number {
  if (!riskState.inDrawdownCycle) {
    return baseSize
  }

  // In drawdown cycle: reduce new position size by 20%
  return baseSize * 0.8
}

/**
 * Get current risk alert
 */
export function getRiskAlert(vixLevel: number = 20): RiskAlert {
  const alert = calculateRiskLevel(riskState.dailyLossPercent, vixLevel)
  riskState.riskLevel = alert.level

  if (alert.shouldStopNewTrades) {
    riskState.isKillSwitchActive = true
  }

  return alert
}

/**
 * Update equity and check risk
 */
export function updateEquity(newEquity: number) {
  riskState.currentEquity = newEquity
  riskState.dailyLossPercent = 
    ((newEquity - riskState.dailyStartEquity) / riskState.dailyStartEquity) * 100
}

/**
 * Record a trade execution
 */
export function recordTrade(pnl: number, tradeResult: number) {
  riskState.tradesExecutedToday++

  // Check if we've hit max daily trades
  if (riskState.tradesExecutedToday >= riskState.maxDailyTrades) {
    console.warn('Max daily trades reached. Stopping new trades.')
    riskState.isKillSwitchActive = true
  }
}

/**
 * Check if we can take a new trade
 */
export function canTakeNewTrade(vixLevel: number = 20): {
  allowed: boolean
  reason: string
  positionSizeMultiplier: number
} {
  const alert = getRiskAlert(vixLevel)

  return {
    allowed: !alert.shouldStopNewTrades && !riskState.isKillSwitchActive,
    reason: alert.message,
    positionSizeMultiplier: alert.positionSizeMultiplier,
  }
}

/**
 * Validate position size based on risk
 */
export function validatePositionSize(
  proposedSize: number,
  vixLevel: number = 20
): {
  valid: boolean
  adjustedSize: number
  reason: string
} {
  const alert = getRiskAlert(vixLevel)

  const adjustedSize = proposedSize * alert.positionSizeMultiplier

  return {
    valid: adjustedSize > 0,
    adjustedSize,
    reason: alert.message,
  }
}

/**
 * Reset daily risk tracking (call at market open)
 */
export function resetDailyRisk(newDailyEquity: number) {
  riskState.dailyStartEquity = newDailyEquity
  riskState.currentEquity = newDailyEquity
  riskState.dailyLossPercent = 0
  riskState.tradesExecutedToday = 0
  riskState.isKillSwitchActive = false
  riskState.riskLevel = 'GREEN'
  riskState.inDrawdownCycle = false
}

/**
 * Get current risk state
 */
export function getRiskState() {
  return {
    ...riskState,
    riskAlert: calculateRiskLevel(riskState.dailyLossPercent, 20),
  }
}

/**
 * Emergency stop (manual override)
 */
export function emergencyStop() {
  riskState.isKillSwitchActive = true
  riskState.riskLevel = 'RED'
  console.error('🛑 EMERGENCY STOP ACTIVATED')
}

export default {
  getRiskAlert,
  updateEquity,
  recordTrade,
  canTakeNewTrade,
  validatePositionSize,
  resetDailyRisk,
  getRiskState,
  emergencyStop,
  checkForDrawdownCycle,
  getDrawdownAdjustedPositionSize,
}
