/**
 * Today's Opportunity Router — Catalyst + Options Generation + Claude Validation + Glide.
 * Single entry for "the greatest" 10/10 flow: catalysts, Conservative/Balanced/Aggressive, validate, glide.
 */

import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import {
  getCatalystsForSymbol,
  getCatalystsForSymbols,
  getCatalystStats,
} from "../catalyst-detection";
import {
  getTodayOpportunityOptions,
  getTodayOpportunitiesOptions,
  getOptionsForSymbolWithIntent,
  type GeneratedTradeOption,
} from "../catalyst-options-generation";
import {
  validateTradeWithClaude,
  isValidationAvailable,
  type ValidationResult,
} from "../trade-validation-claude";
import {
  getGlideAdvice,
  computeMomentumStrength,
  type PositionSnapshot,
  type MomentumContext,
  type GlideAdvice,
} from "../dynamic-momentum-glide";
import { ALL_STRUCTURE_TYPES } from "../strategy-types";
import { ENV } from "../_core/env";

export const opportunityRouter = router({
  /**
   * Blueprint 10/10 status for UI (outcome store, confidence sizing, calibration).
   */
  getBlueprintStatus: publicProcedure.query(() => ({
    outcomeStore: ENV.outcomeStore,
    enableConfidenceSizing: ENV.enableConfidenceSizing,
    enableConfidenceCalibration: ENV.enableConfidenceCalibration,
    label: "10/10 Blueprint",
  })),

  /**
   * Get all supported trading structure types with labels and descriptions (for UI).
   */
  getStructureTypes: publicProcedure.query(() => ({
    structures: ALL_STRUCTURE_TYPES.filter((s) => s.id !== "any").map((s) => ({ id: s.id, label: s.label, description: s.description })),
  })),

  /**
   * Get catalysts for one or more symbols.
   */
  getCatalysts: publicProcedure
    .input(
      z.object({
        symbols: z.array(z.string().min(1).max(10)).optional(),
        symbol: z.string().min(1).max(10).optional(),
      })
    )
    .query(async ({ input }) => {
      const symbols = input.symbols ?? (input.symbol ? [input.symbol] : []);
      if (symbols.length === 0) {
        return { catalysts: new Map<string, unknown>(), stats: getCatalystStats() };
      }
      const map = await getCatalystsForSymbols(symbols);
      const obj: Record<string, unknown> = {};
      map.forEach((v, k) => {
        obj[k] = v;
      });
      return { catalysts: obj, stats: getCatalystStats() };
    }),

  /**
   * Catalyst layer health/stats.
   */
  getCatalystStats: publicProcedure.query(() => getCatalystStats()),

  /**
   * Today's Opportunity: top scan pick + Conservative / Balanced / Aggressive options.
   * Optionally run scan if empty.
   */
  getTodayOpportunity: publicProcedure
    .input(
      z.object({
        runScanIfEmpty: z.boolean().optional().default(false),
        useIntentGovernance: z.boolean().optional().default(true),
      })
    )
    .query(async ({ input }) => {
      const { opportunity, options, catalystsBySymbol, intent } = await getTodayOpportunityOptions(
        input.runScanIfEmpty,
        input.useIntentGovernance
      );
      const catalystsObj: Record<string, unknown> = {};
      catalystsBySymbol.forEach((v, k) => {
        catalystsObj[k] = v;
      });
      return {
        success: true,
        opportunity: opportunity ?? null,
        options,
        catalystsBySymbol: catalystsObj,
        intent: intent ?? undefined,
        timestamp: Date.now(),
      };
    }),

  /**
   * Today's opportunities: top N picks (default 5), each with Conservative/Balanced/Aggressive options.
   */
  getTodayOpportunities: publicProcedure
    .input(
      z.object({
        runScanIfEmpty: z.boolean().optional().default(false),
        topN: z.number().min(1).max(20).optional().default(15),
        useIntentGovernance: z.boolean().optional().default(true),
      })
    )
    .query(async ({ input }) => {
      const { opportunities, timestamp, vix } = await getTodayOpportunitiesOptions(
        input.runScanIfEmpty,
        input.topN,
        input.useIntentGovernance
      );
      return {
        success: true,
        opportunities,
        timestamp,
        vix,
      };
    }),

  /**
   * Generate Conservative/Balanced/Aggressive options for a symbol (must be in scan).
   * Always uses intent governance (Claude or enhanced fallback).
   */
  generateOptionsForSymbol: publicProcedure
    .input(z.object({ symbol: z.string().min(1).max(10) }))
    .query(async ({ input }) => {
      const result = await getOptionsForSymbolWithIntent(input.symbol);
      if (!result.success) {
        return { success: false, options: result.options, message: result.message };
      }
      return {
        success: true,
        options: result.options,
        opportunity: result.opportunity,
        intent: result.intent,
      };
    }),

  /**
   * Validate a trade option with Claude (approve / reject / modify).
   */
  validateTrade: publicProcedure
    .input(
      z.object({
        tier: z.enum(["conservative", "balanced", "aggressive"]),
        symbol: z.string(),
        structureType: z.string(),
        direction: z.string(),
        impliedMovePercent: z.number(),
        historicalMovePercent: z.number(),
        moveComparison: z.string(),
        catalystSummary: z.string(),
        tierScore: z.number(),
        winProbability: z.number(),
        expectedReturn: z.number(),
        currentPrice: z.number(),
        regime: z.string(),
        contextRegime: z.string().optional(),
        contextRecentPnL: z.string().optional(),
      })
    )
    .mutation(async ({ input }): Promise<{ success: boolean; validation: ValidationResult }> => {
      const trade: GeneratedTradeOption = {
        tier: input.tier,
        symbol: input.symbol,
        structureType: input.structureType,
        direction: input.direction,
        suggestedExpiryDays: { min: 7, max: 21 },
        strikeMultiplier: 1,
        impliedMovePercent: input.impliedMovePercent,
        historicalMovePercent: input.historicalMovePercent,
        moveComparison: input.moveComparison,
        catalystSummary: input.catalystSummary,
        catalysts: [],
        tierScore: input.tierScore,
        winProbability: input.winProbability,
        expectedReturn: input.expectedReturn,
        currentPrice: input.currentPrice,
        regime: input.regime,
        timestamp: Date.now(),
      };
      const validation = await validateTradeWithClaude(trade, {
        regime: input.contextRegime,
        recentPnL: input.contextRecentPnL,
      });
      return { success: true, validation };
    }),

  /**
   * Check if Claude validation is available.
   */
  isValidationAvailable: publicProcedure.query(() => isValidationAvailable()),

  /**
   * Get Dynamic Momentum Glide advice for a position.
   */
  getGlideAdvice: publicProcedure
    .input(
      z.object({
        symbol: z.string(),
        entryPrice: z.number(),
        currentPrice: z.number(),
        takeProfitPrice: z.number(),
        stopLossPrice: z.number(),
        trailingStopPrice: z.number().nullable().optional(),
        highWaterMark: z.number(),
        daysToExpiry: z.number(),
        entryTime: z.number(),
        regime: z.string(),
        priceChangePercent: z.number().optional(),
        volRegime: z.enum(["low", "normal", "high"]).optional(),
      })
    )
    .query(({ input }): GlideAdvice => {
      const unrealizedPnLPercent =
        ((input.currentPrice - input.entryPrice) / input.entryPrice) * 100;
      const position: PositionSnapshot = {
        symbol: input.symbol,
        entryPrice: input.entryPrice,
        currentPrice: input.currentPrice,
        takeProfitPrice: input.takeProfitPrice,
        stopLossPrice: input.stopLossPrice,
        trailingStopPrice: input.trailingStopPrice ?? null,
        highWaterMark: input.highWaterMark,
        unrealizedPnLPercent,
        daysToExpiry: input.daysToExpiry,
        entryTime: input.entryTime,
        regime: input.regime,
      };
      const momentumStrength = computeMomentumStrength(
        input.priceChangePercent ?? 0,
        input.volRegime
      );
      const diff = input.currentPrice - input.entryPrice;
      const priceVsEntry: "above" | "near" | "below" =
        diff > input.entryPrice * 0.02 ? "above" : diff < -input.entryPrice * 0.02 ? "below" : "near";
      const momentum: MomentumContext = {
        momentumStrength,
        volRegime: input.volRegime ?? "normal",
        priceVsEntry,
      };
      return getGlideAdvice(position, momentum);
    }),
});
