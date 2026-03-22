/**
 * EXECUTION ENGINE
 * 
 * Executes trades with:
 * - Limit orders (not market)
 * - Retry logic
 * - Slippage control
 * - Fill tracking
 * - Error handling
 */

interface ExecutionResult {
  symbol: string
  strike: number
  expiry: string
  type: 'C' | 'P'
  filled: boolean
  filledPrice?: number
  filledSize?: number
  pnl?: number
  error?: string
}

/**
 * Smart execution with retries
 */
export async function smartExecute(trade: any, ibkr: any): Promise<ExecutionResult> {
  const symbol = trade.symbol
  const strike = trade.strike
  const expiry = trade.expiry
  const type = trade.type
  const size = trade.size || 1

  console.log(`[EXECUTE] Starting execution: ${symbol} ${strike} ${type} x${size}`)

  // Calculate mid price
  let price = (trade.bid + trade.ask) / 2

  const maxRetries = 3
  let lastError = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[EXECUTE] Attempt ${attempt + 1}/${maxRetries} at ${price.toFixed(2)}`)

      // Place limit order
      const order = {
        symbol,
        strike,
        expiry,
        type,
        price: price.toFixed(2),
        quantity: size,
        orderType: 'LIMIT'
      }

      const result = await ibkr.placeLimitOrder(order)

      if (result && result.filled) {
        console.log(`[EXECUTE] ✅ FILLED at ${result.filledPrice} for ${result.filledSize} contracts`)

        return {
          symbol,
          strike,
          expiry,
          type,
          filled: true,
          filledPrice: result.filledPrice,
          filledSize: result.filledSize,
          pnl: calculatePnL(trade, result)
        }
      }

      // Not filled, adjust and retry
      console.log(`[EXECUTE] ⏳ Not filled, adjusting price...`)
      price *= 1.01 // Adjust 1% higher
    } catch (err) {
      lastError = err
      console.error(`[EXECUTE] Attempt ${attempt + 1} failed:`, err)
    }
  }

  // All retries failed
  console.error(`[EXECUTE] ❌ Failed after ${maxRetries} attempts`)

  return {
    symbol,
    strike,
    expiry,
    type,
    filled: false,
    error: lastError?.message || 'Max retries exceeded'
  }
}

/**
 * Market order execution (fallback, higher risk)
 */
export async function marketExecute(trade: any, ibkr: any): Promise<ExecutionResult> {
  console.log(`[EXECUTE] Market execution: ${trade.symbol} ${trade.strike}`)

  try {
    const result = await ibkr.placeMarketOrder({
      symbol: trade.symbol,
      strike: trade.strike,
      expiry: trade.expiry,
      type: trade.type,
      quantity: trade.size || 1
    })

    if (result && result.filled) {
      return {
        symbol: trade.symbol,
        strike: trade.strike,
        expiry: trade.expiry,
        type: trade.type,
        filled: true,
        filledPrice: result.filledPrice,
        filledSize: result.filledSize,
        pnl: calculatePnL(trade, result)
      }
    }

    return {
      symbol: trade.symbol,
      strike: trade.strike,
      expiry: trade.expiry,
      type: trade.type,
      filled: false,
      error: 'Market order not filled'
    }
  } catch (err) {
    return {
      symbol: trade.symbol,
      strike: trade.strike,
      expiry: trade.expiry,
      type: trade.type,
      filled: false,
      error: err instanceof Error ? err.message : 'Market execution failed'
    }
  }
}

/**
 * Calculate P&L on execution
 */
function calculatePnL(trade: any, result: any): number {
  const entryPrice = result.filledPrice || 0
  const currentPrice = (trade.ask + trade.bid) / 2
  const pnlPerContract = currentPrice - entryPrice
  return pnlPerContract * (result.filledSize || 1) * 100 // options contract multiplier
}

/**
 * Check fill quality
 */
export function checkFillQuality(trade: any, result: ExecutionResult): boolean {
  if (!result.filled) return false

  const slippage = Math.abs(result.filledPrice! - ((trade.bid + trade.ask) / 2))
  const slippagePercent = (slippage / ((trade.bid + trade.ask) / 2)) * 100

  if (slippagePercent > 2) {
    console.warn(`[EXECUTE] Poor fill quality: ${slippagePercent.toFixed(2)}% slippage`)
    return false
  }

  return true
}
