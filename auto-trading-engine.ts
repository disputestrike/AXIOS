/**
 * AOIX-1 Autonomous Trading Engine
 * 
 * IB only.
 * - All market data from IB Gateway
 * - Auto-scan every 30 seconds
 * - Auto-execute trades on top opportunities
 * - Auto-take-profit at +30%
 * - Auto-stop-loss at -20%
 * - Auto-trailing-stop at 10% after +15% gain
 * - Max 3 positions, 1% risk per trade, 5% daily loss limit
 */

import { getMarketScanner, type MarketOpportunity } from './market-scanner';
import { getRealOptionsData, type RealMarketData, type RealOptionsData } from './real-market-data';
import { generateAdvancedSignal } from './advanced-signals';
import { calculateOptimalPositionSize, calculatePortfolioAwareSize, getConfidenceMultiplier } from './position-sizing';
import { analyzeMultiTimeframe } from './multi-timeframe';
import { calculateAdaptiveRisk, calculatePerformanceMetrics, determineMarketConditions, getRegimeRiskMultiplier, getRegimePositionSizeMultiplier } from './adaptive-risk';
import { getAggressionTier } from './aggression-tier';
import { getExitParams, isRegimeFavorableForStrategy, isStructurePreferredForStrategy } from './strategy-types';
import type { StrategyType } from './strategy-types';
import { determineExitStrategy } from './dynamic-exits';
import { calculatePortfolioCorrelation, getOptionDelta, getRealVIX, getOptionGreeks } from './market-utils';
import { computeEntryProbability, shouldEnterByProbability, ENTRY_PROBABILITY_THRESHOLD } from './ml-entry-probability';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface Position {
  id: string;
  symbol: string;
  optionType: 'call' | 'put';
  strike: number;
  expiry: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  entryTime: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  regime: string;
  signalClass: string;
  takeProfitPrice: number;
  stopLossPrice: number;
  trailingStopPrice: number | null;
  highWaterMark: number;
  status: 'open' | 'closed';
  exitReason?: string;
  exitPrice?: number;
  exitTime?: number;
  realizedPnL?: number;
  dataSource: string;
}

export interface Trade {
  id: string;
  positionId: string;
  action: 'open' | 'close';
  symbol: string;
  optionType: 'call' | 'put';
  strike: number;
  expiry: string;
  quantity: number;
  price: number;
  timestamp: number;
  regime: string;
  signalClass: string;
  reason: string;
  dataSource: string;
}

export interface TradingState {
  isRunning: boolean;
  accountBalance: number;
  totalEquity: number;
  dayPnL: number;
  totalPnL: number;
  positions: Position[];
  trades: Trade[];
  currentRegime: string;
  lastScanTime: number;
  lastOpportunities: MarketOpportunity[];
  riskMetrics: RiskMetrics;
  lastUpdate: number;
  cycleCount: number;
  autoTradeLog: string[];
  signalQueue: MarketOpportunity[];
  /** Aggression tier 1–5: more aggressive as system proves itself */
  aggressionTier?: number;
  /** Named strategy: wheel | short_term | iron_condor | adaptive */
  strategyType?: string;
  /** Regime risk overlay rationale for logging */
  regimeRationale?: string;
}

export interface RiskMetrics {
  maxRiskPerTrade: number;
  currentExposure: number;
  dailyLossLimit: number;
  currentDailyLoss: number;
  ruinProbability: number;
  killSwitchActive: boolean;
  positionCount: number;
  maxPositions: number;
}

// ============================================================================
// TRADING ENGINE CLASS
// ============================================================================

class AutoTradingEngine {
  private state: TradingState;
  private intervalId: NodeJS.Timeout | null = null;
  
  // Configuration
  private readonly INITIAL_BALANCE = 100000; // $100k paper trading account
  private readonly MAX_RISK_PER_TRADE = 0.01; // 1% max risk per trade
  private readonly TAKE_PROFIT_PERCENT = 0.30; // +30% take profit
  private readonly STOP_LOSS_PERCENT = 0.20; // -20% stop loss
  private readonly MOMENTUM_GLIDE_THRESHOLD = 0.15; // Start trailing at +15%
  private readonly TRAILING_STOP_PERCENT = 0.10; // 10% trailing stop
  private readonly DAILY_LOSS_LIMIT = 0.05; // 5% daily loss limit
  private readonly RUIN_PROBABILITY_THRESHOLD = 0.10; // 10% ruin probability kill switch
  private readonly MAX_POSITIONS = 3; // Max concurrent positions
  private readonly CHECK_INTERVAL_MS = 30000; // Check every 30 seconds
  private readonly MIN_SCORE_THRESHOLD = 70; // Minimum opportunity score to trade (relaxed from 85)
  private readonly MIN_WIN_PROBABILITY = 0.55; // Minimum win probability (relaxed from 60%)
  private readonly MIN_REGIME_CONFIDENCE = 0.55; // Regime/signal confidence (relaxed from 85%)
  
  // Advanced features - will be calculated dynamically
  private adaptiveRiskMultiplier: number = 1.0;
  private adaptiveMaxPositions: number = 3;
  private adaptiveMinScore: number = 70;

  constructor() {
    this.state = this.initializeState();
    this.log('Engine initialized with REAL IBKR-only data integration');
  }

  private initializeState(): TradingState {
    return {
      isRunning: false,
      accountBalance: this.INITIAL_BALANCE,
      totalEquity: this.INITIAL_BALANCE,
      dayPnL: 0,
      totalPnL: 0,
      positions: [],
      trades: [],
      currentRegime: 'unknown',
      lastScanTime: 0,
      lastOpportunities: [],
      riskMetrics: {
        maxRiskPerTrade: this.INITIAL_BALANCE * this.MAX_RISK_PER_TRADE,
        currentExposure: 0,
        dailyLossLimit: this.INITIAL_BALANCE * this.DAILY_LOSS_LIMIT,
        currentDailyLoss: 0,
        ruinProbability: 0,
        killSwitchActive: false,
        positionCount: 0,
        maxPositions: this.MAX_POSITIONS,
      },
      lastUpdate: Date.now(),
      cycleCount: 0,
      autoTradeLog: [],
      signalQueue: [],
      aggressionTier: 1,
      strategyType: 'adaptive',
    };
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    console.log(`[AutoTrading] ${message}`);
    this.state.autoTradeLog.push(logEntry);
    // Keep only last 100 log entries
    if (this.state.autoTradeLog.length > 100) {
      this.state.autoTradeLog = this.state.autoTradeLog.slice(-100);
    }
  }

  // ============================================================================
  // ENGINE CONTROL
  // ============================================================================

  public start(): void {
    if (this.state.isRunning) {
      this.log('Engine already running');
      return;
    }

    this.log('🚀 STARTING AUTONOMOUS TRADING ENGINE');
    this.log('Configuration:');
    this.log(`  - Max Risk Per Trade: ${this.MAX_RISK_PER_TRADE * 100}%`);
    this.log(`  - Take Profit: +${this.TAKE_PROFIT_PERCENT * 100}%`);
    this.log(`  - Stop Loss: -${this.STOP_LOSS_PERCENT * 100}%`);
    this.log(`  - Trailing Stop: ${this.TRAILING_STOP_PERCENT * 100}% after +${this.MOMENTUM_GLIDE_THRESHOLD * 100}%`);
    this.log(`  - Max Positions: ${this.MAX_POSITIONS}`);
    this.log(`  - Min Score: ${this.MIN_SCORE_THRESHOLD}`);
    this.log(`  - Scan Interval: ${this.CHECK_INTERVAL_MS / 1000}s`);
    
    this.state.isRunning = true;
    
    // Run immediately, then on interval
    this.runTradingCycle();
    this.intervalId = setInterval(() => this.runTradingCycle(), this.CHECK_INTERVAL_MS);
    
    this.log('Engine started - autonomous trading active');
  }

  public stop(): void {
    if (!this.state.isRunning) {
      this.log('Engine not running');
      return;
    }

    this.log('⏹️ STOPPING AUTONOMOUS TRADING ENGINE');
    this.state.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.log('Engine stopped - positions remain open');
  }

  public getState(): TradingState {
    return { ...this.state };
  }

  public resetAccount(): void {
    this.stop();
    this.state = this.initializeState();
    this.log('Account reset to initial state');
  }

  // ============================================================================
  // MAIN TRADING CYCLE
  // ============================================================================

  private async runTradingCycle(): Promise<void> {
    this.state.cycleCount++;
    const cycleNum = this.state.cycleCount;
    
    try {
      this.log(`━━━ CYCLE #${cycleNum} START ━━━`);
      
      // 1. Check kill switch
      if (this.state.riskMetrics.killSwitchActive) {
        this.log('⛔ Kill switch active - skipping cycle');
        return;
      }

      // 2. Scan market for REAL opportunities (10/10: retry up to 2 times on transient failure)
      this.log('📡 Scanning market with IBKR...');
      const scanner = getMarketScanner();
      const maxScanRetries = 2;
      let opportunities: MarketOpportunity[] = [];
      let lastScanError: Error | null = null;
      for (let attempt = 0; attempt <= maxScanRetries; attempt++) {
        try {
          opportunities = await scanner.scan();
          lastScanError = null;
          break;
        } catch (err) {
          lastScanError = err instanceof Error ? err : new Error(String(err));
          this.log(`⚠️ Scan attempt ${attempt + 1}/${maxScanRetries + 1} failed: ${lastScanError.message}`);
          if (attempt < maxScanRetries) await new Promise(r => setTimeout(r, 2000));
        }
      }
      if (lastScanError) {
        this.log(`❌ Scan failed after ${maxScanRetries + 1} attempts: ${lastScanError.message}`);
        return;
      }

      this.state.lastScanTime = Date.now();
      this.state.lastOpportunities = opportunities;
      
      this.log(`Found ${opportunities.length} opportunities from REAL market data`);
      
      // 3. Update regime from top opportunity (single source of truth — same as Regime dashboard)
      const currentRegime = opportunities.length > 0 ? opportunities[0].regime : 'unknown';
      const leadSignalConfidence = opportunities.length > 0 ? (opportunities[0].signal?.confidence ?? 0) : 0;
      this.state.currentRegime = currentRegime;
      this.log(`   Regime: ${currentRegime} | Lead confidence: ${(leadSignalConfidence * 100).toFixed(1)}%`);
      
      // 4. Update existing positions with REAL prices
      await this.updatePositions();
      
      // 5. Performance from CLOSED positions (realized P&L) — own the metrics
      const closedPositionsForPerf = this.state.positions.filter(
        p => p.status === 'closed' && p.realizedPnL !== undefined
      );
      const performance = calculatePerformanceMetrics(
        closedPositionsForPerf.map(p => ({
          pnl: p.realizedPnL ?? 0,
          pnlPercent: p.entryPrice ? ((p.realizedPnL ?? 0) / (p.entryPrice * p.quantity * 100)) : 0,
          entryTime: p.entryTime,
          exitTime: p.exitTime ?? p.entryTime,
          status: 'closed' as const,
        })),
        this.state.totalEquity,
        this.INITIAL_BALANCE
      );

      // Fetch real VIX for market conditions
      let realVIX = 20; // Default fallback
      try {
        realVIX = await getRealVIX();
      } catch (error) {
        this.log(`⚠️ Failed to fetch VIX, using default: ${error}`);
      }
      const marketTrend = opportunities.length > 0 ? opportunities[0].priceChangePercent : 0;

      const marketConditions = determineMarketConditions(
        realVIX, // REAL VIX
        marketTrend,
        this.state.positions.filter(p => p.status === 'open').map(p => ({ symbol: p.symbol }))
      );

      const riskAdjustment = calculateAdaptiveRisk(performance, marketConditions);
      const closedCount = closedPositionsForPerf.length;
      const aggression = getAggressionTier(performance, closedCount);
      this.state.aggressionTier = aggression.tier;
      let riskMultiplierWithAggression = riskAdjustment.riskMultiplier * aggression.riskMultiplier;
      let maxPositionsWithAggression = Math.min(
        this.MAX_POSITIONS + 2,
        riskAdjustment.maxPositions + aggression.maxPositionBonus
      );
      let minScoreWithAggression = Math.max(65, riskAdjustment.minScoreThreshold - aggression.minScoreReduction);

      // 6. Regime overlay — OWN THE REGIME (bear = tighter, bull + high conf = no extra cut)
      const regimeOverlay = getRegimeRiskMultiplier(currentRegime, leadSignalConfidence);
      riskMultiplierWithAggression *= regimeOverlay.riskMultiplier;
      maxPositionsWithAggression = Math.max(1, maxPositionsWithAggression + regimeOverlay.maxPositionAdjustment);
      this.adaptiveRiskMultiplier = riskMultiplierWithAggression;
      this.adaptiveMaxPositions = maxPositionsWithAggression;
      this.adaptiveMinScore = minScoreWithAggression;
      this.log(`📊 Risk: ${(riskMultiplierWithAggression * 100).toFixed(0)}% risk, ${maxPositionsWithAggression} max pos, min score ${minScoreWithAggression} | Aggression tier ${aggression.tier} (${aggression.rationale})`);
      this.log(`   Adaptive: ${riskAdjustment.rationale} | Regime: ${regimeOverlay.rationale}`);
      this.state.regimeRationale = regimeOverlay.rationale;
      
      // 7. Tradable opportunities: regime confidence + strategy–regime alignment (optimize everything)
      const strategyType = (this.state.strategyType || 'adaptive') as StrategyType;
      const oneStop = process.env.TRADE_ONE_STOP === '1';
      if (oneStop) {
        maxPositionsWithAggression = 1;
        this.adaptiveMaxPositions = 1;
      }
      // Correlation drag: pass existing positions so ranking downweights highly correlated new opportunities
      const openPositionsForRanking = this.state.positions.filter(p => p.status === 'open');
      const existingPositionsForRanking: { symbol: string; delta?: number }[] = openPositionsForRanking.length > 0
        ? await Promise.all(openPositionsForRanking.map(async (p) => {
            try {
              const greeks = await getOptionGreeks(p.symbol, p.strike, p.expiry, p.optionType);
              return { symbol: p.symbol, delta: greeks?.delta };
            } catch {
              return { symbol: p.symbol };
            }
          }))
        : [];
      // IBKR only
      let tradableOpportunities = oneStop
        ? (() => { const o = scanner.getHighestExplosiveSetup({ minWinProbability: 55, minScore: 50, existingPositions: existingPositionsForRanking }); return o ? [o] : []; })()
        : opportunities
            .filter(opp => opp.opportunity.score >= this.adaptiveMinScore)
            .filter(opp => opp.opportunity.winProbability >= this.MIN_WIN_PROBABILITY)
            .filter(opp => opp.dataSource === 'ibkr')
            .filter(opp => (opp.signal?.confidence ?? 0) >= this.MIN_REGIME_CONFIDENCE)
            .sort((a, b) => (a.dataSource === 'ibkr' && b.dataSource !== 'ibkr' ? -1 : b.dataSource === 'ibkr' && a.dataSource !== 'ibkr' ? 1 : 0));
      if (!oneStop && strategyType !== 'adaptive') {
        tradableOpportunities = tradableOpportunities
          .filter(opp => isStructurePreferredForStrategy(strategyType, opp.structure?.type ?? ''))
          .sort((a, b) => {
            const aFav = isRegimeFavorableForStrategy(strategyType, a.regime) ? 1 : 0;
            const bFav = isRegimeFavorableForStrategy(strategyType, b.regime) ? 1 : 0;
            return bFav - aFav; // Favorable first
          });
      }
      if (!oneStop) tradableOpportunities = tradableOpportunities.slice(0, 5);

      const ibkrCount = tradableOpportunities.filter(o => o.dataSource === 'ibkr').length;
      if (ibkrCount > 0) {
        this.log(`Using IBKR data for ${ibkrCount} of ${tradableOpportunities.length} tradable opportunities`);
      }

      const effectiveRisk = oneStop ? { ...riskAdjustment, maxPositions: 1 } : riskAdjustment;
      if (oneStop && tradableOpportunities.length > 0) {
        this.log(`One stop: trading only highest explosive setup — ${tradableOpportunities[0].symbol} (win ${((tradableOpportunities[0].opportunity?.winProbability ?? 0) * 100).toFixed(0)}%, score ${tradableOpportunities[0].opportunity?.score ?? 0})`);
      }
(Content truncated due to size limit. Use line ranges to read remaining content)