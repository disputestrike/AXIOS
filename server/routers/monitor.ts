/**
 * MONITORING ROUTER
 * 
 * tRPC API for:
 * - Starting/stopping engine
 * - Viewing trade log
 * - Performance metrics
 * - Live monitoring
 */

import { publicProcedure, router } from '../_core/trpc'
import { z } from 'zod'
import { getTradeLog, logSessionStart } from '../../trading-core/trade-logger'
import { getEngineState, startEngine, stopEngine } from '../../trading-core/unified-engine'
import { calculateMetrics, getTradeHistory } from '../../trading-core/learning-engine'
import { analyzePerformance } from '../../trading-core/performance-engine'
import { getRiskState } from '../../trading-core/risk-engine'

export const monitorRouter = router({
  // Get trade log
  getTrades: publicProcedure.query(async () => {
    try {
      const trades = getTradeLog()
      return {
        ok: true,
        trades,
        count: trades.length
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      }
    }
  }),

  // Get system status
  getStatus: publicProcedure.query(async () => {
    try {
      const engineState = getEngineState()
      const metrics = calculateMetrics()
      const riskState = getRiskState(engineState.accountBalance)

      return {
        ok: true,
        engine: engineState,
        metrics,
        risk: riskState
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      }
    }
  }),

  // Get performance metrics
  getMetrics: publicProcedure.query(async () => {
    try {
      const metrics = calculateMetrics()
      return {
        ok: true,
        metrics
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      }
    }
  }),

  // Get trade history
  getHistory: publicProcedure.query(async () => {
    try {
      const history = getTradeHistory()
      return {
        ok: true,
        trades: history,
        count: history.length
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      }
    }
  }),

  // Start engine
  start: publicProcedure
    .input(
      z.object({
        scanInterval: z.number().default(5000),
        paperTrading: z.boolean().default(true)
      })
    )
    .mutation(async ({ input }) => {
      try {
        logSessionStart({
          scanInterval: input.scanInterval,
          paperTrading: input.paperTrading
        })

        return {
          ok: true,
          message: 'Engine start initiated'
        }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to start'
        }
      }
    }),

  // Stop engine
  stop: publicProcedure.mutation(async () => {
    try {
      await stopEngine()
      return {
        ok: true,
        message: 'Engine stopped'
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to stop'
      }
    }
  })
})

export type MonitorRouter = typeof monitorRouter
