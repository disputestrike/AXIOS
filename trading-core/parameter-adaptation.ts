/**
 * PARAMETER ADAPTATION ENGINE
 * 
 * Adjusts stop loss and profit targets based on:
 * - Implied volatility
 * - Average True Range (ATR)
 * - Market regime
 */

import { TradeOpportunity } from './types'

export interface AdaptedParameters {
  originalStopLoss: number
  adaptedStopLoss: number
  originalTarget: number
  adaptedTarget: number
  volatilityAdjustment: number    // 0.5 to 2.0x
  atrMultiplier: number
  rationale: string
}

export class ParameterAdaptationEngine {
  /**
   * ADAPT PARAMETERS BASED ON VOLATILITY
   */
  adaptParameters(
    opportunity: TradeOpportunity,
    impliedVol: number,
    atr: number,
    baseStopLoss: number,
    baseTarget: number
  ): AdaptedParameters {
    // IV RANK normalization (0-100)
    // Low IV = Tighter stops, smaller targets
    // High IV = Wider stops, larger targets
    const ivRank = this.calculateIVRank(impliedVol)
    const volMultiplier = this.getVolatilityMultiplier(ivRank)

    // ATR-based stops (more universal than fixed)
    const atrStop = atr * 1.5 // 1.5 ATR for stop loss
    const atrTarget = atr * 3.0 // 3 ATR for profit target

    // Combine methods
    const adaptedStopLoss = Math.min(baseStopLoss * volMultiplier, atrStop)
    const adaptedTarget = baseTarget * volMultiplier

    // Ensure target is at least 1.5x the stop (good risk/reward)
    const minTarget = adaptedStopLoss * 1.5
    const finalTarget = Math.max(adaptedTarget, minTarget)

    return {
      originalStopLoss: baseStopLoss,
      adaptedStopLoss: Math.round(adaptedStopLoss * 100) / 100,
      originalTarget: baseTarget,
      adaptedTarget: Math.round(finalTarget * 100) / 100,
      volatilityAdjustment: volMultiplier,
      atrMultiplier: atrStop / baseStopLoss,
      rationale: this.generateRationale(ivRank, volMultiplier, opportunity.symbol)
    }
  }

  /**
   * CALCULATE IV RANK (0-100 scale)
   * 
   * IV Rank = (Current IV - 52-week low) / (52-week high - 52-week low) * 100
   * 
   * For simplification, we estimate based on current IV:
   * - IV < 15: Very low (0-20)
   * - IV 15-20: Low (20-40)
   * - IV 20-30: Medium (40-60)
   * - IV 30-40: High (60-80)
   * - IV > 40: Very high (80-100)
   */
  private calculateIVRank(iv: number): number {
    if (iv < 10) return 10
    if (iv < 15) return 25
    if (iv < 20) return 40
    if (iv < 25) return 55
    if (iv < 30) return 70
    if (iv < 40) return 85
    return 95
  }

  /**
   * CONVERT IV RANK TO VOLATILITY MULTIPLIER
   * 
   * Low volatility (IV rank < 30): Tighter stops, smaller targets
   * Medium volatility (IV rank 30-70): Normal stops/targets
   * High volatility (IV rank > 70): Wider stops, bigger targets
   */
  private getVolatilityMultiplier(ivRank: number): number {
    if (ivRank < 20) return 0.7   // Tight stops, tight targets (choppy, hard market)
    if (ivRank < 40) return 0.85  // Slightly tight
    if (ivRank < 60) return 1.0   // Normal (baseline)
    if (ivRank < 80) return 1.15  // Slightly wider
    if (ivRank < 90) return 1.3   // Much wider (volatile)
    return 1.5                    // Very wide (extreme volatility)
  }

  /**
   * GENERATE READABLE RATIONALE
   */
  private generateRationale(ivRank: number, multiplier: number, symbol: string): string {
    if (ivRank < 25) {
      return `${symbol} IV rank LOW (${ivRank.toFixed(0)}). Tight stops (${multiplier}x) - expect choppy moves.`
    }
    if (ivRank < 50) {
      return `${symbol} IV rank MEDIUM-LOW (${ivRank.toFixed(0)}). Normal parameters (${multiplier}x).`
    }
    if (ivRank < 75) {
      return `${symbol} IV rank MEDIUM-HIGH (${ivRank.toFixed(0)}). Standard parameters (${multiplier}x).`
    }
    if (ivRank < 90) {
      return `${symbol} IV rank HIGH (${ivRank.toFixed(0)}). Wider stops (${multiplier}x) - expect bigger swings.`
    }
    return `${symbol} IV rank EXTREME (${ivRank.toFixed(0)}). Very wide parameters (${multiplier}x) - extreme volatility.`
  }

  /**
   * OPTIMAL RISK/REWARD RATIO
   */
  calculateOptimalRiskReward(
    entryPrice: number,
    stopLoss: number,
    impliedVol: number
  ): { target: number; riskRewardRatio: number } {
    const riskAmount = entryPrice - stopLoss
    const ivRank = this.calculateIVRank(impliedVol)

    // Optimal R:R varies by condition
    let riskRewardMultiplier: number

    if (ivRank < 30) {
      riskRewardMultiplier = 1.5 // Tight market, tight R:R
    } else if (ivRank < 70) {
      riskRewardMultiplier = 2.0 // Normal market
    } else {
      riskRewardMultiplier = 2.5 // Volatile market, can be more aggressive
    }

    const targetPrice = entryPrice + riskAmount * riskRewardMultiplier

    return {
      target: Math.round(targetPrice * 100) / 100,
      riskRewardRatio: riskRewardMultiplier
    }
  }

  /**
   * DYNAMIC POSITION SIZING BASED ON VOLATILITY
   * 
   * High volatility → Smaller positions (less sure about direction)
   * Low volatility → Larger positions (more confident in directional moves)
   */
  calculateDynamicPositionSize(
    baseSize: number,
    impliedVol: number,
    accountEquity: number,
    maxRiskAmount: number
  ): number {
    const ivRank = this.calculateIVRank(impliedVol)

    // Position size multiplier
    let sizeMultiplier: number
    if (ivRank < 25) {
      sizeMultiplier = 1.3   // Larger (low IV = more confident)
    } else if (ivRank < 50) {
      sizeMultiplier = 1.1
    } else if (ivRank < 75) {
      sizeMultiplier = 0.9
    } else {
      sizeMultiplier = 0.6   // Much smaller (high IV = uncertain)
    }

    const adaptedSize = baseSize * sizeMultiplier

    // Don't exceed max risk
    const maxSize = Math.floor(maxRiskAmount / impliedVol)

    return Math.min(adaptedSize, maxSize)
  }
}
