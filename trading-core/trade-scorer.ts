/**
 * TRADE SCORER
 * 
 * Scores trades based on:
 * - Greeks (Delta targeting)
 * - IV (Volatility levels)
 * - ML Probability
 * - Flow (Institutional activity)
 * - Momentum
 * 
 * Uses HARD FILTERS to reject bad trades
 * Uses ADAPTIVE WEIGHTS that improve over time
 */

interface ScoredTrade {
  symbol: string
  strike: number
  expiry: string
  type: 'C' | 'P'
  score: number
  expectedValue: number
  valid: boolean
  reasons?: string[]
}

// Adaptive weights - start neutral, adapt based on performance
let adaptiveWeights = {
  greeks: 0.25,
  iv: 0.20,
  ml: 0.30,
  flow: 0.15,
  momentum: 0.10
}

/**
 * Score all trades with hard filters + weighted scoring
 */
export function scoreTrades(trades: any[]): ScoredTrade[] {
  const scored: ScoredTrade[] = []

  for (const trade of trades) {
    const delta = Math.abs(trade.greeks?.delta || 0)
    const volume = trade.flow?.volume || 0
    const oi = trade.flow?.openInterest || 0
    const ivRank = trade.iv?.ivRank || 50
    const mlProb = trade.mlProb || 0.5
    const spread = (trade.ask - trade.bid) || 0.01

    const reasons: string[] = []

    // ===== HARD FILTERS (non-negotiable) =====
    // Filter 1: Delta must be in sweet spot (0.3-0.7)
    if (delta < 0.3 || delta > 0.7) {
      reasons.push(`Delta out of range: ${delta.toFixed(2)}`)
    }

    // Filter 2: Must have volume
    if (volume < 500) {
      reasons.push(`Low volume: ${volume}`)
    }

    // Filter 3: Must have open interest
    if (oi < 1000) {
      reasons.push(`Low OI: ${oi}`)
    }

    // Filter 4: Spread must be tight
    if (spread > 0.05) {
      reasons.push(`Wide spread: ${spread.toFixed(4)}`)
    }

    // Filter 5: ML must have confidence
    if (mlProb < 0.65) {
      reasons.push(`Low ML prob: ${mlProb.toFixed(2)}`)
    }

    const valid = reasons.length === 0

    // ===== SCORING (only if valid) =====
    let score = 0

    if (valid) {
      // Greeks score: reward targeting 0.5 delta
      const greeksScore = 1 - Math.abs(0.5 - delta)

      // IV score: reward moderate IV
      const ivScore = Math.min(ivRank / 100, 1.0)

      // ML score: direct from model
      const mlScore = mlProb

      // Flow score: reward high activity
      const flowScore = Math.min(volume / 10000, 1.0)

      // Momentum score: trend
      const momentumScore = 0.5 // placeholder

      // WEIGHTED SUM
      score =
        (greeksScore * adaptiveWeights.greeks +
          ivScore * adaptiveWeights.iv +
          mlScore * adaptiveWeights.ml +
          flowScore * adaptiveWeights.flow +
          momentumScore * adaptiveWeights.momentum) *
        100
    }

    // Calculate expected value
    const expectedValue = mlProb * (trade.ask * 0.7) - (1 - mlProb) * (trade.bid * 0.3)

    scored.push({
      ...trade,
      score,
      expectedValue,
      valid,
      reasons
    })
  }

  console.log(`[SCORER] Scored ${scored.length} trades, ${scored.filter(s => s.valid).length} passed filters`)

  return scored
}

/**
 * Adjust weights based on performance (adaptive learning)
 */
export function adjustWeights(performance: { winRate: number; profitFactor: number }) {
  console.log('[SCORER] Adjusting weights based on performance:', performance)

  // If we're winning > 60%, increase ML weight
  if (performance.winRate > 0.6) {
    adaptiveWeights.ml += 0.02
    adaptiveWeights.flow += 0.01
  }
  // If losing, increase Greeks + IV weight
  else {
    adaptiveWeights.greeks += 0.02
    adaptiveWeights.iv += 0.01
  }

  // Normalize weights
  const total = Object.values(adaptiveWeights).reduce((a, b) => a + b, 0)
  Object.keys(adaptiveWeights).forEach(key => {
    adaptiveWeights[key] /= total
  })

  console.log('[SCORER] New weights:', adaptiveWeights)
}

export function getWeights() {
  return adaptiveWeights
}
