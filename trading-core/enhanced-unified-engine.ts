/**
 * ENHANCED AOIX-1 UNIFIED ENGINE
 * 
 * Integrates all 5 enhancements:
 * 1. Regime detection (VIX-based)
 * 2. Position correlation (matrix)
 * 3. Parameter adaptation (volatility-adjusted)
 * 4. Scale detection (trades fewer as grows)
 * 5. Multiple products (SPX, SPY, TLT, Futures, Straddles)
 * 
 * Result: Smoother equity curve, higher Sharpe ratio, better scaling
 */

import { RegimeDetector, MarketRegime } from './regime-detector'
import { PositionCorrelationManager } from './position-correlation'
import { ParameterAdaptationEngine } from './parameter-adaptation'
import { ScaleDetectionEngine } from './scale-detection'
import { MultiProductEngine, ProductType } from './multi-product'
import { Trade, Position, TradeOpportunity } from './types'

export interface EnhancedTradingConfig {
  // Regime awareness
  regime: MarketRegime
  regimeAdjustedPositionSize: number
  regimeAdjustedTarget: number
  regimeAdjustedStop: number

  // Correlation filtering
  correlationApproved: boolean
  correlationWarnings: string[]

  // Parameter adaptation
  adaptedStopLoss: number
  adaptedTarget: number
  volatilityAdjustment: number

  // Scale detection
  tradesPerDayTarget: number
  mlScoreThreshold: number
  maxOpenPositions: number

  // Multi-product
  allowedProducts: ProductType[]
  productAllocation: Record<ProductType, number>
}

export class EnhancedUnifiedEngine {
  private regimeDetector: RegimeDetector
  private correlationManager: PositionCorrelationManager
  private parameterAdapter: ParameterAdaptationEngine
  private scaleDetector: ScaleDetectionEngine
  private multiProduct: MultiProductEngine

  private openPositions: Position[] = []
  private accountEquity: number = 1500

  constructor() {
    this.regimeDetector = new RegimeDetector()
    this.correlationManager = new PositionCorrelationManager()
    this.parameterAdapter = new ParameterAdaptationEngine()
    this.scaleDetector = new ScaleDetectionEngine()
    this.multiProduct = new MultiProductEngine()
  }

  /**
   * MAIN TRADING DECISION LOOP
   * 
   * Called when evaluating a new opportunity
   */
  async evaluateOpportunity(
    opportunity: TradeOpportunity,
    vixValue: number,
    currentMarketData: any,
    basePositionSize: number = 750,
    baseTarget: number = 150,
    baseStopLoss: number = 100
  ): Promise<{
    shouldTrade: boolean
    config: EnhancedTradingConfig
    reasons: string[]
  }> {
    const reasons: string[] = []

    // ──────────────────────────────────────────────────────────────
    // STEP 1: DETECT MARKET REGIME
    // ──────────────────────────────────────────────────────────────
    const regime = this.regimeDetector.detectRegime(vixValue, currentMarketData)
    const regimeConfig = this.regimeDetector.getRegimeConfig(basePositionSize, baseTarget, baseStopLoss)

    reasons.push(`🌍 Market Regime: ${this.regimeDetector.getRegimeName()}`)

    // ──────────────────────────────────────────────────────────────
    // STEP 2: CHECK POSITION CORRELATION
    // ──────────────────────────────────────────────────────────────
    const correlationCheck = this.correlationManager.canAddPosition(opportunity.symbol, this.openPositions)

    if (!correlationCheck.allowed) {
      reasons.push(`❌ Correlation filter: ${correlationCheck.reason}`)
      return {
        shouldTrade: false,
        config: this.buildConfig(regime, regimeConfig, undefined, basePositionSize),
        reasons
      }
    }
    reasons.push(`✓ Correlation approved: Low correlation with existing positions`)

    // ──────────────────────────────────────────────────────────────
    // STEP 3: ADAPT PARAMETERS FOR VOLATILITY
    // ──────────────────────────────────────────────────────────────
    const atr = this.estimateATR(opportunity)
    const adaptedParams = this.parameterAdapter.adaptParameters(
      opportunity,
      vixValue,
      atr,
      baseStopLoss,
      baseTarget
    )

    reasons.push(`📊 Parameters adapted: Stop ${adaptedParams.originalStopLoss} → ${adaptedParams.adaptedStopLoss}, Target ${adaptedParams.originalTarget} → ${adaptedParams.adaptedTarget}`)
    reasons.push(`   Rationale: ${adaptedParams.rationale}`)

    // ──────────────────────────────────────────────────────────────
    // STEP 4: CHECK SCALE THRESHOLDS
    // ──────────────────────────────────────────────────────────────
    const scaleConfig = this.scaleDetector.getScaleConfig(this.accountEquity, basePositionSize, baseTarget)
    const scaleCheck = this.scaleDetector.shouldTakeTrade(
      this.accountEquity,
      opportunity.mlScore,
      scaleConfig.tradeQualityThreshold,
      this.openPositions.length,
      scaleConfig.maxOpenPositions
    )

    if (!scaleCheck.allowed) {
      reasons.push(`⚠️ Scale check failed: ${scaleCheck.reason}`)
      return {
        shouldTrade: false,
        config: this.buildConfig(regime, regimeConfig, scaleConfig, basePositionSize),
        reasons
      }
    }
    reasons.push(`✓ Scale approved: Account size ${this.accountEquity}, ML score ${opportunity.mlScore.toFixed(2)} meets threshold`)

    // ──────────────────────────────────────────────────────────────
    // STEP 5: CHECK MULTI-PRODUCT COMPATIBILITY
    // ──────────────────────────────────────────────────────────────
    const allowedProducts = this.multiProduct.selectProductForCurrentConditions(
      regime,
      vixValue,
      this.accountEquity
    )

    reasons.push(`🎯 Allowed products: ${allowedProducts.join(', ')}`)

    // ──────────────────────────────────────────────────────────────
    // FINAL DECISION
    // ──────────────────────────────────────────────────────────────
    const shouldTrade = true // All checks passed
    const finalConfig = this.buildFinalConfig(
      regime,
      regimeConfig,
      scaleConfig,
      adaptedParams,
      basePositionSize,
      allowedProducts
    )

    reasons.push(`\n✅ TRADE APPROVED`)
    reasons.push(`   Position size: $${finalConfig.regimeAdjustedPositionSize}`)
    reasons.push(`   Stop loss: $${finalConfig.adaptedStopLoss}`)
    reasons.push(`   Profit target: $${finalConfig.adaptedTarget}`)
    reasons.push(`   Risk/Reward: ${(finalConfig.adaptedTarget / finalConfig.adaptedStopLoss).toFixed(2)}:1`)

    return {
      shouldTrade,
      config: finalConfig,
      reasons
    }
  }

  /**
   * ESTIMATE AVERAGE TRUE RANGE
   */
  private estimateATR(opportunity: TradeOpportunity): number {
    // In production, would calculate from real price data
    // For now, estimate based on IV
    return opportunity.impliedVol * 0.5 // Simplified
  }

  /**
   * BUILD FINAL CONFIGURATION
   */
  private buildFinalConfig(
    regime: MarketRegime,
    regimeConfig: any,
    scaleConfig: any,
    adaptedParams: any,
    baseSize: number,
    allowedProducts: ProductType[]
  ): EnhancedTradingConfig {
    const allocation = this.multiProduct.getAllocationMatrix(this.accountEquity)

    return {
      regime,
      regimeAdjustedPositionSize: regimeConfig.positionSize,
      regimeAdjustedTarget: regimeConfig.targetProfit,
      regimeAdjustedStop: regimeConfig.stopLoss,
      correlationApproved: true,
      correlationWarnings: [],
      adaptedStopLoss: adaptedParams.adaptedStopLoss,
      adaptedTarget: adaptedParams.adaptedTarget,
      volatilityAdjustment: adaptedParams.volatilityAdjustment,
      tradesPerDayTarget: scaleConfig.tradesPerDay,
      mlScoreThreshold: scaleConfig.tradeQualityThreshold,
      maxOpenPositions: scaleConfig.maxOpenPositions,
      allowedProducts,
      productAllocation: allocation
    }
  }

  /**
   * HELPER
   */
  private buildConfig(
    regime: MarketRegime,
    regimeConfig: any,
    scaleConfig: any,
    baseSize: number
  ): EnhancedTradingConfig {
    return {
      regime,
      regimeAdjustedPositionSize: regimeConfig?.positionSize || baseSize,
      regimeAdjustedTarget: regimeConfig?.targetProfit || 150,
      regimeAdjustedStop: regimeConfig?.stopLoss || 100,
      correlationApproved: false,
      correlationWarnings: [],
      adaptedStopLoss: 100,
      adaptedTarget: 150,
      volatilityAdjustment: 1.0,
      tradesPerDayTarget: scaleConfig?.tradesPerDay || 8,
      mlScoreThreshold: scaleConfig?.tradeQualityThreshold || 0.60,
      maxOpenPositions: scaleConfig?.maxOpenPositions || 4,
      allowedProducts: [ProductType.SPX_OPTIONS],
      productAllocation: {
        [ProductType.SPX_OPTIONS]: 1.0,
        [ProductType.SPY_SPREADS]: 0,
        [ProductType.TLT_BONDS]: 0,
        [ProductType.MICRO_FUTURES]: 0,
        [ProductType.STRADDLES]: 0
      }
    }
  }

  /**
   * UPDATE ACCOUNT EQUITY (for scale detection)
   */
  updateAccountEquity(newEquity: number): void {
    this.accountEquity = newEquity
  }

  /**
   * UPDATE OPEN POSITIONS (for correlation check)
   */
  updateOpenPositions(positions: Position[]): void {
    this.openPositions = positions
  }

  /**
   * GET SYSTEM STATUS
   */
  getSystemStatus(): string {
    const regime = this.regimeDetector.getCurrentRegime()
    const scaleConfig = this.scaleDetector.getScaleConfig(this.accountEquity, 750, 150)

    let status = '╔════════════════════════════════════════════════════════════════╗\n'
    status += '║           ENHANCED AOIX-1 UNIFIED ENGINE STATUS                 ║\n'
    status += '╚════════════════════════════════════════════════════════════════╝\n\n'

    status += `Account Equity: $${this.accountEquity.toLocaleString()}\n`
    status += `Market Regime: ${this.regimeDetector.getRegimeName()}\n`
    status += `Open Positions: ${this.openPositions.length}\n\n`

    status += `Strategy Settings:\n`
    status += `  Trades/day: ${scaleConfig.tradesPerDay}\n`
    status += `  ML threshold: ${scaleConfig.tradeQualityThreshold.toFixed(2)}\n`
    status += `  Max positions: ${scaleConfig.maxOpenPositions}\n`
    status += `  Strategy type: ${scaleConfig.strategy}\n\n`

    status += `Enhancements Active:\n`
    status += `  ✓ Regime detection\n`
    status += `  ✓ Correlation filtering\n`
    status += `  ✓ Parameter adaptation\n`
    status += `  ✓ Scale detection\n`
    status += `  ✓ Multi-product support\n`

    return status
  }
}
