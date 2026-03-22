/**
 * PORTFOLIO OPTIMIZER
 * 
 * Allocates capital intelligently:
 * - Risk-weighted sizing
 * - Kelly Criterion-inspired
 * - Max position limits
 * - Exposure controls
 */

interface AllocatedTrade {
  symbol: string
  strike: number
  expiry: string
  type: 'C' | 'P'
  score: number
  allocation: number // dollars to risk
  size: number // contract count
  riskPercentage: number
}

/**
 * Allocate capital across trades
 */
export function allocateCapital(
  trades: any[],
  equity: number,
  options: any = {}
): AllocatedTrade[] {
  const maxRiskPerTrade = options.maxRiskPerTrade ?? equity * 0.01 // 1% per trade
  const maxExposure = options.maxExposure ?? equity * 0.3 // 30% total
  const minAllocation = options.minAllocation ?? 100 // minimum $100

  let remainingExposure = maxExposure
  const allocations: AllocatedTrade[] = []

  // Sort by score (best first)
  const sorted = [...trades].sort((a, b) => b.score - a.score)

  for (const trade of sorted) {
    if (remainingExposure <= 0) break

    // Calculate allocation
    const riskAmount = Math.min(maxRiskPerTrade, remainingExposure)

    if (riskAmount < minAllocation) break

    // Estimate contracts
    const contractValue = (trade.bid + trade.ask) / 2
    const contracts = Math.floor(riskAmount / contractValue)

    if (contracts < 1) continue

    const allocation = contracts * contractValue
    const riskPercentage = (allocation / equity) * 100

    allocations.push({
      ...trade,
      allocation,
      size: contracts,
      riskPercentage
    })

    remainingExposure -= allocation
  }

  console.log(
    `[ALLOCATOR] Allocated ${allocations.length} positions ` +
    `(total risk: $${allocations.reduce((s, a) => s + a.allocation, 0).toFixed(0)}, ` +
    `${((maxExposure - remainingExposure) / equity * 100).toFixed(1)}% of equity)`
  )

  allocations.forEach(a => {
    console.log(
      `[ALLOCATOR] ${a.symbol} ${a.strike} ${a.type}: ` +
      `${a.size} contracts, $${a.allocation.toFixed(0)}, ${a.riskPercentage.toFixed(2)}% risk`
    )
  })

  return allocations
}

/**
 * Validate total exposure
 */
export function validateExposure(trades: AllocatedTrade[], equity: number) {
  const totalExposure = trades.reduce((sum, t) => sum + t.allocation, 0)
  const exposureRatio = totalExposure / equity

  if (exposureRatio > 0.5) {
    console.warn(`[ALLOCATOR] WARNING: High exposure ${(exposureRatio * 100).toFixed(1)}%`)
  }

  return { totalExposure, exposureRatio }
}

/**
 * Rebalance allocation based on Sharpe ratio (advanced)
 */
export function rebalanceByMetrics(trades: AllocatedTrade[], metrics: any) {
  // If Sharpe < 1, reduce position size
  if (metrics.sharpe < 1) {
    return trades.map(t => ({
      ...t,
      allocation: t.allocation * 0.7,
      size: Math.floor(t.size * 0.7)
    }))
  }

  // If Sharpe > 2, allow slight increase
  if (metrics.sharpe > 2) {
    return trades.map(t => ({
      ...t,
      allocation: t.allocation * 1.1,
      size: Math.floor(t.size * 1.1)
    }))
  }

  return trades
}
