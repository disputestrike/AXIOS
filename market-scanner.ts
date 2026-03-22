import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getMarketScanner } from "../market-scanner";
import { ALL_STRUCTURE_TYPES, ALL_REGIMES, STRATEGY_TYPE_LABELS } from "../strategy-types";

export const marketScannerRouter = router({
  /**
   * Scan market for opportunities using IBKR only.
   */
  scan: publicProcedure.query(async () => {
    try {
      const scanner = getMarketScanner();
      const opportunities = await scanner.scan();
      const dataSource = 'ibkr';
      return {
        success: true,
        count: opportunities.length,
        opportunities,
        timestamp: Date.now(),
        dataSource
      };
    } catch (error) {
      console.error("Market scan error:", error);
      return {
        success: false,
        count: 0,
        opportunities: [],
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now()
      };
    }
  }),

  /**
   * Get the single highest-probability, highest-profit setup from the scanner (one stop).
   * Optional minWinProbability (0–100) and minScore so only explosive, high-probability picks.
   * Call scan first if you want fresh data.
   */
  getBestOne: publicProcedure
    .input(z.object({
      minWinProbability: z.number().min(0).max(100).optional(),
      minScore: z.number().min(0).max(100).optional(),
      regime: z.string().max(30).optional(),
      runScanIfEmpty: z.boolean().optional().default(false),
    }))
    .query(async ({ input }) => {
      try {
        const scanner = getMarketScanner();
        if (input.runScanIfEmpty && scanner.getStatus().totalOpportunities === 0) await scanner.scan();
        const options = (input.minWinProbability != null || input.minScore != null || input.regime)
          ? { minWinProbability: input.minWinProbability, minScore: input.minScore, regime: input.regime }
          : undefined;
        const one = scanner.getHighestExplosiveSetup(options);
        const dataSource = 'ibkr';
        return {
          success: true,
          oneStop: true,
          opportunity: one ?? null,
          message: one
            ? `Highest setup: ${one.symbol} (win ${((one.opportunity?.winProbability ?? 0) * 100).toFixed(0)}%, score ${one.opportunity?.score ?? 0}) — trade only this one.`
            : 'No opportunity met filters. Run scan first or lower minWinProbability/minScore.',
          dataSource,
        };
      } catch (error) {
        console.error("Get best one error:", error);
        return {
          success: false,
          oneStop: true,
          opportunity: null,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }),

  /**
   * Get top opportunities (best of the best: composite rank = score + win prob + expected return + signal confidence).
   * Count up to 100. Optional filters: minScore, minWinProbability, structureType, regime, symbolSearch.
   */
  getTopOpportunities: publicProcedure
    .input(z.object({
      count: z.number().min(1).max(100).default(100),
      minScore: z.number().min(0).max(100).optional(),
      minWinProbability: z.number().min(0).max(100).optional(),
      structureType: z.string().optional(),
      regime: z.string().optional(),
      symbolSearch: z.string().max(20).optional(),
      /** When true, include illiquid opportunities so list matches total (show with "Lower liquidity" badge). */
      includeIlliquid: z.boolean().optional(),
    }))
    .query(({ input }) => {
      try {
        const scanner = getMarketScanner();
        const hasFilters = input.minScore != null || input.minWinProbability != null || input.structureType || input.regime || input.symbolSearch || input.includeIlliquid === true;
        const filters = hasFilters
          ? {
              minScore: input.minScore,
              minWinProbability: input.minWinProbability,
              structureType: input.structureType,
              regime: input.regime,
              symbolSearch: input.symbolSearch,
              includeIlliquid: input.includeIlliquid,
            }
          : undefined;
        const opportunities = scanner.getTopOpportunities(input.count, filters);
        return {
          success: true,
          count: opportunities.length,
          opportunities,
          dataSource: 'ibkr'
        };
      } catch (error) {
        console.error("Get top opportunities error:", error);
        return {
          success: false,
          count: 0,
          opportunities: [],
          error: error instanceof Error ? error.message : "Unknown error"
        };
      }
    }),

  /**
   * All known strategy/structure types and regimes (single source of truth from strategy-types).
   * Use for filter dropdowns and "how we choose the best" — composite score + high-growth bias.
   */
  getKnownStrategies: publicProcedure.query(() => {
    return {
      strategies: ALL_STRUCTURE_TYPES.map(({ id, label }) => ({ id, label })),
      regimes: ALL_REGIMES.map(({ id, label }) => ({ id, label })),
      strategyTypes: STRATEGY_TYPE_LABELS.map(({ id, label }) => ({ id, label })),
    };
  }),

  /**
   * Get opportunity for specific symbol
   */
  getOpportunity: publicProcedure
    .input(z.object({
      symbol: z.string().min(1).max(10)
    }))
    .query(({ input }) => {
      try {
        const scanner = getMarketScanner();
        const opportunity = scanner.getOpportunity(input.symbol);
        return {
          success: true,
          opportunity: opportunity || null
        };
      } catch (error) {
        console.error("Get opportunity error:", error);
        return {
          success: false,
          opportunity: null,
          error: error instanceof Error ? error.message : "Unknown error"
        };
      }
    }),

  /**
   * Get all opportunities
   */
  getAllOpportunities: publicProcedure.query(() => {
    try {
      const scanner = getMarketScanner();
      const opportunities = scanner.getAllOpportunities();
      const dataSource = 'ibkr';
      return {
        success: true,
        count: opportunities.length,
        opportunities,
        dataSource
      };
    } catch (error) {
      console.error("Get all opportunities error:", error);
      return {
        success: false,
        count: 0,
        opportunities: [],
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }),

  /**
   * Get scanner status
   */
  getStatus: publicProcedure.query(() => {
    try {
      const scanner = getMarketScanner();
      return {
        success: true,
        ...scanner.getStatus()
      };
    } catch (error) {
      console.error("Get status error:", error);
      return {
        success: false,
        isScanning: false,
        lastScanTime: 0,
        totalOpportunities: 0,
        errors: []
      };
    }
  }),

  /**
   * Scan universe info (size, source, max). 10k-ready when SCAN_UNIVERSE_URL or SCAN_SYMBOLS set.
   */
  getScanUniverseInfo: publicProcedure.query(async () => {
    try {
      const { getScanUniverse, getDefaultUniverseSize } = await import("../scan-universe");
      const symbols = await getScanUniverse();
      const defaultSize = getDefaultUniverseSize();
      const source = process.env.SCAN_UNIVERSE_URL?.trim() ? "url" : process.env.SCAN_SYMBOLS?.trim() ? "env" : "default";
      const maxAllowed = Math.min(50_000, Math.max(1, Number(process.env.SCAN_UNIVERSE_MAX) || 10_000));
      return {
        success: true,
        size: symbols.length,
        source,
        defaultSize,
        maxAllowed,
      };
    } catch (error) {
      return {
        success: false,
        size: 0,
        source: "default",
        defaultSize: 0,
        maxAllowed: 10_000,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }),

  /**
   * Clear all opportunities
   */
  clear: publicProcedure.mutation(() => {
    try {
      const scanner = getMarketScanner();
      scanner.clear();
      return {
        success: true,
        message: "All opportunities cleared"
      };
    } catch (error) {
      console.error("Clear error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  })
});
