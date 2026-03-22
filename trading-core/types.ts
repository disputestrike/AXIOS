/**
 * AOIX-1 Trading System - COMPLETE TYPE DEFINITIONS
 */

// ============================================================================
// MARKET DATA TYPES
// ============================================================================

export interface MarketData {
  symbol: string;
  spot: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  impliedVol: number;
  timestamp: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  close: number;
  open?: number;  // For regime detection
}

export interface TradeOpportunity {
  symbol: string;
  type: 'CALL' | 'PUT';
  strike: number;
  expiry: string;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  delta: number;
  impliedVol: number;
  confidence: number;
  mlScore: number;
  momentum: number;
  flow: number;
  timeValue: number;
  theoPrice: number;
}

// ============================================================================
// POSITION & TRADE TYPES
// ============================================================================

export interface Position {
  symbol: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  timestamp: number;
}

export interface Trade {
  id: string;
  symbol: string;
  type: 'CALL' | 'PUT';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  entryTime: number;
  exitTime: number;
  duration: number;
  mlScore: number;
  deltaScore: number;
  ivScore: number;
  flowScore: number;
  momentumScore: number;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  // Extended properties for various modules
  delta?: number;
  ivRank?: number;
  volume?: number;
  openInterest?: number;
  bid?: number;
  ask?: number;
  greeksQuality?: number;
  momentum?: number;
  strike?: number;
  currentPrice?: number;
  iv?: number;
  expiryDaysToExpiration?: number;
  theta?: number;
  gamma?: number;
  vega?: number;
  positionSize?: number;
  slippage?: number;
  timeHeld?: number;
}

export interface ScoredTrade extends Trade {
  score: number;
  confidence: number;
  recommendation: 'BUY' | 'HOLD' | 'SELL';
  passesFilters?: boolean;
}

// ============================================================================
// BACKTESTING TYPES
// ============================================================================

export interface BacktestResult {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgWin?: number;
  avgLoss?: number;
  profitFactor: number;
  totalPnL: number;
  maxDrawdown: number;
  sharpe: number;
  equity?: number[];
}

export interface ExecutionResult {
  success?: boolean;
  orderId?: string;
  price?: number;
  quantity?: number;
  timestamp?: number;
  error?: string;
  message?: string;
  symbol?: string;
  strike?: number;
  expiry?: string;
  type?: string;
  filled?: boolean;
  filledPrice?: number;
  filledSize?: number;
  filledQuantity?: number;
  pnl?: number;
}

// ============================================================================
// PERFORMANCE METRICS
// ============================================================================

export interface PerformanceMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  totalPnL: number;
  maxDrawdown: number;
  sharpe: number;
  returnOnRisk?: number;
}

// ============================================================================
// ACCOUNT & RISK TYPES
// ============================================================================

export interface RiskState {
  dailyLossLimit: number;
  dailyLoss: number;
  positionsOpen: number;
  maxPositions: number;
  killSwitchActive: boolean;
  killSwitchReason?: string;
}

export interface Account {
  accountId: string;
  netLiquidation: number;
  totalCashValue: number;
  buyingPower: number;
  currency: string;
  equity?: number;
}

// ============================================================================
// ORDER TYPES
// ============================================================================

export interface Order {
  orderId: string;
  symbol: string;
  type: 'CALL' | 'PUT' | 'STOCK';
  action: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  limitPrice?: number;
  status: 'PENDING' | 'SUBMITTED' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  filledPrice?: number;
  filledQuantity?: number;
  filledTime?: number;
  timestamp: number;
  error?: string;
}

// ============================================================================
// LEARNING & OPTIMIZATION TYPES
// ============================================================================

export interface LearningState {
  tradesBySymbol: Map<string, any>;
  weightAdjustments: number;
  totalFeedback: number;
  successRate: number;
  lastUpdate: number;
}

// ============================================================================
// GATEWAY TYPES
// ============================================================================

export interface IBKRGatewayConfig {
  host?: string;
  port?: number;
  accountId?: string;
  token?: string;
}
