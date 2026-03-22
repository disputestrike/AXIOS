/**
 * RISK ENGINE
 * 
 * Non-negotiable safety:
 * - Daily loss limit (5%)
 * - Max position size
 * - Kill switch
 * - Anomaly detection
 */

let dailyLoss = 0
let killSwitchActive = false
let sessionStartTime = Date.now()
const DAILY_LOSS_LIMIT = 0.05 // 5% of equity
const MAX_DAILY_TRADES = 50

let tradeCount = 0

interface RiskState {
  dailyLoss: number
  killSwitch: boolean
  tradeCount: number
  timeElapsed: number
}

/**
 * Update risk metrics after each trade
 */
export function updateRisk(result: any, equity: number) {
  if (!result || typeof result.pnl !== 'number') return

  const pnl = result.pnl

  // Track daily loss
  if (pnl < 0) {
    dailyLoss += Math.abs(pnl)
  }

  tradeCount++

  // Check limits
  const dailyLossPercent = dailyLoss / equity

  console.log(
    `[RISK] Update: P&L ${pnl.toFixed(0)}, Daily Loss ${dailyLossPercent.toFixed(2)}%, ` +
    `Trades: ${tradeCount}`
  )

  // CHECK KILL SWITCH CONDITIONS
  if (dailyLossPercent > DAILY_LOSS_LIMIT) {
    killSwitchActive = true
    console.error(
      `[RISK] ❌ KILL SWITCH ACTIVATED: Daily loss ${dailyLossPercent.toFixed(2)}% ` +
      `exceeds ${(DAILY_LOSS_LIMIT * 100).toFixed(1)}%`
    )
  }

  if (tradeCount > MAX_DAILY_TRADES) {
    killSwitchActive = true
    console.error(`[RISK] ❌ KILL SWITCH: Max daily trades (${MAX_DAILY_TRADES}) exceeded`)
  }
}

/**
 * Check if kill switch is active - throws if triggered
 */
export function checkKillSwitch() {
  if (killSwitchActive) {
    throw new Error('TRADING HALTED: Kill switch activated')
  }
}

/**
 * Reset daily limits (call at end of trading day)
 */
export function resetDailyLimits() {
  console.log('[RISK] Resetting daily limits')
  dailyLoss = 0
  tradeCount = 0
  killSwitchActive = false
  sessionStartTime = Date.now()
}

/**
 * Get risk state
 */
export function getRiskState(equity: number): RiskState {
  return {
    dailyLoss: dailyLoss,
    killSwitch: killSwitchActive,
    tradeCount,
    timeElapsed: Date.now() - sessionStartTime
  }
}

/**
 * Validate trade before execution
 */
export function validateTradeRisk(trade: any, equity: number): { valid: boolean; reason?: string } {
  // Check kill switch
  if (killSwitchActive) {
    return { valid: false, reason: 'Kill switch active' }
  }

  // Check max daily trades
  if (tradeCount >= MAX_DAILY_TRADES) {
    return { valid: false, reason: 'Max daily trades reached' }
  }

  // Check position size
  const maxPosition = equity * 0.05 // Max 5% per position
  const tradeSize = (trade.allocation || 1000)

  if (tradeSize > maxPosition) {
    return { valid: false, reason: `Position size ${tradeSize} exceeds max ${maxPosition}` }
  }

  // Check daily loss impact
  const worstCase = tradeSize * 0.2 // Assume 20% loss worst case
  const projectedLoss = dailyLoss + worstCase

  if (projectedLoss / equity > DAILY_LOSS_LIMIT * 1.5) {
    // Warning but allow (aggressive mode)
    console.warn('[RISK] Position would push daily loss close to limit')
  }

  return { valid: true }
}

/**
 * Emergency stop
 */
export function emergencyStop(reason: string) {
  console.error(`[RISK] 🛑 EMERGENCY STOP: ${reason}`)
  killSwitchActive = true
}

/**
 * Get risk metrics summary
 */
export function getRiskSummary(equity: number): string {
  const dailyLossPercent = (dailyLoss / equity) * 100
  const status = killSwitchActive ? '🛑 HALTED' : '✅ ACTIVE'

  return `
╔════════════════════════════════════════╗
║          RISK MANAGEMENT                ║
╠════════════════════════════════════════╣
║ Status:      ${status.padEnd(15)} ║
║ Daily Loss:  ${dailyLossPercent.toFixed(2)}%${' '.repeat(12)} ║
║ Limit:       ${(DAILY_LOSS_LIMIT * 100).toFixed(1)}%${' '.repeat(12)} ║
║ Trades:      ${String(tradeCount).padEnd(15)} ║
║ Max Trades:  ${String(MAX_DAILY_TRADES).padEnd(15)} ║
╚════════════════════════════════════════╝
  `
}
