/**
 * MARKET REGIME DETECTOR
 * 
 * Detects market conditions and adapts strategy automatically
 * Based on VIX levels + volatility metrics
 */

import { MarketData } from './types'

export enum MarketRegime {
  EXTREME_FEAR = 'EXTREME_FEAR',     // VIX > 30
  HIGH_VOLATILITY = 'HIGH_VOLATILITY', // VIX 20-30
  NORMAL = 'NORMAL',                 // VIX 12-20
  LOW_VOLATILITY = 'LOW_VOLATILITY',  // VIX < 12
  CRASH = 'CRASH'                    // VIX > 40 + gap down
}

export interface RegimeConfig {
  regime: MarketRegime
  positionSize: number              // Multiplier: 0.5-1.5x
  targetProfit: number              // Multiplier: 0.7-1.2x
  stopLoss: number                  // Multiplier: 0.8-1.5x
  maxPositions: number              // 2-5 positions
  allowedStrategies: string[]       // Which strategies to use
  tradingActivity: 'aggressive' | 'balanced' | 'conservative'
}

export class RegimeDetector {
  private currentRegime: MarketRegime = MarketRegime.NORMAL
  private vixBuffer: number[] = []
  private maxBufferSize = 20 // Track last 20 minutes

  /**
   * DETECT CURRENT MARKET REGIME
   */
  detectRegime(vixValue: number, marketData: MarketData): MarketRegime {
    this.vixBuffer.push(vixValue)
    if (this.vixBuffer.length > this.maxBufferSize) {
      this.vixBuffer.shift()
    }

    const vixTrend = this.calculateVixTrend()
    const marketGap = this.calculateGapDown(marketData)

    // Crash detection (highest priority)
    if (vixValue > 40 && marketGap < -2) {
      this.currentRegime = MarketRegime.CRASH
      return MarketRegime.CRASH
    }

    // Extreme fear
    if (vixValue > 30) {
      this.currentRegime = MarketRegime.EXTREME_FEAR
      return MarketRegime.EXTREME_FEAR
    }

    // High volatility
    if (vixValue > 20) {
      this.currentRegime = MarketRegime.HIGH_VOLATILITY
      return MarketRegime.HIGH_VOLATILITY
    }

    // Low volatility
    if (vixValue < 12) {
      this.currentRegime = MarketRegime.LOW_VOLATILITY
      return MarketRegime.LOW_VOLATILITY
    }

    // Normal (default)
    this.currentRegime = MarketRegime.NORMAL
    return MarketRegime.NORMAL
  }

  /**
   * GET CONFIGURATION FOR CURRENT REGIME
   */
  getRegimeConfig(basePositionSize: number, baseTarget: number, baseStopLoss: number): RegimeConfig {
    switch (this.currentRegime) {
      case MarketRegime.EXTREME_FEAR:
        return {
          regime: MarketRegime.EXTREME_FEAR,
          positionSize: basePositionSize * 0.6,     // Reduce 40%
          targetProfit: baseTarget * 0.8,           // Smaller targets
          stopLoss: baseStopLoss * 1.3,             // Wider stops
          maxPositions: 2,                          // Fewer positions
          allowedStrategies: ['defensive_spreads'], // Only spreads
          tradingActivity: 'conservative'
        }

      case MarketRegime.HIGH_VOLATILITY:
        return {
          regime: MarketRegime.HIGH_VOLATILITY,
          positionSize: basePositionSize * 0.75,    // Reduce 25%
          targetProfit: baseTarget * 0.9,           // Slightly smaller
          stopLoss: baseStopLoss * 1.1,             // Slightly wider
          maxPositions: 3,                          // Conservative
          allowedStrategies: ['balanced_spreads', 'hedged_calls'],
          tradingActivity: 'balanced'
        }

      case MarketRegime.NORMAL:
        return {
          regime: MarketRegime.NORMAL,
          positionSize: basePositionSize,           // Full size
          targetProfit: baseTarget,                 // Target as planned
          stopLoss: baseStopLoss,                   // Stops as planned
          maxPositions: 4,                          // Standard
          allowedStrategies: ['directional', 'spreads', 'straddles'],
          tradingActivity: 'balanced'
        }

      case MarketRegime.LOW_VOLATILITY:
        return {
          regime: MarketRegime.LOW_VOLATILITY,
          positionSize: basePositionSize * 1.15,    // Increase 15%
          targetProfit: baseTarget * 1.1,           // Bigger targets (wider moves)
          stopLoss: baseStopLoss * 0.85,            // Tighter stops (less room)
          maxPositions: 4,                          // Full aggression
          allowedStrategies: ['directional', 'aggressive_spreads', 'momentum'],
          tradingActivity: 'aggressive'
        }

      case MarketRegime.CRASH:
        return {
          regime: MarketRegime.CRASH,
          positionSize: basePositionSize * 0.4,     // Reduce 60%
          targetProfit: baseTarget * 0.5,           // Tiny targets
          stopLoss: baseStopLoss * 2.0,             // Very wide stops
          maxPositions: 1,                          // Only 1 position
          allowedStrategies: ['protective_puts'],   // Defensive only
          tradingActivity: 'conservative'
        }

      default:
        return this.getRegimeConfig(basePositionSize, baseTarget, baseStopLoss)
    }
  }

  /**
   * CALCULATE VIX TREND (is volatility increasing or decreasing?)
   */
  private calculateVixTrend(): number {
    if (this.vixBuffer.length < 5) return 0

    const recent = this.vixBuffer.slice(-5)
    const avgRecent = recent.reduce((a, b) => a + b) / recent.length
    const avgOlder = this.vixBuffer.slice(0, 5).reduce((a, b) => a + b) / 5

    return avgRecent - avgOlder // Positive = increasing volatility
  }

  /**
   * DETECT GAP DOWN AT MARKET OPEN
   */
  private calculateGapDown(marketData: MarketData): number {
    if (!marketData.open || !marketData.close) return 0
    return ((marketData.open - marketData.close) / marketData.close) * 100
  }

  /**
   * GET HUMAN-READABLE REGIME NAME
   */
  getRegimeName(): string {
    const names: Record<MarketRegime, string> = {
      [MarketRegime.EXTREME_FEAR]: '🔴 EXTREME FEAR',
      [MarketRegime.HIGH_VOLATILITY]: '🟠 HIGH VOLATILITY',
      [MarketRegime.NORMAL]: '🟡 NORMAL',
      [MarketRegime.LOW_VOLATILITY]: '🟢 LOW VOLATILITY',
      [MarketRegime.CRASH]: '🚨 CRASH MODE'
    }
    return names[this.currentRegime]
  }

  /**
   * GET CURRENT REGIME
   */
  getCurrentRegime(): MarketRegime {
    return this.currentRegime
  }

  /**
   * RESET (daily)
   */
  reset(): void {
    this.vixBuffer = []
  }
}
