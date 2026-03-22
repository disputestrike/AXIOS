/**
 * Auto-Trading Router
 * tRPC procedures for controlling the autonomous trading engine
 */

import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getAutoTradingEngine, resetAutoTradingEngine } from "../auto-trading-engine";
import { runBacktest, runHistoricalBacktest } from "../backtest-runner";
import { getTCASummary, getTCALog } from "../tca";
import { STRATEGY_CONFIGS, type StrategyType } from "../strategy-types";

export const autoTradingRouter = router({
  // Get current trading state
  getState: publicProcedure.query(() => {
    try {
      const engine = getAutoTradingEngine();
      const state = engine.getState();
      // Update lastUpdate timestamp to show activity
      state.lastUpdate = Date.now();
      // Add unrealized P&L from open positions so dashboard shows dynamic data
      const openPositions = state.positions.filter((p: { status: string }) => p.status === "open");
      const unrealizedPnL = openPositions.reduce(
        (sum: number, p: { unrealizedPnL?: number }) => sum + (Number(p.unrealizedPnL) || 0),
        0
      );
      return { ...state, unrealizedPnL: Number.isFinite(unrealizedPnL) ? unrealizedPnL : 0 };
    } catch (e) {
      console.error("[AutoTrading] getState failed:", e);
      return {
        isRunning: false,
        accountBalance: 100000,
        totalEquity: 100000,
        dayPnL: 0,
        totalPnL: 0,
        positions: [],
        trades: [],
        currentRegime: "unknown",
        lastScanTime: 0,
        lastOpportunities: [],
        riskMetrics: {
          maxRiskPerTrade: 1000,
          currentExposure: 0,
          dailyLossLimit: 5000,
          currentDailyLoss: 0,
          ruinProbability: 0,
          killSwitchActive: false,
          positionCount: 0,
          maxPositions: 3,
        },
        lastUpdate: Date.now(),
        cycleCount: 0,
        autoTradeLog: ["Engine state unavailable — check server logs."],
        signalQueue: [],
        unrealizedPnL: 0,
      };
    }
  }),

  // Get performance metrics
  getPerformance: publicProcedure.query(() => {
    const engine = getAutoTradingEngine();
    return engine.getPerformanceMetrics();
  }),

  // Start the trading engine
  start: protectedProcedure.mutation(() => {
    const engine = getAutoTradingEngine();
    engine.start();
    return { success: true, message: "Trading engine started" };
  }),

  // Stop the trading engine
  stop: protectedProcedure.mutation(() => {
    const engine = getAutoTradingEngine();
    engine.stop();
    return { success: true, message: "Trading engine stopped" };
  }),

  // Reset the account
  reset: protectedProcedure.mutation(() => {
    resetAutoTradingEngine();
    return { success: true, message: "Account reset to initial state" };
  }),

  // Get open positions
  getPositions: publicProcedure.query(() => {
    const engine = getAutoTradingEngine();
    const state = engine.getState();
    return state.positions.filter(p => p.status === 'open');
  }),

  // Get all positions (including closed)
  getAllPositions: publicProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(({ input }) => {
      const engine = getAutoTradingEngine();
      const state = engine.getState();
      return state.positions.slice(-input.limit);
    }),

  // Get recent trades
  getTrades: publicProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(({ input }) => {
      const engine = getAutoTradingEngine();
      const state = engine.getState();
      return state.trades.slice(-input.limit);
    }),

  // Get risk metrics
  getRiskMetrics: publicProcedure.query(() => {
    const engine = getAutoTradingEngine();
    const state = engine.getState();
    return state.riskMetrics;
  }),

  // Get signal queue
  getSignalQueue: publicProcedure.query(() => {
    const engine = getAutoTradingEngine();
    const state = engine.getState();
    return state.signalQueue;
  }),

  // Get engine logs for debugging
  getLogs: publicProcedure
    .input(z.object({ limit: z.number().default(50) }).optional())
    .query(({ input }) => {
      const engine = getAutoTradingEngine();
      const state = engine.getState();
      const limit = input?.limit || 50;
      return state.autoTradeLog.slice(-limit);
    }),

  // Get last opportunities found (for debugging)
  getLastOpportunities: publicProcedure.query(() => {
    const engine = getAutoTradingEngine();
    const state = engine.getState();
    return {
      count: state.lastOpportunities.length,
      opportunities: state.lastOpportunities.slice(0, 10), // Top 10
      lastScanTime: state.lastScanTime,
    };
  }),

  // Close a single engine position by id (from Execution page)
  closePosition: protectedProcedure
    .input(z.object({ positionId: z.string() }))
    .mutation(async ({ input }) => {
      const engine = getAutoTradingEngine();
      const closed = await engine.closePositionById(input.positionId, "MANUAL_CLOSE");
      if (!closed) throw new Error("Position not found or already closed");
      return { success: true, message: "Position closed" };
    }),

  // Deactivate kill switch (manual override)
  deactivateKillSwitch: protectedProcedure.mutation(() => {
    const engine = getAutoTradingEngine();
    const state = engine.getState();
    return { 
      success: true, 
      message: "Kill switch deactivation requested. Please restart the engine manually.",
      currentState: state.riskMetrics.killSwitchActive
    };
  }),

  // Run backtest (stub: current scan + structure logic)
  runBacktest: publicProcedure
    .input(z.object({
      strategy: z.enum(["wheel", "short_term", "iron_condor", "adaptive"]),
      symbols: z.array(z.string()).optional(),
      initialCapital: z.number().default(100000),
      maxPositions: z.number().default(5),
    }))
    .mutation(async ({ input }) => {
      const result = await runBacktest({
        strategy: input.strategy as StrategyType,
        symbols: input.symbols,
        initialCapital: input.initialCapital,
        maxPositions: input.maxPositions,
      });
      return result;
    }),

  // Historical backtest (IB historical; Sharpe, maxDD, win rate by regime)
  runHistoricalBacktest: publicProcedure
    .input(z.object({
      symbol: z.string().default("SPY"),
      days: z.number().min(21).max(252).default(60),
      holdDays: z.number().min(1).max(10).default(5),
      onlyTradeRegimes: z.array(z.string()).optional(),
      useOptionStylePnl: z.boolean().optional(),
      riskPerTrade: z.number().min(0.005).max(0.1).optional(), // e.g. 0.02 = 2%
    }))
    .mutation(async ({ input }) => {
      const result = await runHistoricalBacktest(
        input.symbol,
        input.days,
        input.holdDays,
        input.onlyTradeRegimes,
        input.useOptionStylePnl ?? true,
        input.riskPerTrade ?? 0.01
      );
      return result;
    }),

  // TCA summary (slippage, implementation shortfall — hedge fund style)
  getTCASummary: publicProcedure.query(() => getTCASummary()),
  getTCALog: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(100).optional().default(50) }))
    .query(({ input }) => getTCALog(input.limit)),

  getDrawdownMetrics: publicProcedure.query(async () => {
    const { getDrawdownStatus } = await import("../drawdown-limiter");
    return getDrawdownStatus();
  }),

  getPortfolioGreeks: publicProcedure.query(async () => {
    const { getPortfolioGreeks } = await import("../portfolio-greeks-tracker");
    return getPortfolioGreeks("default");
  }),

  getGreeksImbalance: publicProcedure
    .input(
      z
        .object({
          maxDeltaAbsolute: z.number().optional(),
          maxGammaAbsolute: z.number().optional(),
          maxVegaAbsolute: z.number().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const { checkGreeksImbalance } = await import("../portfolio-greeks-tracker");
      return checkGreeksImbalance("default", input ?? undefined);
    }),

  // Get strategy configs (for UI). Includes human-readable TP/SL so Wheel "100% SL" is not misleading.
  getStrategyConfigs: publicProcedure.query(() => {
    const stopLossDescription: Record<string, string> = {
      wheel: "Close at 2× credit received OR 50% of max risk. CSP max loss = (strike × 100) − premium.",
      short_term: "25% of max risk.",
      iron_condor: "100% of credit received (or close at 2× credit).",
      adaptive: "20% of max risk.",
    };
    const takeProfitDescription: Record<string, string> = {
      wheel: "50% of credit received.",
      short_term: "25% of max profit.",
      iron_condor: "50% of credit received.",
      adaptive: "30% of max profit.",
    };
    return Object.values(STRATEGY_CONFIGS).map(c => ({
      type: c.type,
      description: c.description,
      preferredStructures: c.preferredStructures,
      minWinProbability: c.minWinProbability,
      takeProfitPercent: c.takeProfitPercent,
      stopLossPercent: c.stopLossPercent,
      takeProfitDescription: takeProfitDescription[c.type] ?? `${(c.takeProfitPercent * 100).toFixed(0)}%`,
      stopLossDescription: stopLossDescription[c.type] ?? `${(c.stopLossPercent * 100).toFixed(0)}% of max risk`,
    }));
  }),

  // Set engine strategy type
  setStrategyType: protectedProcedure
    .input(z.object({ strategyType: z.enum(["wheel", "short_term", "iron_condor", "adaptive"]) }))
    .mutation(({ input }) => {
      const engine = getAutoTradingEngine();
      engine.setStrategyType(input.strategyType);
      return { success: true, strategyType: input.strategyType };
    }),
});
