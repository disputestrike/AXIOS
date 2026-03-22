/**
 * Adaptive Risk Management
 * Dynamically adjusts risk parameters based on recent performance and market conditions
 */

export interface RiskAdjustment {
  riskMultiplier: number; // 0-1, multiplies base risk
  maxPositions: number;
  minScoreThreshold: number; // Minimum opportunity score to trade
  takeProfitMultiplier: number; // Adjusts take profit %
  stopLossMultiplier: number; // Adjusts stop loss %
  rationale: string;
}

export interface PerformanceMetrics {
  winRate: number; // 0-1
  profitFactor: number; // Gross profit / Gross loss
  sharpeRatio: number;
  maxDrawdown: number; // 0-1
  currentDrawdown: number; // 0-1
  consecutiveLosses: number;
  consecutiveWins: number;
  avgWinSize: number;
  avgLossSize: number;
  recentPerformance: number; // P&L over last N trades
}

export interface MarketConditions {
  vix: number;
  marketTrend: 'strong_up' | 'up' | 'neutral' | 'down' | 'strong_down';
  volatilityRegime: 'low' | 'normal' | 'high' | 'extreme';
  correlation: number; // Average correlation of positions
}

/**
 * Calculate adaptive risk adjustments
 */
export function calculateAdaptiveRisk(
  performance: PerformanceMetrics,
  marketConditions: MarketConditions,
  baseRisk: number = 0.01,
  baseMaxPositions: number = 3
): RiskAdjustment {
  let riskMultiplier = 1.0;
  let maxPositions = baseMaxPositions;
  let minScoreThreshold = 85;
  let takeProfitMultiplier = 1.0;
  let stopLossMultiplier = 1.0;
  const rationale: string[] = [];

  // Performance-based adjustments
  if (performance.currentDrawdown > 0.10) {
    // 10%+ drawdown: Aggressive risk reduction
    riskMultiplier *= 0.3;
    maxPositions = 1;
    minScoreThreshold = 95;
    rationale.push(`Aggressive risk reduction: ${(performance.currentDrawdown * 100).toFixed(1)}% drawdown`);
  } else if (performance.currentDrawdown > 0.05) {
    // 5-10% drawdown: Moderate risk reduction
    riskMultiplier *= 0.5;
    maxPositions = Math.max(1, Math.floor(baseMaxPositions * 0.5));
    minScoreThreshold = 90;
    rationale.push(`Moderate risk reduction: ${(performance.currentDrawdown * 100).toFixed(1)}% drawdown`);
  } else if (performance.currentDrawdown > 0.02) {
    // 2-5% drawdown: Slight risk reduction
    riskMultiplier *= 0.75;
    maxPositions = Math.max(1, Math.floor(baseMaxPositions * 0.75));
    minScoreThreshold = 88;
    rationale.push(`Slight risk reduction: ${(performance.currentDrawdown * 100).toFixed(1)}% drawdown`);
  }

  // Consecutive losses: Reduce risk
  if (performance.consecutiveLosses >= 5) {
    riskMultiplier *= 0.4;
    maxPositions = 1;
    minScoreThreshold = 95;
    rationale.push(`Consecutive losses: ${performance.consecutiveLosses} in a row`);
  } else if (performance.consecutiveLosses >= 3) {
    riskMultiplier *= 0.6;
    maxPositions = Math.max(1, Math.floor(baseMaxPositions * 0.67));
    minScoreThreshold = 90;
    rationale.push(`Consecutive losses: ${performance.consecutiveLosses} in a row`);
  }

  // Consecutive wins: Slight increase (but be careful)
  if (performance.consecutiveWins >= 5 && performance.currentDrawdown < 0.02) {
    riskMultiplier *= 1.1; // Small increase only
    rationale.push(`Hot streak: ${performance.consecutiveWins} wins, slight increase`);
  }

  // Win rate adjustments
  if (performance.winRate < 0.45) {
    // Low win rate: Reduce risk significantly
    riskMultiplier *= 0.5;
    minScoreThreshold = 92;
    rationale.push(`Low win rate: ${(performance.winRate * 100).toFixed(1)}%`);
  } else if (performance.winRate > 0.65 && performance.profitFactor > 1.5) {
    // High win rate with good profit factor: Slight increase
    riskMultiplier *= 1.05;
    rationale.push(`Strong performance: ${(performance.winRate * 100).toFixed(1)}% win rate, ${performance.profitFactor.toFixed(2)} profit factor`);
  }

  // Profit factor adjustments
  if (performance.profitFactor < 1.0) {
    // Losing money: Aggressive reduction
    riskMultiplier *= 0.4;
    maxPositions = 1;
    minScoreThreshold = 95;
    rationale.push(`Negative profit factor: ${performance.profitFactor.toFixed(2)}`);
  }

  // Market condition adjustments
  if (marketConditions.volatilityRegime === 'extreme') {
    riskMultiplier *= 0.5;
    stopLossMultiplier *= 0.8; // Tighter stops in extreme vol
    rationale.push(`Extreme volatility: VIX ${marketConditions.vix.toFixed(1)}`);
  } else if (marketConditions.volatilityRegime === 'high') {
    riskMultiplier *= 0.7;
    stopLossMultiplier *= 0.9;
    rationale.push(`High volatility: VIX ${marketConditions.vix.toFixed(1)}`);
  }

  // Market trend adjustments
  if (marketConditions.marketTrend === 'strong_down') {
    riskMultiplier *= 0.6;
    maxPositions = Math.max(1, Math.floor(baseMaxPositions * 0.67));
    rationale.push(`Strong downtrend: Reduce exposure`);
  } else if (marketConditions.marketTrend === 'strong_up') {
    // Slight increase in strong uptrends (but be careful)
    if (performance.currentDrawdown < 0.02) {
      riskMultiplier *= 1.05;
      rationale.push(`Strong uptrend: Slight increase`);
    }
  }

  // Correlation adjustments
  if (marketConditions.correlation > 0.8) {
    // High correlation: Reduce size to avoid concentration
    riskMultiplier *= 0.7;
    rationale.push(`High correlation: ${(marketConditions.correlation * 100).toFixed(1)}%`);
  }

  // Sharpe ratio adjustments
  if (performance.sharpeRatio < 0.5) {
    // Poor risk-adjusted returns: Reduce risk
    riskMultiplier *= 0.7;
    rationale.push(`Low Sharpe ratio: ${performance.sharpeRatio.toFixed(2)}`);
  } else if (performance.sharpeRatio > 2.0 && performance.currentDrawdown < 0.02) {
    // Excellent risk-adjusted returns: Slight increase
    riskMultiplier *= 1.05;
    rationale.push(`High Sharpe ratio: ${performance.sharpeRatio.toFixed(2)}`);
  }

  // Ensure minimums
  riskMultiplier = Math.max(0.1, Math.min(1.2, riskMultiplier)); // Cap at 20% increase
  maxPositions = Math.max(1, Math.min(baseMaxPositions * 2, maxPositions));
  minScoreThreshold = Math.max(80, Math.min(98, minScoreThreshold));

  return {
    riskMultiplier,
    maxPositions,
    minScoreThreshold,
    takeProfitMultiplier,
    stopLossMultiplier,
    rationale: rationale.length > 0 ? rationale.join(' | ') : 'No adjustments needed',
  };
}

/**
 * Calculate performance metrics from trade history
 */
export function calculatePerformanceMetrics(
  trades: Array<{
    pnl: number;
    pnlPercent: number;
    entryTime: number;
    exitTime?: number;
    status: 'open' | 'closed';
  }>,
  currentEquity: number,
  initialEquity: number
): PerformanceMetrics {
  const closedTrades = trades.filter(t => t.status === 'closed' && t.exitTime);
  
  if (closedTrades.length === 0) {
    return {
      winRate: 0.5,
      profitFactor: 1.0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
      consecutiveLosses: 0,
      consecutiveWins: 0,
      avgWinSize: 0,
      avgLossSize: 0,
      recentPerformance: 0,
    };
  }

  const wins = closedTrades.filter(t => t.pnl > 0);
  const losses = closedTrades.filter(t => t.pnl < 0);
  
  const winRate = closedTrades.length > 0 ? wins.length / closedTrades.length : 0.5;
  
  const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 10 : 1.0;
  
  const avgWinSize = wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnlPercent, 0) / wins.length : 0;
  const avgLossSize = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + t.pnlPercent, 0) / losses.length) : 0;
  
  // Calculate consecutive wins/losses (from most recent)
  let consecutiveWins = 0;
  let consecutiveLosses = 0;
  for (let i = closedTrades.length - 1; i >= 0; i--) {
    if (closedTrades[i].pnl > 0) {
      if (consecutiveLosses > 0) break;
      consecutiveWins++;
    } else {
      if (consecutiveWins > 0) break;
      consecutiveLosses++;
    }
  }
  
  // Calculate drawdown
  const peakEquity = Math.max(...trades.map(t => currentEquity - (t.pnl || 0)));
  const maxDrawdown = peakEquity > 0 ? (peakEquity - currentEquity) / peakEquity : 0;
  const currentDrawdown = initialEquity > 0 ? (initialEquity - currentEquity) / initialEquity : 0;
  
  // Calculate Sharpe ratio (simplified)
  const returns = closedTrades.map(t => t.pnlPercent);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;
  
  // Recent performance (last 10 trades)
  const recentTrades = closedTrades.slice(-10);
  const recentPerformance = recentTrades.reduce((sum, t) => sum + t.pnl, 0);
  
  return {
    winRate,
    profitFactor,
    sharpeRatio,
    maxDrawdown,
    currentDrawdown,
    consecutiveLosses,
    consecutiveWins,
    avgWinSize,
    avgLossSize,
    recentPerformance,
  };
}

/**
 * Determine market conditions
 */
export function determineMarketConditions(
  vix: number,
  marketTrend: number, // % change
  positions: Array<{ symbol: string }>
): MarketConditions {
  let volatilityRegime: MarketConditions['volatilityRegime'] = 'normal';
  if (vix > 35) volatilityRegime = 'extreme';
  else if (vix > 25) volatilityRegime = 'high';
  else if (vix < 15) volatilityRegime = 'low';
  
  let marketTrendCategory: MarketConditions['marketTrend'] = 'neutral';
  if (marketTrend > 5) marketTrendCategory = 'strong_up';
  else if (marketTrend > 2) marketTrendCategory = 'up';
  else if (marketTrend < -5) marketTrendCategory = 'strong_down';
  else if (marketTrend < -2) marketTrendCategory = 'down';
  
  // Calculate average correlation (will be calculated by caller with real data)
  // Default to 0 if no positions, caller should provide real correlation
  const correlation = positions.length > 1 ? 0.5 : 0; // Default estimate, caller should override
  
  return {
    vix,
    marketTrend: marketTrendCategory,
    volatilityRegime,
    correlation,
  };
}

/**
 * Regime-based risk adjustment — OWN THE REGIME.
 * Bear vol = tighten risk. Bull with high confidence = no extra tightening.
 * Used by engine after adaptive risk + aggression so regime is the final overlay.
 */
export function getRegimeRiskMultiplier(
  regime: string,
  leadSignalConfidence: number
): { riskMultiplier: number; maxPositionAdjustment: number; rationale: string } {
  const conf = leadSignalConfidence;
  const lowConf = conf < 0.80;
  const highConf = conf >= 0.90;

  // Crisis: minimal risk
  if (regime === 'crisis') {
    return { riskMultiplier: 0.25, maxPositionAdjustment: -2, rationale: 'Crisis — risk ×0.25' };
  }

  // Liquidity drought: reduce size, fewer positions
  if (regime === 'liquidity_drought') {
    return { riskMultiplier: 0.5, maxPositionAdjustment: -1, rationale: 'Liquidity drought — risk ×0.5' };
  }

  // Bear regimes: reduce risk (vol expansion + down = dangerous)
  if (regime === 'bear_vol_expansion' || regime === 'trending_bear') {
    const mult = highConf ? 0.75 : lowConf ? 0.5 : 0.65;
    return { riskMultiplier: mult, maxPositionAdjustment: -1, rationale: `Bear / trending bear — risk ×${mult}` };
  }
  if (regime === 'bear_vol_compression') {
    const mult = highConf ? 0.85 : lowConf ? 0.6 : 0.75;
    return { riskMultiplier: mult, maxPositionAdjustment: 0, rationale: `Bear vol compression — risk ×${mult}` };
  }

  // Chaotic / mean_reverting / sector_rotation: slight reduction unless high confidence
  if (regime === 'mean_reverting' || regime === 'chaotic' || regime === 'sector_rotation') {
    const mult = highConf ? 1.0 : lowConf ? 0.7 : 0.85;
    return { riskMultiplier: mult, maxPositionAdjustment: highConf ? 0 : -1, rationale: `Regime ${regime} — risk ×${mult}` };
  }

  // Bull regimes + trending_bull: no reduction; only tighten if low confidence
  if (regime === 'bull_vol_expansion' || regime === 'bull_vol_compression' || regime === 'trending_bull') {
    const mult = lowConf ? 0.8 : 1.0;
    return { riskMultiplier: mult, maxPositionAdjustment: 0, rationale: `Bull / trending bull, conf ${(conf * 100).toFixed(0)}% — risk ×${mult}` };
  }

  return { riskMultiplier: 1.0, maxPositionAdjustment: 0, rationale: 'Regime unknown — no overlay' };
}

/**
 * Regime-based position size multiplier (hedge fund style).
 * Low vol = larger size; crash = minimal size. Use in position sizing: baseSize * multiplier.
 */
export function getRegimePositionSizeMultiplier(regime: string): {
  multiplier: number;
  rationale: string;
} {
  const r = (regime || '').toLowerCase();
  if (r === 'crisis') {
    return { multiplier: 0.15, rationale: 'Crisis — 15% position size' };
  }
  if (r === 'liquidity_drought') {
    return { multiplier: 0.4, rationale: 'Liquidity drought — 40% position size' };
  }
  if (r.includes('bear_vol_expansion') || r === 'chaotic' || r === 'trending_bear') {
    return { multiplier: 0.25, rationale: 'Crash/chaotic/trending bear — 25% position size' };
  }
  if (r.includes('bear_vol_compression') || (r.includes('bear') && !r.includes('trending'))) {
    return { multiplier: 0.5, rationale: 'Bear regime — 50% position size' };
  }
  if (r === 'mean_reverting' || r === 'sector_rotation') {
    return { multiplier: 0.8, rationale: 'Mean reverting / sector rotation — 80% position size' };
  }
  if (r.includes('bull_vol_expansion')) {
    return { multiplier: 1.0, rationale: 'Bull vol expansion — 100% position size' };
  }
  if (r.includes('trending_bull')) {
    return { multiplier: 1.2, rationale: 'Trending bull — 120% position size (conviction)' };
  }
  if (r.includes('bull_vol_compression') || r.includes('bull')) {
    return { multiplier: 1.5, rationale: 'Bull calm — 150% position size (hedge fund style)' };
  }
  return { multiplier: 1.0, rationale: 'Unknown regime — 100%' };
}
