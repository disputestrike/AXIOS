/**
 * DECISION ENGINE - The Central Brain
 * 
 * Orchestrates: scan → enrich → score → rank → allocate → execute → learn
 * This is where all intelligence layers come together
 */

import { enrichTrades } from './data-enricher'
import { scoreTrades } from './trade-scorer'
import { selectBestStrategies } from './meta-orchestrator'
import { allocateCapital } from './portfolio-optimizer'
import { smartExecute } from './execution'
import { updateModel } from './learning-engine'
import { logTrade } from './trade-logger'
import { updateRisk, checkKillSwitch } from './risk-engine'
import { ExecutionResult } from './types'

interface DecisionContext {
  scanner: any
  ibkr: any
  account: any
  logger?: any
}

/**
 * Main decision loop - called every cycle
 */
export async function runDecisionEngine(ctx: DecisionContext) {
  try {
    // STEP 1: SCAN for opportunities
    console.log('[DECISION] Scanning market...')
    const opportunities = await ctx.scanner.scan()

    if (!opportunities || opportunities.length === 0) {
      console.log('[DECISION] No opportunities found')
      return []
    }

    console.log(`[DECISION] Found ${opportunities.length} opportunities`)

    // STEP 2: ENRICH with intelligence (Greeks, IV, ML, Flow)
    console.log('[DECISION] Enriching with intelligence...')
    const enriched = await enrichTrades(opportunities, ctx.ibkr)

    if (!enriched || enriched.length === 0) {
      console.log('[DECISION] No valid enriched trades')
      return []
    }

    console.log(`[DECISION] Enriched ${enriched.length} trades`)

    // STEP 3: SCORE all trades
    console.log('[DECISION] Scoring trades...')
    const scored = scoreTrades(enriched)

    // STEP 4: SELECT best strategies (rank + filter)
    console.log('[DECISION] Selecting best strategies...')
    const best = selectBestStrategies(scored)

    if (!best || best.length === 0) {
      console.log('[DECISION] No qualified trades after filtering')
      return []
    }

    console.log(`[DECISION] Selected ${best.length} best trades`)

    // STEP 5: ALLOCATE capital intelligently
    console.log('[DECISION] Allocating capital...')
    const allocated = allocateCapital(best, ctx.account.equity)

    console.log(`[DECISION] Allocated to ${allocated.length} positions`)

    // STEP 6: EXECUTE trades
    console.log('[DECISION] Executing trades...')
    const results: ExecutionResult[] = []

    for (const trade of allocated) {
      try {
        console.log(`[DECISION] Executing ${trade.symbol} ${trade.strike} ${trade.type}...`)
        
        const result = await smartExecute(trade, ctx.ibkr)

        results.push(result)

        // Log the trade
        if (ctx.logger) {
          logTrade(trade, result)
        }

        // STEP 7: LEARN from outcome (adaptive)
        await updateModel(trade, result)

        // STEP 8: UPDATE risk metrics
        updateRisk(result, ctx.account.equity)

        console.log(`[DECISION] Trade result:`, result)
      } catch (err) {
        console.error(`[DECISION] Execution error:`, err)
      }
    }

    // CHECK kill switch
    try {
      checkKillSwitch()
    } catch (err) {
      console.error('[DECISION] KILL SWITCH ACTIVATED:', err)
      throw err
    }

    console.log(`[DECISION] Cycle complete. Executed ${results.length} trades`)

    return results
  } catch (err) {
    console.error('[DECISION ENGINE ERROR]:', err)
    throw err
  }
}

/**
 * Get current system state
 */
export function getEngineState() {
  return {
    timestamp: new Date().toISOString(),
    running: true
  }
}
