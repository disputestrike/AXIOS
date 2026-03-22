/**
 * SCALE DETECTION ENGINE
 * 
 * As account grows, the system trades SMARTER not HARDER
 * Fewer trades, but higher quality setups
 */

export interface ScaleConfig {
  accountSize: number
  tradesPerDay: number         // Target trades/day
  tradeQualityThreshold: number // ML score threshold
  positionSize: number         // Individual trade size
  maxOpenPositions: number     // Concurrent positions
  profitTarget: number         // Per-trade profit target
  strategy: 'scale_up' | 'quality_focus' | 'conservative'
  notes: string
}

export class ScaleDetectionEngine {
  /**
   * GET CONFIGURATION BASED ON ACCOUNT SIZE
   * 
   * Strategy shift:
   * $1K-5K: SCALE UP - Take all opportunities (volume strategy)
   * $5K-20K: QUALITY FOCUS - Filter for best trades (balanced)
   * $20K+: CONSERVATIVE - Only A+ setups (selective strategy)
   */
  getScaleConfig(accountSize: number, basePositionSize: number, baseTarget: number): ScaleConfig {
    if (accountSize < 5000) {
      // EARLY STAGE: Scale up, maximize learning
      return {
        accountSize,
        tradesPerDay: 12,
        tradeQualityThreshold: 0.55,  // Lower threshold - take more trades
        positionSize: basePositionSize,
        maxOpenPositions: 4,
        profitTarget: baseTarget,
        strategy: 'scale_up',
        notes: 'Early growth phase - volume strategy. Learning from every trade. High activity.'
      }
    }

    if (accountSize < 20000) {
      // MID STAGE: Balanced - quality over quantity
      return {
        accountSize,
        tradesPerDay: 6,           // Half as many
        tradeQualityThreshold: 0.62,  // Higher threshold
        positionSize: Math.round((basePositionSize * (accountSize / 5000)) * 10) / 10,
        maxOpenPositions: 3,
        profitTarget: baseTarget * 1.1,
        strategy: 'quality_focus',
        notes: 'Growth phase - balanced strategy. Only good trades. Profit compounding.'
      }
    }

    if (accountSize < 50000) {
      // ESTABLISHED: Very selective
      return {
        accountSize,
        tradesPerDay: 3,           // One third
        tradeQualityThreshold: 0.68,  // High threshold
        positionSize: Math.round((basePositionSize * (accountSize / 5000)) * 10) / 10,
        maxOpenPositions: 2,
        profitTarget: baseTarget * 1.15,
        strategy: 'conservative',
        notes: 'Established phase - selective strategy. Only A+ setups. Protecting profits.'
      }
    }

    // INSTITUTIONAL: Professional level
    return {
      accountSize,
      tradesPerDay: 1,  // Maybe 1-2/day, only best
      tradeQualityThreshold: 0.75,  // Very high threshold
      positionSize: Math.round((basePositionSize * (accountSize / 5000)) * 10) / 10,
      maxOpenPositions: 1,
      profitTarget: baseTarget * 1.2,
      strategy: 'conservative',
      notes: 'Professional phase - institutional strategy. Single best trade/day. Absolute quality focus.'
    }
  }

  /**
   * SHOULD WE TAKE THIS TRADE?
   * 
   * At higher account sizes, be much more selective
   */
  shouldTakeTrade(
    accountSize: number,
    mlScore: number,
    tradeQualityThreshold: number,
    openPositions: number,
    maxOpenPositions: number
  ): { allowed: boolean; reason: string } {
    // Rule 1: Max open positions
    if (openPositions >= maxOpenPositions) {
      return {
        allowed: false,
        reason: `Already have ${openPositions}/${maxOpenPositions} open positions. Wait for exit.`
      }
    }

    // Rule 2: ML score threshold
    if (mlScore < tradeQualityThreshold) {
      return {
        allowed: false,
        reason: `ML score ${mlScore.toFixed(2)} below threshold ${tradeQualityThreshold.toFixed(2)}. Skip this trade.`
      }
    }

    // Rule 3: Large accounts be extra picky
    if (accountSize > 50000 && mlScore < 0.72) {
      return {
        allowed: false,
        reason: `Account size $${accountSize.toLocaleString()}. Need exceptional setup (>0.72). This is ${mlScore.toFixed(2)}.`
      }
    }

    return {
      allowed: true,
      reason: 'Trade approved - meets all scale criteria'
    }
  }

  /**
   * POSITION SIZE SCALING
   * 
   * As account grows:
   * - Dollar amount grows (to keep 50% risk constant)
   * - Percentage of account SHRINKS (to protect capital)
   */
  calculateScaledPositionSize(
    basePositionSize: number,
    accountSize: number,
    accountGrowthFactor: number
  ): number {
    // At $5K starting: basePositionSize = $750
    // At $10K: should be $1,000 (1.33x) - slightly more
    // At $20K: should be $1,500 (2x) - proportional
    // At $50K: should be $2,500 (3.33x) - but percentage drops from 15% to 5%
    // At $100K: should be $3,000 (4x) - percentage drops to 3%

    const scaledSize = basePositionSize * Math.sqrt(accountGrowthFactor)
    const percentOfAccount = (scaledSize / accountSize) * 100

    // Safety cap: Never risk more than 3% of account per trade
    if (percentOfAccount > 3) {
      return Math.round((accountSize * 0.03) * 100) / 100
    }

    return Math.round(scaledSize * 100) / 100
  }

  /**
   * GET GROWTH MILESTONE NOTIFICATIONS
   */
  getMilestoneAlert(previousSize: number, currentSize: number): string | null {
    const milestones = [5000, 10000, 20000, 50000, 100000, 500000, 1000000]

    for (const milestone of milestones) {
      if (previousSize < milestone && currentSize >= milestone) {
        const nextConfig = this.getScaleConfig(currentSize, 750, 150)
        return `
🎉 MILESTONE REACHED: $${milestone.toLocaleString()}!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
New Configuration:
  • Strategy: ${nextConfig.strategy}
  • Trades/day: ${nextConfig.tradesPerDay}
  • ML Score threshold: ${nextConfig.tradeQualityThreshold.toFixed(2)}
  • Position size: $${nextConfig.positionSize.toFixed(2)}
  • Max open: ${nextConfig.maxOpenPositions}
  
${nextConfig.notes}
        `
      }
    }

    return null
  }

  /**
   * GROWTH TRAJECTORY SUMMARY
   */
  getGrowthTrajectory(startingSize: number = 1500): string {
    const milestones = [
      { size: 1500, days: 0, phase: 'Start' },
      { size: 5000, days: 30, phase: 'Month 1' },
      { size: 20000, days: 60, phase: 'Month 2' },
      { size: 50000, days: 90, phase: 'Month 3' },
      { size: 100000, days: 120, phase: 'Month 4' },
      { size: 300000, days: 150, phase: 'Month 5' }
    ]

    let summary = '📊 GROWTH TRAJECTORY WITH SCALE DETECTION\n'
    summary += '═══════════════════════════════════════════\n\n'

    for (const milestone of milestones) {
      const config = this.getScaleConfig(milestone.size, 750, 150)
      summary += `Day ${milestone.days.toString().padEnd(3)} (${milestone.phase}):\n`
      summary += `  Account: $${milestone.size.toLocaleString()}\n`
      summary += `  Strategy: ${config.strategy}\n`
      summary += `  Trades/day: ${config.tradesPerDay}\n`
      summary += `  Position size: $${config.positionSize.toFixed(0)}\n`
      summary += `\n`
    }

    return summary
  }
}
