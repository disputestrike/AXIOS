/**
 * Dynamic Exit Strategies
 * Adapts exit rules based on market conditions, position performance, and time decay
 */

export interface ExitDecision {
  action: 'hold' | 'take_profit' | 'stop_loss' | 'trailing_stop' | 'time_stop' | 'regime_exit';
  exitPrice: number;
  reason: string;
  urgency: 'low' | 'medium' | 'high';
  confidence: number; // 0-1
}

export interface PositionContext {
  symbol: string;
  entryPrice: number;
  currentPrice: number;
  entryTime: number;
  currentTime: number;
  takeProfitPrice: number;
  stopLossPrice: number;
  trailingStopPrice: number | null;
  highWaterMark: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  optionType: 'call' | 'put';
  daysToExpiry: number;
  regime: string;
  signalClass: string;
  volatility: number;
  volume: number;
  avgVolume: number;
}

export interface MarketContext {
  vix: number;
  marketTrend: number;
  regime: string;
  timeOfDay: 'pre_market' | 'market_open' | 'mid_day' | 'market_close' | 'after_hours';
}

/**
 * Determine optimal exit strategy
 */
export function determineExitStrategy(
  position: PositionContext,
  market: MarketContext,
  performance: {
    winRate: number;
    profitFactor: number;
    recentPerformance: number;
  }
): ExitDecision {
  const timeHeld = (position.currentTime - position.entryTime) / (1000 * 60 * 60 * 24); // Days
  const timeDecayFactor = position.daysToExpiry > 0 ? timeHeld / position.daysToExpiry : 1;
  
  // 1. Check stop loss (highest priority)
  if (position.currentPrice <= position.stopLossPrice) {
    return {
      action: 'stop_loss',
      exitPrice: position.stopLossPrice,
      reason: `Stop loss triggered at ${position.stopLossPrice.toFixed(2)}`,
      urgency: 'high',
      confidence: 1.0,
    };
  }
  
  // 2. Check take profit
  if (position.currentPrice >= position.takeProfitPrice) {
    return {
      action: 'take_profit',
      exitPrice: position.takeProfitPrice,
      reason: `Take profit reached at ${position.takeProfitPrice.toFixed(2)}`,
      urgency: 'medium',
      confidence: 0.9,
    };
  }
  
  // 3. Dynamic take profit (adjust based on performance and market)
  const dynamicTakeProfit = calculateDynamicTakeProfit(position, market, performance);
  if (position.currentPrice >= dynamicTakeProfit.price) {
    return {
      action: 'take_profit',
      exitPrice: dynamicTakeProfit.price,
      reason: dynamicTakeProfit.reason,
      urgency: dynamicTakeProfit.urgency,
      confidence: dynamicTakeProfit.confidence,
    };
  }
  
  // 4. Trailing stop
  if (position.trailingStopPrice && position.currentPrice <= position.trailingStopPrice) {
    return {
      action: 'trailing_stop',
      exitPrice: position.trailingStopPrice,
      reason: `Trailing stop triggered at ${position.trailingStopPrice.toFixed(2)}`,
      urgency: 'high',
      confidence: 0.95,
    };
  }
  
  // 5. Update trailing stop if profit threshold reached
  const newTrailingStop = calculateTrailingStop(position, market);
  if (newTrailingStop) {
    return {
      action: 'trailing_stop',
      exitPrice: newTrailingStop.price,
      reason: newTrailingStop.reason,
      urgency: 'medium',
      confidence: 0.8,
    };
  }
  
  // 6. Time-based exit (close before expiry if profitable)
  if (position.daysToExpiry < 3 && position.unrealizedPnLPercent > 0.1) {
    return {
      action: 'time_stop',
      exitPrice: position.currentPrice,
      reason: `Closing ${position.daysToExpiry.toFixed(1)} days before expiry to avoid time decay`,
      urgency: 'medium',
      confidence: 0.85,
    };
  }
  
  // 7. Regime change exit
  if (position.regime !== market.regime && position.unrealizedPnLPercent > 0.05) {
    return {
      action: 'regime_exit',
      exitPrice: position.currentPrice,
      reason: `Regime changed from ${position.regime} to ${market.regime}, taking profits`,
      urgency: 'medium',
      confidence: 0.75,
    };
  }
  
  // 8. Volatility crush exit — only for long volatility positions (straddles/strangles). Short premium wants vol crush.
  if (position.volatility < 0.15 && position.unrealizedPnLPercent > 0.15 && timeHeld > 3) {
    return {
      action: 'take_profit',
      exitPrice: position.currentPrice,
      reason: `Volatility crush detected (IV: ${(position.volatility * 100).toFixed(1)}%), taking profits on long vol`,
      urgency: 'medium',
      confidence: 0.8,
    };
  }
  
  // 9. Profit protection (lock in gains in volatile markets)
  if (market.vix > 30 && position.unrealizedPnLPercent > 0.20) {
    return {
      action: 'take_profit',
      exitPrice: position.currentPrice,
      reason: `High volatility (VIX: ${market.vix.toFixed(1)}), locking in ${(position.unrealizedPnLPercent * 100).toFixed(1)}% gain`,
      urgency: 'medium',
      confidence: 0.85,
    };
  }
  
  // 10. Hold
  return {
    action: 'hold',
    exitPrice: position.currentPrice,
    reason: `Holding: ${(position.unrealizedPnLPercent * 100).toFixed(1)}% P&L, ${position.daysToExpiry.toFixed(1)} days to expiry`,
    urgency: 'low',
    confidence: 0.5,
  };
}

/**
 * Calculate dynamic take profit based on market conditions
 */
function calculateDynamicTakeProfit(
  position: PositionContext,
  market: MarketContext,
  performance: { winRate: number; profitFactor: number; recentPerformance: number }
): { price: number; reason: string; urgency: 'low' | 'medium' | 'high'; confidence: number } {
  let takeProfitMultiplier = 1.0;
  const reasons: string[] = [];
  
  // Adjust based on performance
  if (performance.winRate < 0.5 || performance.profitFactor < 1.2) {
    // Lower win rate: Take profits earlier
    takeProfitMultiplier = 0.8;
    reasons.push('Lower win rate: Taking profits earlier');
  } else if (performance.winRate > 0.65 && performance.profitFactor > 1.8) {
    // High win rate: Let winners run
    takeProfitMultiplier = 1.2;
    reasons.push('High win rate: Letting winners run');
  }
  
  // Adjust based on volatility
  if (market.vix > 30) {
    // High volatility: Take profits earlier
    takeProfitMultiplier *= 0.85;
    reasons.push('High volatility: Taking profits earlier');
  } else if (market.vix < 15) {
    // Low volatility: Let winners run
    takeProfitMultiplier *= 1.1;
    reasons.push('Low volatility: Letting winners run');
  }
  
  // Adjust based on time decay
  const timeDecayFactor = position.daysToExpiry / 30; // Normalize to 30 days
  if (timeDecayFactor < 0.3) {
    // Close to expiry: Take profits earlier
    takeProfitMultiplier *= 0.9;
    reasons.push('Close to expiry: Taking profits earlier');
  }
  
  const baseTakeProfit = position.entryPrice * 1.30; // 30% base
  const dynamicTakeProfit = position.entryPrice + (baseTakeProfit - position.entryPrice) * takeProfitMultiplier;
  
  return {
    price: dynamicTakeProfit,
    reason: reasons.join(' | ') || 'Standard take profit',
    urgency: 'medium',
    confidence: 0.8,
  };
}

/**
 * Calculate trailing stop level
 */
function calculateTrailingStop(
  position: PositionContext,
  market: MarketContext
): { price: number; reason: string } | null {
  // Only activate trailing stop after profit threshold
  const profitThreshold = 0.15; // 15% profit
  
  if (position.unrealizedPnLPercent < profitThreshold) {
    return null; // Not enough profit yet
  }
  
  // Update high water mark
  const highWaterMark = Math.max(position.highWaterMark, position.currentPrice);
  
  // Calculate trailing stop distance based on volatility
  let trailingPercent = 0.10; // Base 10%
  
  if (market.vix > 30) {
    // High volatility: Wider trailing stop
    trailingPercent = 0.15;
  } else if (market.vix < 15) {
    // Low volatility: Tighter trailing stop
    trailingPercent = 0.08;
  }
  
  // Tighter trailing stop for high profits
  if (position.unrealizedPnLPercent > 0.30) {
    trailingPercent *= 0.8; // Tighter stop for big winners
  }
  
  const trailingStopPrice = highWaterMark * (1 - trailingPercent);
  
  // Only update if it's higher than current trailing stop
  if (!position.trailingStopPrice || trailingStopPrice > position.trailingStopPrice) {
    return {
      price: trailingStopPrice,
      reason: `Trailing stop updated to ${trailingStopPrice.toFixed(2)} (${(trailingPercent * 100).toFixed(1)}% below high of ${highWaterMark.toFixed(2)})`,
    };
  }
  
  return null;
}

/**
 * Calculate optimal exit time based on time decay
 */
export function calculateOptimalExitTime(
  position: PositionContext,
  market: MarketContext
): Date | null {
  // Close long options before heavy time decay (last 5 days)
  if (position.daysToExpiry < 5 && position.unrealizedPnLPercent > 0.05) {
    return new Date(position.currentTime + 24 * 60 * 60 * 1000); // Exit within 24 hours
  }
  
  // Close if profitable and time decay accelerating (last 10 days)
  if (position.daysToExpiry < 10 && position.unrealizedPnLPercent > 0.15) {
    return new Date(position.currentTime + 3 * 24 * 60 * 60 * 1000); // Exit within 3 days
  }
  
  return null; // No time-based exit needed
}
