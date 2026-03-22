/**
 * META ORCHESTRATOR
 * 
 * Filters out weak trades, selects only the BEST trades
 * This prevents overtrading and ensures quality selection
 */

interface SelectedTrade {
  symbol: string
  strike: number
  expiry: string
  type: 'C' | 'P'
  score: number
  rank: number
}

/**
 * Select only the best strategies (top N)
 * - Filter by score threshold
 * - Sort by score
 * - Limit to top N trades
 */
export function selectBestStrategies(
  trades: any[],
  options: { threshold?: number; limit?: number } = {}
): SelectedTrade[] {
  const threshold = options.threshold ?? 70 // min score
  const limit = options.limit ?? 10 // max trades

  // Filter: only trades above threshold
  const qualified = trades.filter(t => t.valid && t.score > threshold)

  // Sort: highest score first
  const sorted = qualified.sort((a, b) => b.score - a.score)

  // Limit: take top N
  const selected = sorted.slice(0, limit)

  // Rank
  const ranked: SelectedTrade[] = selected.map((t, idx) => ({
    ...t,
    rank: idx + 1
  }))

  console.log(
    `[ORCHESTRATOR] Selected ${ranked.length} / ${trades.length} trades ` +
    `(threshold: ${threshold}, limit: ${limit})`
  )

  // Log selection details
  ranked.forEach(t => {
    console.log(
      `[ORCHESTRATOR] Rank ${t.rank}: ${t.symbol} ${t.strike} ${t.type} (score: ${t.score.toFixed(0)})`
    )
  })

  return ranked
}

/**
 * Diversify selection (don't trade same symbol multiple times)
 */
export function diversifySelection(trades: SelectedTrade[]): SelectedTrade[] {
  const seen = new Set<string>()
  const diversified: SelectedTrade[] = []

  for (const trade of trades) {
    if (!seen.has(trade.symbol)) {
      diversified.push(trade)
      seen.add(trade.symbol)
    }
  }

  console.log(`[ORCHESTRATOR] Diversified: ${diversified.length} / ${trades.length} trades`)

  return diversified
}

/**
 * Analyze strategy mix
 */
export function analyzeStrategyMix(trades: SelectedTrade[]) {
  const calls = trades.filter(t => t.type === 'C').length
  const puts = trades.filter(t => t.type === 'P').length

  console.log(
    `[ORCHESTRATOR] Strategy Mix: ${calls} Calls, ${puts} Puts`
  )

  return { calls, puts }
}
