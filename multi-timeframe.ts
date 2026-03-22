/**
 * Multi-Timeframe Analysis — IBKR only. Uses IB for price; trend from IB historical or 0.
 */

import { getRealTrend } from './real-market-data';

export interface TimeframeAnalysis {
  timeframe: '1d' | '5d' | '20d' | '60d';
  trend: number; // % change
  momentum: number; // Momentum score 0-1
  volatility: number;
  support: number | null;
  resistance: number | null;
  signal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  confidence: number; // 0-1
}

export interface MultiTimeframeSignal {
  symbol: string;
  overallSignal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  overallConfidence: number;
  timeframes: TimeframeAnalysis[];
  alignment: number; // How aligned are the timeframes (0-1)
  bestEntryTime: Date | null;
  priceTargets: {
    short: number; // 5-day target
    medium: number; // 20-day target
    long: number; // 60-day target
  };
  stopLoss: number;
}

/**
 * Analyze symbol across multiple timeframes
 */
export async function analyzeMultiTimeframe(symbol: string): Promise<MultiTimeframeSignal | null> {
  try {
    const { checkIBGatewayConnection } = await import('./ib-orders');
    const { getIBMarketData } = await import('./ib-market-data');
    if (!(await checkIBGatewayConnection())) return null;
    const ibData = await getIBMarketData(symbol);
    const price = ibData?.price;
    if (!price || price <= 0) return null;

    // Analyze different timeframes
    const tf1d = await analyzeTimeframe(symbol, 1, price);
    const tf5d = await analyzeTimeframe(symbol, 5, price);
    const tf20d = await analyzeTimeframe(symbol, 20, price);
    const tf60d = await analyzeTimeframe(symbol, 60, price);

    const timeframes = [tf1d, tf5d, tf20d, tf60d].filter(tf => tf !== null) as TimeframeAnalysis[];

    if (timeframes.length === 0) return null;

    // Calculate alignment (how many timeframes agree)
    const alignment = calculateAlignment(timeframes);

    // Determine overall signal
    const overallSignal = determineOverallSignal(timeframes, alignment);
    const overallConfidence = calculateOverallConfidence(timeframes, alignment);

    // Calculate price targets
    const priceTargets = calculatePriceTargets(timeframes, price);

    // Calculate stop loss
    const stopLoss = calculateStopLoss(timeframes, price);

    // Determine best entry time
    const bestEntryTime = determineBestEntryTime(timeframes);

    return {
      symbol,
      overallSignal,
      overallConfidence,
      timeframes,
      alignment,
      bestEntryTime,
      priceTargets,
      stopLoss,
    };
  } catch (error) {
    console.error(`[MultiTimeframe] Error analyzing ${symbol}:`, error);
    return null;
  }
}

/**
 * Analyze a specific timeframe
 */
async function analyzeTimeframe(
  symbol: string,
  days: number,
  currentPrice: number
): Promise<TimeframeAnalysis | null> {
  try {
    const trend = await getRealTrend(symbol, days);
    
    // Calculate momentum (rate of change)
    const momentum = Math.min(1, Math.abs(trend) / 20); // Normalize to 0-1
    
    // Estimate volatility (would use real volatility data)
    const volatility = Math.abs(trend) / days;
    
    // Estimate support/resistance (simplified - would use real price levels)
    const support = currentPrice * (1 - Math.abs(trend) / 100 * 0.5);
    const resistance = currentPrice * (1 + Math.abs(trend) / 100 * 0.5);
    
    // Determine signal
    let signal: TimeframeAnalysis['signal'] = 'neutral';
    let confidence = 0.5;
    
    if (trend > 5) {
      signal = 'strong_buy';
      confidence = Math.min(1, trend / 15);
    } else if (trend > 2) {
      signal = 'buy';
      confidence = Math.min(0.8, trend / 10);
    } else if (trend < -5) {
      signal = 'strong_sell';
      confidence = Math.min(1, Math.abs(trend) / 15);
    } else if (trend < -2) {
      signal = 'sell';
      confidence = Math.min(0.8, Math.abs(trend) / 10);
    }
    
    return {
      timeframe: days === 1 ? '1d' : days === 5 ? '5d' : days === 20 ? '20d' : '60d',
      trend,
      momentum,
      volatility,
      support,
      resistance,
      signal,
      confidence,
    };
  } catch (error) {
    console.error(`[MultiTimeframe] Error analyzing ${days}d timeframe for ${symbol}:`, error);
    return null;
  }
}

/**
 * Calculate how aligned the timeframes are
 */
function calculateAlignment(timeframes: TimeframeAnalysis[]): number {
  if (timeframes.length < 2) return 0.5;

  const signals = timeframes.map(tf => {
    if (tf.signal.includes('buy')) return 1;
    if (tf.signal.includes('sell')) return -1;
    return 0;
  });

  // Count how many agree
  const buyCount = signals.filter(s => s === 1).length;
  const sellCount = signals.filter(s => s === -1).length;
  const neutralCount = signals.filter(s => s === 0).length;

  // Alignment is highest when all agree
  const maxAgreement = Math.max(buyCount, sellCount, neutralCount);
  return maxAgreement / timeframes.length;
}

/**
 * Determine overall signal from multiple timeframes
 */
function determineOverallSignal(
  timeframes: TimeframeAnalysis[],
  alignment: number
): MultiTimeframeSignal['overallSignal'] {
  // Weight longer timeframes more
  const weights: Record<string, number> = {
    '1d': 0.1,
    '5d': 0.2,
    '20d': 0.3,
    '60d': 0.4,
  };

  let buyScore = 0;
  let sellScore = 0;

  for (const tf of timeframes) {
    const weight = weights[tf.timeframe] || 0.25;
    if (tf.signal.includes('buy')) {
      buyScore += weight * tf.confidence;
    } else if (tf.signal.includes('sell')) {
      sellScore += weight * tf.confidence;
    }
  }

  // Require high alignment for strong signals
  if (alignment > 0.7) {
    if (buyScore > sellScore * 1.5) return 'strong_buy';
    if (sellScore > buyScore * 1.5) return 'strong_sell';
  }

  if (buyScore > sellScore * 1.2) return 'buy';
  if (sellScore > buyScore * 1.2) return 'sell';
  return 'neutral';
}

/**
 * Calculate overall confidence
 */
function calculateOverallConfidence(
  timeframes: TimeframeAnalysis[],
  alignment: number
): number {
  const avgConfidence = timeframes.reduce((sum, tf) => sum + tf.confidence, 0) / timeframes.length;
  
  // Boost confidence when timeframes align
  return Math.min(1, avgConfidence * (0.7 + alignment * 0.3));
}

/**
 * Calculate price targets based on timeframes
 */
function calculatePriceTargets(
  timeframes: TimeframeAnalysis[],
  currentPrice: number
): MultiTimeframeSignal['priceTargets'] {
  const tf5d = timeframes.find(tf => tf.timeframe === '5d');
  const tf20d = timeframes.find(tf => tf.timeframe === '20d');
  const tf60d = timeframes.find(tf => tf.timeframe === '60d');

  const short = tf5d ? currentPrice * (1 + tf5d.trend / 100) : currentPrice;
  const medium = tf20d ? currentPrice * (1 + tf20d.trend / 100) : currentPrice;
  const long = tf60d ? currentPrice * (1 + tf60d.trend / 100) : currentPrice;

  return { short, medium, long };
}

/**
 * Calculate stop loss level
 */
function calculateStopLoss(
  timeframes: TimeframeAnalysis[],
  currentPrice: number
): number {
  // Use support levels from timeframes
  const supports = timeframes
    .map(tf => tf.support)
    .filter(s => s !== null && s < currentPrice) as number[];

  if (supports.length > 0) {
    // Use lowest support as stop loss
    return Math.min(...supports);
  }

  // Default: 5% below current price
  return currentPrice * 0.95;
}

/**
 * Determine best entry time
 */
function determineBestEntryTime(timeframes: TimeframeAnalysis[]): Date | null {
  // If short-term is bullish and aligning with longer-term, enter now
  const shortTerm = timeframes.find(tf => tf.timeframe === '1d' || tf.timeframe === '5d');
  const longTerm = timeframes.find(tf => tf.timeframe === '20d' || tf.timeframe === '60d');

  if (shortTerm && longTerm) {
    const bothBullish = shortTerm.signal.includes('buy') && longTerm.signal.includes('buy');
    const bothBearish = shortTerm.signal.includes('sell') && longTerm.signal.includes('sell');

    if (bothBullish || bothBearish) {
      return new Date(); // Enter now
    }
  }

  // Otherwise, wait for better alignment
  return null;
}
