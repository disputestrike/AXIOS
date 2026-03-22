/**
 * Advanced Signal Generation with Machine Learning Patterns
 * Implements sophisticated pattern recognition and adaptive signal weighting
 */

import { getRealTrend, type RealMarketData } from './real-market-data';

export interface AdvancedSignal {
  signalId: string;
  symbol: string;
  signalType: 'momentum_breakout' | 'mean_reversion' | 'volatility_expansion' | 'gamma_squeeze' | 'flow_anomaly' | 'regime_shift';
  signalClass: 'A' | 'B' | 'C' | 'D';
  confidenceScore: number; // 0-1
  expectedMove: number; // Expected price move %
  expectedTimeframe: number; // Days
  riskRewardRatio: number;
  winProbability: number;
  patternStrength: number; // 0-1, how strong the pattern is
  historicalAccuracy: number; // Historical win rate for this pattern
  marketConditions: {
    volatility: 'low' | 'medium' | 'high';
    trend: 'strong_up' | 'weak_up' | 'neutral' | 'weak_down' | 'strong_down';
    volume: 'low' | 'normal' | 'high' | 'extreme';
    regime: string;
  };
  entryCriteria: {
    price: number;
    timeWindow: string; // Best time to enter
    confirmationNeeded: boolean;
  };
  exitCriteria: {
    takeProfit: number;
    stopLoss: number;
    timeStop: number; // Max holding period
  };
  metadata: Record<string, any>;
}

interface HistoricalPattern {
  pattern: string;
  occurrences: number;
  wins: number;
  avgReturn: number;
  avgHoldingPeriod: number;
}

// Pattern recognition database (in production, this would be ML model)
const patternDatabase = new Map<string, HistoricalPattern>();

/**
 * Store pattern in database for learning
 */
export function storePattern(symbol: string, patternType: string, outcome: 'win' | 'loss', returnValue: number, holdingPeriod: number): void {
  const key = `${symbol}_${patternType}`;
  const existing = patternDatabase.get(key);
  
  if (existing) {
    // Update pattern with outcome
    existing.occurrences += 1;
    existing.wins += outcome === 'win' ? 1 : 0;
    existing.avgReturn = (existing.avgReturn * (existing.occurrences - 1) + returnValue) / existing.occurrences;
    existing.avgHoldingPeriod = (existing.avgHoldingPeriod * (existing.occurrences - 1) + holdingPeriod) / existing.occurrences;
    patternDatabase.set(key, existing);
  } else {
    // New pattern
    patternDatabase.set(key, {
      pattern: patternType,
      occurrences: 1,
      wins: outcome === 'win' ? 1 : 0,
      avgReturn: returnValue,
      avgHoldingPeriod: holdingPeriod,
    });
  }
}

/**
 * Get historical pattern performance
 */
export function getPatternPerformance(symbol: string, signalType: string): HistoricalPattern | null {
  const key = `${symbol}_${signalType}`;
  return patternDatabase.get(key) || null;
}

/**
 * Advanced signal generator with pattern recognition
 */
export async function generateAdvancedSignal(
  symbol: string,
  priceData: RealMarketData,
  optionsData: any,
  historicalData: any[]
): Promise<AdvancedSignal | null> {
  try {
    // Multi-timeframe analysis
    const shortTermTrend = await getRealTrend(symbol, 5);
    const mediumTermTrend = await getRealTrend(symbol, 20);
    const longTermTrend = await getRealTrend(symbol, 60);

    // Volume analysis
    const volumeRatio = priceData.avgVolume > 0 ? priceData.volume / priceData.avgVolume : 1;
    const volumeProfile = classifyVolume(volumeRatio);

    // Volatility analysis
    const iv = optionsData?.impliedVolatility || 0.25;
    const volatilityProfile = classifyVolatility(iv);

    // Pattern recognition
    const patterns = await detectPatterns(symbol, priceData, historicalData);
    
    // Find strongest pattern (handle empty patterns array)
    if (!patterns || patterns.length === 0) {
      // No patterns detected
      return null;
    }
    
    const bestPattern = patterns.reduce((best, p) => 
      p.patternStrength > best.patternStrength ? p : best
    );

    if (bestPattern.patternStrength < 0.6) {
      return null; // Pattern not strong enough
    }

    // Calculate confidence based on multiple factors
    const confidenceScore = calculateConfidence(
      bestPattern,
      shortTermTrend,
      mediumTermTrend,
      longTermTrend,
      volumeProfile,
      volatilityProfile
    );

    if (confidenceScore < 0.65) {
      return null; // Confidence too low
    }

    // Determine signal class based on confidence and pattern
    const signalClass = determineSignalClass(confidenceScore, bestPattern.signalType);

    // Calculate expected move based on historical patterns
    const expectedMove = calculateExpectedMove(bestPattern, iv, priceData.price);

    // Calculate risk/reward
    const riskRewardRatio = calculateRiskReward(bestPattern, expectedMove);

    // Win probability from historical data
    const winProbability = getHistoricalWinRate(bestPattern.signalType, symbol);

    return {
      signalId: `sig-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      symbol,
      signalType: bestPattern.signalType,
      signalClass,
      confidenceScore,
      expectedMove,
      expectedTimeframe: bestPattern.expectedTimeframe || 14,
      riskRewardRatio,
      winProbability,
      patternStrength: bestPattern.patternStrength,
      historicalAccuracy: winProbability,
      marketConditions: {
        volatility: volatilityProfile,
        trend: classifyTrend(shortTermTrend, mediumTermTrend, longTermTrend),
        volume: volumeProfile,
        regime: determineRegime(shortTermTrend, iv),
      },
      entryCriteria: {
        price: priceData.price,
        timeWindow: determineBestEntryTime(bestPattern),
        confirmationNeeded: confidenceScore < 0.75,
      },
      exitCriteria: {
        takeProfit: expectedMove * 0.8, // 80% of expected move
        stopLoss: expectedMove * 0.4, // 40% of expected move (risk/reward ~2:1)
        timeStop: bestPattern.expectedTimeframe || 14,
      },
      metadata: {
        shortTermTrend,
        mediumTermTrend,
        longTermTrend,
        iv,
        volumeRatio,
        pattern: bestPattern,
      },
    };
  } catch (error) {
    console.error(`[AdvancedSignals] Error generating signal for ${symbol}:`, error);
    return null;
  }
}

/**
 * Detect trading patterns using technical analysis
 */
async function detectPatterns(
  symbol: string,
  currentData: RealMarketData,
  historicalData: any[]
): Promise<Array<{ signalType: AdvancedSignal['signalType']; patternStrength: number; expectedTimeframe: number }>> {
  const patterns: Array<{ signalType: AdvancedSignal['signalType']; patternStrength: number; expectedTimeframe: number }> = [];

  // Momentum Breakout Pattern
  if (currentData.price > currentData.fiftyTwoWeekHigh * 0.95) {
    const strength = Math.min(1.0, (currentData.price / currentData.fiftyTwoWeekHigh) * 1.2);
    patterns.push({
      signalType: 'momentum_breakout',
      patternStrength: strength,
      expectedTimeframe: 7,
    });
  }

  // Mean Reversion Pattern
  if (currentData.price < currentData.fiftyTwoWeekLow * 1.05 && currentData.changePercent < -5) {
    const oversoldLevel = (currentData.price - currentData.fiftyTwoWeekLow) / 
                          (currentData.fiftyTwoWeekHigh - currentData.fiftyTwoWeekLow);
    if (oversoldLevel < 0.2) {
      patterns.push({
        signalType: 'mean_reversion',
        patternStrength: 1 - oversoldLevel,
        expectedTimeframe: 10,
      });
    }
  }

  // Volatility Expansion Pattern
  const iv = 0.25; // Would come from options data
  if (iv > 0.35 && currentData.volume > currentData.avgVolume * 1.5) {
    patterns.push({
      signalType: 'volatility_expansion',
      patternStrength: Math.min(1.0, (iv - 0.25) / 0.2),
      expectedTimeframe: 5,
    });
  }

  // Gamma Squeeze Pattern (simplified - would need options flow data)
  if (currentData.volume > currentData.avgVolume * 2 && currentData.changePercent > 3) {
    patterns.push({
      signalType: 'gamma_squeeze',
      patternStrength: Math.min(1.0, (currentData.volume / currentData.avgVolume) / 3),
      expectedTimeframe: 3,
    });
  }

  // Flow Anomaly Pattern
  if (currentData.volume > currentData.avgVolume * 1.8 && Math.abs(currentData.changePercent) > 2) {
    patterns.push({
      signalType: 'flow_anomaly',
      patternStrength: 0.7,
      expectedTimeframe: 7,
    });
  }

  // Regime Shift Pattern
  const trend = currentData.changePercent;
  if (Math.abs(trend) > 5 && currentData.volume > currentData.avgVolume * 1.5) {
    patterns.push({
      signalType: 'regime_shift',
      patternStrength: Math.min(1.0, Math.abs(trend) / 10),
      expectedTimeframe: 14,
    });
  }

  return patterns;
}

/**
 * Calculate confidence score from multiple factors
 */
function calculateConfidence(
  pattern: any,
  shortTerm: number,
  mediumTerm: number,
  longTerm: number,
  volume: string,
  volatility: string
): number {
  let confidence = pattern.patternStrength * 0.4; // Base from pattern

  // Trend alignment bonus
  const trendAlignment = calculateTrendAlignment(shortTerm, mediumTerm, longTerm);
  confidence += trendAlignment * 0.2;

  // Volume confirmation
  if (volume === 'high' || volume === 'extreme') {
    confidence += 0.15;
  } else if (volume === 'low') {
    confidence -= 0.1;
  }

  // Volatility confirmation
  if (volatility === 'medium' || volatility === 'high') {
    confidence += 0.1;
  }

  // Historical accuracy
  const historicalAcc = getHistoricalWinRate(pattern.signalType, '');
  confidence += historicalAcc * 0.15;

  return Math.min(1.0, Math.max(0, confidence));
}

function calculateTrendAlignment(short: number, medium: number, long: number): number {
  const signs = [Math.sign(short), Math.sign(medium), Math.sign(long)];
  const aligned = signs.filter(s => s === signs[0]).length;
  return aligned / 3; // 1.0 if all aligned, 0.33 if none aligned
}

function calculateExpectedMove(pattern: any, iv: number, price: number): number {
  // Base expected move from IV
  const ivMove = iv * price * Math.sqrt(pattern.expectedTimeframe / 365);
  
  // Adjust based on pattern type
  const multipliers: Record<string, number> = {
    momentum_breakout: 1.5,
    mean_reversion: 0.8,
    volatility_expansion: 1.8,
    gamma_squeeze: 2.0,
    flow_anomaly: 1.2,
    regime_shift: 1.5,
  };

  return (ivMove / price) * (multipliers[pattern.signalType] || 1.0) * 100; // Return as %
}

function calculateRiskReward(pattern: any, expectedMove: number): number {
  // Risk is typically 40% of expected move for good R:R
  const risk = expectedMove * 0.4;
  const reward = expectedMove * 0.8; // Take profit at 80% of expected move
  return reward / risk; // Should be ~2:1
}

function getHistoricalWinRate(signalType: string, symbol: string): number {
  // In production, this would query historical trades
  // For now, use default win rates based on signal type
  const defaultRates: Record<string, number> = {
    momentum_breakout: 0.58,
    mean_reversion: 0.62,
    volatility_expansion: 0.55,
    gamma_squeeze: 0.65,
    flow_anomaly: 0.60,
    regime_shift: 0.57,
  };
  return defaultRates[signalType] || 0.55;
}

function determineSignalClass(confidence: number, signalType: string): 'A' | 'B' | 'C' | 'D' {
  if (confidence >= 0.85 && (signalType === 'gamma_squeeze' || signalType === 'regime_shift')) {
    return 'A';
  }
  if (confidence >= 0.75) {
    return 'B';
  }
  if (confidence >= 0.65) {
    return 'C';
  }
  return 'D';
}

function classifyVolume(ratio: number): 'low' | 'normal' | 'high' | 'extreme' {
  if (ratio > 2.0) return 'extreme';
  if (ratio > 1.5) return 'high';
  if (ratio > 0.7) return 'normal';
  return 'low';
}

function classifyVolatility(iv: number): 'low' | 'medium' | 'high' {
  if (iv > 0.35) return 'high';
  if (iv > 0.20) return 'medium';
  return 'low';
}

function classifyTrend(short: number, medium: number, long: number): AdvancedSignal['marketConditions']['trend'] {
  const avg = (short + medium + long) / 3;
  if (avg > 5) return 'strong_up';
  if (avg > 2) return 'weak_up';
  if (avg < -5) return 'strong_down';
  if (avg < -2) return 'weak_down';
  return 'neutral';
}

function determineRegime(trend: number, iv: number): string {
  const isBull = trend > 0;
  const isVolExpanding = iv > 0.30;
  const isStrongMomentum = Math.abs(trend) > 0.05;

  if (iv > 0.45) return 'crisis';
  if (isStrongMomentum && isBull) return 'trending_bull';
  if (isStrongMomentum && !isBull) return 'trending_bear';
  if (isVolExpanding && isBull) return 'bull_vol_expansion';
  if (isVolExpanding && !isBull) return 'bear_vol_expansion';
  if (!isVolExpanding && isBull) return 'bull_vol_compression';
  if (!isVolExpanding && !isBull) return 'bear_vol_compression';
  return 'mean_reverting';
}

function determineBestEntryTime(pattern: any): string {
  // In production, analyze best entry times from historical data
  // For now, return market open for momentum, mid-day for mean reversion
  const timeMap: Record<string, string> = {
    momentum_breakout: 'market_open',
    mean_reversion: 'mid_day',
    volatility_expansion: 'market_open',
    gamma_squeeze: 'market_open',
    flow_anomaly: 'any_time',
    regime_shift: 'market_open',
  };
  return timeMap[pattern.signalType] || 'any_time';
}

/**
 * Update pattern database with trade results (for learning)
 */
export function updatePatternDatabase(
  signalType: string,
  symbol: string,
  won: boolean,
  returnPct: number,
  holdingPeriod: number
): void {
  const key = `${signalType}-${symbol}`;
  const existing = patternDatabase.get(key) || {
    pattern: signalType,
    occurrences: 0,
    wins: 0,
    avgReturn: 0,
    avgHoldingPeriod: 0,
  };

  existing.occurrences++;
  if (won) existing.wins++;
  existing.avgReturn = (existing.avgReturn * (existing.occurrences - 1) + returnPct) / existing.occurrences;
  existing.avgHoldingPeriod = (existing.avgHoldingPeriod * (existing.occurrences - 1) + holdingPeriod) / existing.occurrences;

  patternDatabase.set(key, existing);
}

/**
 * Get pattern statistics
 */
export function getPatternStats(signalType: string, symbol?: string): HistoricalPattern | null {
  const key = symbol ? `${signalType}-${symbol}` : signalType;
  return patternDatabase.get(key) || null;
}
