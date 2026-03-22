/**
 * MULTI-PRODUCT STRATEGY ENGINE
 * 
 * Different product types with different signals and risk profiles:
 * - SPX/SPY Options (directional)
 * - Credit Spreads (income)
 * - Bond Futures (hedging/diversification)
 * - Micro ES/NQ Futures (leverage)
 * - Straddles (volatility)
 */

export enum ProductType {
  SPX_OPTIONS = 'SPX_OPTIONS',           // Directional, index options
  SPY_SPREADS = 'SPY_SPREADS',           // Income, equity ETF spreads
  TLT_BONDS = 'TLT_BONDS',               // Hedging, bond futures
  MICRO_FUTURES = 'MICRO_FUTURES',       // ES/NQ, high leverage
  STRADDLES = 'STRADDLES'                // Volatility, low directional bias
}

export interface ProductConfig {
  productType: ProductType
  symbol: string
  minRequiredScore: number
  maxOpenPositions: number
  positionSizeMultiplier: number
  targetProfit: number
  stopLoss: number
  timeToExpiry: number
  bestMarketConditions: string[]
  riskProfile: 'aggressive' | 'moderate' | 'conservative'
  diversificationBenefit: string
}

export class MultiProductEngine {
  /**
   * GET ALL ACTIVE PRODUCTS FOR TRADING
   */
  getActiveProducts(): ProductConfig[] {
    return [
      this.getSPXConfig(),
      this.getSPYSpreadsConfig(),
      this.getTLTConfig(),
      this.getMicroFuturesConfig(),
      this.getStraddleConfig()
    ]
  }

  /**
   * PRODUCT 1: SPX OPTIONS (Current primary)
   */
  private getSPXConfig(): ProductConfig {
    return {
      productType: ProductType.SPX_OPTIONS,
      symbol: 'SPX',
      minRequiredScore: 0.60,
      maxOpenPositions: 3,
      positionSizeMultiplier: 1.0,  // Base size
      targetProfit: 150,
      stopLoss: 100,
      timeToExpiry: 0.15,  // 15 DTE preferred
      bestMarketConditions: ['NORMAL', 'LOW_VOLATILITY'],
      riskProfile: 'aggressive',
      diversificationBenefit: 'Direct index exposure, T+1 settlement, tightest spreads'
    }
  }

  /**
   * PRODUCT 2: SPY CREDIT SPREADS (Income strategy)
   * 
   * Strategy: Sell near-the-money puts, buy further OTM puts
   * Profit on: Stagnation or small moves
   * Loss on: Large moves down
   * Best when: IV rank is high (collect more premium)
   */
  private getSPYSpreadsConfig(): ProductConfig {
    return {
      productType: ProductType.SPY_SPREADS,
      symbol: 'SPY',
      minRequiredScore: 0.55,  // Lower because income strategy is less directional
      maxOpenPositions: 2,
      positionSizeMultiplier: 0.8,  // Slightly smaller due to spread structure
      targetProfit: 80,  // Smaller per trade, but higher win rate
      stopLoss: 120,  // Wider stop (spread structure)
      timeToExpiry: 0.30,  // 30 DTE preferred for spreads
      bestMarketConditions: ['HIGH_VOLATILITY', 'EXTREME_FEAR'],  // Collect premium when scared
      riskProfile: 'moderate',
      diversificationBenefit: 'Income generation, defined risk, lower capital requirement'
    }
  }

  /**
   * PRODUCT 3: TLT BONDS (Hedging/diversification)
   * 
   * Strategy: Long calls on TLT when stocks sell off
   * Profit on: Risk-off environments (stocks down, bonds up)
   * Loss on: Stock rallies (bonds fall)
   * Best when: Tech heavy, correlation breaks
   */
  private getTLTConfig(): ProductConfig {
    return {
      productType: ProductType.TLT_BONDS,
      symbol: 'TLT',
      minRequiredScore: 0.58,
      maxOpenPositions: 1,  // Just one, for hedging
      positionSizeMultiplier: 0.6,  // Smaller size, hedging not primary
      targetProfit: 100,
      stopLoss: 80,
      timeToExpiry: 0.30,
      bestMarketConditions: ['EXTREME_FEAR', 'CRASH', 'HIGH_VOLATILITY'],
      riskProfile: 'conservative',
      diversificationBenefit: 'Negative correlation with equities, hedges tech crashes, safe haven'
    }
  }

  /**
   * PRODUCT 4: MICRO FUTURES (ES/NQ - leverage)
   * 
   * Strategy: Directional bets on ES (S&P 500) and NQ (Nasdaq)
   * Profit on: Big moves, high leverage
   * Loss on: Whipsaw
   * Best when: Trending markets, low overnight gaps
   * 
   * Caution: High leverage - requires smaller position sizes
   */
  private getMicroFuturesConfig(): ProductConfig {
    return {
      productType: ProductType.MICRO_FUTURES,
      symbol: 'ES/NQ',  // Micro E-mini contracts
      minRequiredScore: 0.65,  // Higher threshold due to leverage
      maxOpenPositions: 1,  // Only 1 contract to manage leverage
      positionSizeMultiplier: 0.3,  // Much smaller due to high leverage
      targetProfit: 200,  // Bigger targets due to leverage
      stopLoss: 80,  // Tight stops due to leverage
      timeToExpiry: 0.05,  // Intraday, very short
      bestMarketConditions: ['NORMAL', 'LOW_VOLATILITY'],
      riskProfile: 'aggressive',
      diversificationBenefit: '24-hour trading, no overnight gaps like options, high leverage for acceleration'
    }
  }

  /**
   * PRODUCT 5: STRADDLES (Volatility play)
   * 
   * Strategy: Buy call + put at same strike (bet on big move either direction)
   * Profit on: Huge moves in either direction
   * Loss on: No move (stagnation)
   * Best when: Before earnings, before economic reports, high IV rank
   */
  private getStraddleConfig(): ProductConfig {
    return {
      productType: ProductType.STRADDLES,
      symbol: 'SPX',  // Use SPX for straddles
      minRequiredScore: 0.62,
      maxOpenPositions: 1,  // Only 1, very expensive
      positionSizeMultiplier: 0.4,  // Much smaller due to double premium
      targetProfit: 200,  // Need bigger move to profit
      stopLoss: 150,  // Expensive to hold
      timeToExpiry: 0.20,  // 20 DTE to earnings/event
      bestMarketConditions: ['HIGH_VOLATILITY'],
      riskProfile: 'aggressive',
      diversificationBenefit: 'Non-directional, profits from large moves, captures vol expansion'
    }
  }

  /**
   * WHICH PRODUCT TO TRADE RIGHT NOW?
   */
  selectProductForCurrentConditions(
    regime: string,
    vixValue: number,
    accountSize: number
  ): ProductType[] {
    const selected: ProductType[] = []

    // Always include SPX (the core)
    selected.push(ProductType.SPX_OPTIONS)

    // Add based on regime
    if (regime === 'LOW_VOLATILITY') {
      selected.push(ProductType.MICRO_FUTURES)  // Use leverage when calm
    }

    if (regime === 'HIGH_VOLATILITY' || regime === 'EXTREME_FEAR') {
      selected.push(ProductType.SPY_SPREADS)   // Collect premium
      selected.push(ProductType.STRADDLES)     // Bet on big moves
    }

    // Add TLT hedge if tech-heavy
    if (accountSize > 10000) {
      selected.push(ProductType.TLT_BONDS)
    }

    return selected
  }

  /**
   * OVERALL PORTFOLIO SUMMARY
   */
  getPortfolioSummary(): string {
    const products = this.getActiveProducts()

    let summary = '📊 MULTI-PRODUCT TRADING PORTFOLIO\n'
    summary += '═══════════════════════════════════════════════════════════════\n\n'

    for (const product of products) {
      summary += `${product.productType}\n`
      summary += `─────────────────────────────────────────────────────\n`
      summary += `Symbol: ${product.symbol}\n`
      summary += `Risk Profile: ${product.riskProfile}\n`
      summary += `Min Score: ${product.minRequiredScore.toFixed(2)}\n`
      summary += `Max Open: ${product.maxOpenPositions}\n`
      summary += `Target/Stop: +$${product.targetProfit}/-$${product.stopLoss}\n`
      summary += `Best Conditions: ${product.bestMarketConditions.join(', ')}\n`
      summary += `Benefit: ${product.diversificationBenefit}\n`
      summary += `\n`
    }

    summary += '═══════════════════════════════════════════════════════════════\n'
    summary += 'DIVERSIFICATION BENEFITS:\n'
    summary += '✓ SPX Options: Core directional strategy (aggressive)\n'
    summary += '✓ SPY Spreads: Income in high-IV environments (moderate)\n'
    summary += '✓ TLT Bonds: Hedges stock crashes (safe)\n'
    summary += '✓ Micro Futures: High leverage in calm markets (aggressive)\n'
    summary += '✓ Straddles: Volatility expansion profits (speculative)\n'
    summary += '\nResult: Not correlated, smooth equity curve, multiple profit sources\n'

    return summary
  }

  /**
   * ALLOCATION ACROSS PRODUCTS BY ACCOUNT SIZE
   */
  getAllocationMatrix(accountSize: number): Record<ProductType, number> {
    if (accountSize < 5000) {
      // Early stage: just SPX
      return {
        [ProductType.SPX_OPTIONS]: 1.0,
        [ProductType.SPY_SPREADS]: 0,
        [ProductType.TLT_BONDS]: 0,
        [ProductType.MICRO_FUTURES]: 0,
        [ProductType.STRADDLES]: 0
      }
    }

    if (accountSize < 20000) {
      // Growing: add spreads
      return {
        [ProductType.SPX_OPTIONS]: 0.70,
        [ProductType.SPY_SPREADS]: 0.20,
        [ProductType.TLT_BONDS]: 0.05,
        [ProductType.MICRO_FUTURES]: 0.05,
        [ProductType.STRADDLES]: 0
      }
    }

    if (accountSize < 50000) {
      // Established: balanced across all
      return {
        [ProductType.SPX_OPTIONS]: 0.50,
        [ProductType.SPY_SPREADS]: 0.20,
        [ProductType.TLT_BONDS]: 0.10,
        [ProductType.MICRO_FUTURES]: 0.15,
        [ProductType.STRADDLES]: 0.05
      }
    }

    // Institutional: professional allocation
    return {
      [ProductType.SPX_OPTIONS]: 0.40,
      [ProductType.SPY_SPREADS]: 0.25,
      [ProductType.TLT_BONDS]: 0.15,
      [ProductType.MICRO_FUTURES]: 0.15,
      [ProductType.STRADDLES]: 0.05
    }
  }
}
