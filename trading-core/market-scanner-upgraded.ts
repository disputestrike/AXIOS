/**
 * UPGRADED MARKET SCANNER
 * 
 * Improvements:
 * - Parallel async scanning (faster)
 * - Deeper strike coverage (±15%)
 * - Smart liquidity filtering
 * - Opportunity ranking with urgency/confidence
 */

import { Trade, ScoredTrade } from './types'

interface OpportunityScanMetrics {
  scanStartTime: number
  scanEndTime: number
  totalOptionsChecked: number
  optionsFiltered: number
  optionsPassed: number
  topOpportunities: ScoredTrade[]
  scanDurationMs: number
}

const TRADING_SYMBOLS = [
  'SPY', 'QQQ', 'IWM', 'AAPL', 'MSFT', 'NVDA', 'TSLA',
  'AMZN', 'META', 'GOOGL', 'AMD', 'MU', 'NFLX',
  'BA', 'GS', 'JPM', 'TLT', 'GLD'
]

/**
 * UPGRADE 1: Expanded strike coverage
 */
function generateStrikes(atm: number, includeMonthly: boolean = true): number[] {
  const strikes: number[] = []

  // ATM ±15% coverage (instead of ±10%)
  const lowerBound = atm * 0.85
  const upperBound = atm * 1.15
  const increment = atm * 0.02 // 2% increments

  for (let strike = lowerBound; strike <= upperBound; strike += increment) {
    strikes.push(Math.round(strike * 100) / 100)
  }

  // Deduplicate
  return Array.from(new Set(strikes)).sort((a, b) => a - b)
}

/**
 * UPGRADE 2: Liquidity filter
 */
function passesLiquidityFilter(option: any): boolean {
  // Volume > 200 (increased from threshold)
  if (!option.volume || option.volume < 200) {
    return false
  }

  // Bid-Ask spread < 10% (not too wide)
  const spread = option.ask - option.bid
  const midPrice = (option.bid + option.ask) / 2
  const spreadPercent = (spread / midPrice) * 100

  if (spreadPercent > 10) {
    return false
  }

  // Open Interest > 500
  if (!option.openInterest || option.openInterest < 500) {
    return false
  }

  return true
}

/**
 * Scan a single symbol for opportunities
 */
async function scanSymbol(
  symbol: string,
  currentPrice: number
): Promise<Trade[]> {
  const strikes = generateStrikes(currentPrice, true)
  const opportunities: Trade[] = []

  // UPGRADE: Parallel requests (async Promise.all)
  const scanPromises = strikes.map(async (strike) => {
    try {
      // In real system: Fetch from IBKR
      // For now: Mock data
      const optionData = {
        symbol,
        strike,
        type: 'CALL', // Would alternate
        bid: currentPrice * 0.98,
        ask: currentPrice * 1.02,
        volume: Math.floor(Math.random() * 2000),
        openInterest: Math.floor(Math.random() * 3000),
        iv: 0.2 + Math.random() * 0.3,
        delta: 0.3 + Math.random() * 0.4,
        theta: -0.01 - Math.random() * 0.02,
        gamma: 0.01 + Math.random() * 0.02,
        vega: 0.1 + Math.random() * 0.15,
        expiryDaysToExpiration: 7,
      }

      // Apply liquidity filter
      if (!passesLiquidityFilter(optionData)) {
        return null
      }

      return {
        symbol,
        strike,
        ...optionData,
        entryPrice: optionData.bid,
        currentPrice: optionData.bid,
      }
    } catch (error) {
      console.error(`Error scanning ${symbol} ${strike}:`, error)
      return null
    }
  })

  // Wait for all requests to complete
  const results = await Promise.all(scanPromises)

  return results.filter((r) => r !== null) as Trade[]
}

/**
 * UPGRADE 3: Calculate opportunity urgency
 */
function calculateUrgency(option: Trade): number {
  // Urgency based on volatility change speed, theta decay, etc.
  // Higher urgency = faster decay, better risk/reward
  
  let urgency = 50 // Base 50

  // High IV = higher urgency (mean reversion play)
  if ((option.iv || 0.2) > 0.35) {
    urgency += 15
  }

  // Short expiry = higher urgency (theta accelerates)
  if ((option.expiryDaysToExpiration || 7) < 3) {
    urgency += 20
  }

  // High volume = easier to exit
  if ((option.volume || 0) > 1500) {
    urgency += 10
  }

  return Math.min(100, urgency)
}

/**
 * UPGRADE 4: Comprehensive opportunity ranking
 */
function rankOpportunities(
  opportunities: ScoredTrade[],
  vixLevel: number
): {
  score: number
  urgency: number
  confidence: number
  rankingScore: number
}[] {
  return opportunities
    .filter((opp) => (opp.score || 0) > 0)
    .map((opp) => {
      const urgency = calculateUrgency(opp as any)
      const confidence = opp.confidence || 50
      const baseScore = opp.score || 0

      // Ranking = Score × Urgency × Confidence
      // Normalize each to 0-100 range
      const rankingScore =
        (baseScore / 100) * (urgency / 100) * (confidence / 100) * 100

      return {
        score: baseScore,
        urgency,
        confidence,
        rankingScore,
      }
    })
    .sort((a, b) => b.rankingScore - a.rankingScore)
}

/**
 * Full market scan across all symbols
 */
export async function scanMarket(
  currentPrices: Map<string, number>,
  vixLevel: number = 20,
  maxOpportunities: number = 75
): Promise<OpportunityScanMetrics> {
  const scanStartTime = Date.now()

  // UPGRADE: Scan all symbols in parallel
  const symbolScanPromises = TRADING_SYMBOLS.map((symbol) => {
    const price = currentPrices.get(symbol) || 100
    return scanSymbol(symbol, price)
  })

  const allResults = await Promise.all(symbolScanPromises)
  const allOpportunities = allResults.flat()

  // Score and rank
  const scoredOpportunities = allOpportunities.map((opp) => ({
    ...opp,
    score: Math.floor(Math.random() * 50) + 50, // Mock scoring
    confidence: Math.floor(Math.random() * 100),
  })) as ScoredTrade[]

  const rankedOpportunities = rankOpportunities(scoredOpportunities, vixLevel)

  const topOpportunities = scoredOpportunities
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, maxOpportunities)

  const scanEndTime = Date.now()

  return {
    scanStartTime,
    scanEndTime,
    totalOptionsChecked: allOpportunities.length,
    optionsFiltered: allOpportunities.filter((o) => !passesLiquidityFilter(o)).length,
    optionsPassed: allOpportunities.filter((o) => passesLiquidityFilter(o)).length,
    topOpportunities,
    scanDurationMs: scanEndTime - scanStartTime,
  }
}

/**
 * Get scan metrics
 */
export function getLastScanMetrics(metrics: OpportunityScanMetrics) {
  return {
    durationMs: metrics.scanDurationMs,
    totalChecked: metrics.totalOptionsChecked,
    filtered: metrics.optionsFiltered,
    passed: metrics.optionsPassed,
    topCount: metrics.topOpportunities.length,
    successRate: (
      (metrics.optionsPassed / metrics.totalOptionsChecked) *
      100
    ).toFixed(2),
  }
}

export default {
  scanMarket,
  getLastScanMetrics,
  scanSymbol,
  generateStrikes,
  passesLiquidityFilter,
}
