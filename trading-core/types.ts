/**
 * AOIX-1 Trading System Type Definitions
 */

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
  delta?: number;
  ivRank?: number;
  volume?: number;
  openInterest?: number;
  bid?: number;
  ask?: number;
  greeksQuality?: number;
  momentum?: number;
}

export interface ScoredTrade extends Trade {
  score: number;
  confidence: number;
  recommendation: 'BUY' | 'HOLD' | 'SELL';
}

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
  returnOnRisk: number;
}

export interface RiskState {
  dailyLossLimit: number;
  dailyLoss: number;
  positionsOpen: number;
  maxPositions: number;
  killSwitchActive: boolean;
  killSwitchReason?: string;
}

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
}

export interface LearningState {
  tradesBySymbol: Map<string, any>;
  weightAdjustments: number;
  totalFeedback: number;
  successRate: number;
  lastUpdate: number;
}

export interface Account {
  accountId: string;
  netLiquidation: number;
  totalCashValue: number;
  buyingPower: number;
  currency: string;
  equity: number;
}

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
