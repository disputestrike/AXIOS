import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import * as services from "./services";
import { omega0Router } from "./routers/omega0";
import { autoTradingRouter } from "./routers/auto-trading";
import { gatewayRouter } from "./routers/gateway";
import { marketScannerRouter } from "./routers/market-scanner";
import { twsConnectionRouter } from "./routers/tws-connection";
import { opportunityRouter } from "./routers/opportunity";
import { z } from "zod";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    login: publicProcedure
      .input(z.object({ 
        name: z.string().optional().default("Demo User"),
        email: z.string().optional().default("demo@aoix.local")
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          console.log("[Auth] Login attempt started");
          // Create or get demo user
          const demoOpenId = "demo-user-local";
          let user: any = null;
          
          // Try to get user from database (but don't fail if DB unavailable)
          try {
            user = await db.getUserByOpenId(demoOpenId);
            console.log("[Auth] User lookup result:", user ? "found" : "not found");
          } catch (dbError) {
            console.warn("[Auth] Database query failed (non-critical), using in-memory user:", dbError);
          }
          
          if (!user) {
            // Try to create demo user in database (but don't fail if DB unavailable)
            try {
              await db.upsertUser({
                openId: demoOpenId,
                name: input.name,
                email: input.email,
                loginMethod: "local",
                lastSignedIn: new Date(),
              });
              // Try to fetch again
              try {
                user = await db.getUserByOpenId(demoOpenId);
              } catch (fetchError) {
                console.warn("[Auth] Failed to fetch after upsert (non-critical)");
              }
            } catch (dbError) {
              console.warn("[Auth] Database not available, using in-memory user:", dbError);
              // Continue with in-memory user if DB fails
            }
          } else {
            // Update last signed in (but don't fail if DB unavailable)
            try {
              await db.upsertUser({
                openId: demoOpenId,
                lastSignedIn: new Date(),
              });
            } catch (dbError) {
              console.warn("[Auth] Failed to update last signed in (non-critical):", dbError);
            }
          }

          // Return user object (create mock if DB unavailable)
          const userResponse = user || {
            id: 1,
            openId: demoOpenId,
            name: input.name,
            email: input.email,
            loginMethod: "local",
            role: "user" as const,
            lastSignedIn: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          // Create session token (works even without DB)
          const { sdk } = await import("./_core/sdk");
          const sessionToken = await sdk.createSessionToken(demoOpenId, {
            name: userResponse.name || input.name,
            expiresInMs: 365 * 24 * 60 * 60 * 1000, // 1 year
          });
          console.log("[Auth] Session token created");

          // Set cookie
          const cookieOptions = getSessionCookieOptions(ctx.req);
          console.log("[Auth] Cookie options:", cookieOptions);
          console.log("[Auth] Setting cookie:", COOKIE_NAME, "length:", sessionToken.length);
          ctx.res.cookie(COOKIE_NAME, sessionToken, { 
            ...cookieOptions, 
            maxAge: 365 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            path: "/",
          });
          console.log("[Auth] Cookie set successfully, response headers:", Object.keys(ctx.res.getHeaders()));

          return {
            success: true,
            user: userResponse,
          } as const;
        } catch (error) {
          console.error("[Auth] Login failed:", error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error("[Auth] Full error:", error);
          throw new Error(`Login failed: ${errorMessage}`);
        }
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // ========================================================================
  // MARKET DATA PROCEDURES
  // ========================================================================
  market: router({
    getLatestData: publicProcedure
      .input(z.object({ underlying: z.string() }))
      .query(async ({ input }) => {
        return await db.getLatestMarketData(input.underlying);
      }),

    getHistory: publicProcedure
      .input(z.object({ underlying: z.string(), limit: z.number().default(100) }))
      .query(async ({ input }) => {
        return await db.getMarketDataHistory(input.underlying, input.limit);
      }),

    getDataQuality: publicProcedure.query(async () => {
      const { getDataQuality } = await import("./real-market-data");
      return getDataQuality();
    }),
  }),

  // ========================================================================
  // REGIME ANALYSIS PROCEDURES
  // ========================================================================
  regime: router({
    getLatest: publicProcedure
      .input(z.object({ underlying: z.string() }))
      .query(async ({ input }) => {
        return await db.getLatestRegimeState(input.underlying);
      }),

    analyze: publicProcedure
      .input(
        z.object({
          spotPrice: z.number(),
          priceMA20: z.number(),
          impliedVol: z.number(),
          historicalVol: z.number(),
          sofr: z.number(),
          moveIndex: z.number(),
          fxVol: z.number(),
          orderBookDepth: z.number(),
        })
      )
      .query(({ input }) => {
        return services.analyzeRegime(
          input.spotPrice,
          input.priceMA20,
          input.impliedVol,
          input.historicalVol,
          input.sofr,
          input.moveIndex,
          input.fxVol,
          input.orderBookDepth
        );
      }),

    getRegimeHeatmap: publicProcedure.query(async () => {
      const { getMarketScanner } = await import("./market-scanner");
      const scanner = getMarketScanner();
      const opportunities = scanner.getTopOpportunities(200);
      const bullRegimes = ["bull_vol_compression", "bull_vol_expansion", "trending_bull"];
      const bearRegimes = ["bear_vol_compression", "bear_vol_expansion", "trending_bear", "crisis"];
      return opportunities.map((opp) => {
        const regime = opp.regime ?? "unknown";
        const isBull = bullRegimes.some((r) => regime.includes(r));
        const isBear = bearRegimes.some((r) => regime.includes(r));
        let color = "gray";
        if (isBull) color = "green";
        else if (isBear) color = "red";
        return {
          symbol: opp.symbol,
          currentRegime: regime,
          probability: opp.opportunity?.winProbability ?? opp.regimeStability ?? 0.5,
          color,
          recommendation: opp.structure?.type ?? "unknown",
          score: opp.opportunity?.score ?? 0,
        };
      });
    }),
  }),

  // ========================================================================
  // SIGNAL PROCEDURES
  // ========================================================================
  signals: router({
    getActive: publicProcedure
      .input(z.object({ underlying: z.string() }))
      .query(async ({ input }) => {
        return await db.getActiveSignals(input.underlying);
      }),

    getActiveWithBreakdown: publicProcedure
      .input(z.object({ underlying: z.string() }))
      .query(async ({ input }) => {
        const { getMarketScanner } = await import("./market-scanner");
        const scanner = getMarketScanner();
        const opp = scanner.getOpportunity(input.underlying);
        const score = opp?.opportunity?.score ?? opp?.opportunity?.scoreBeforeLiquidity ?? 0;
        const winProb = opp?.opportunity?.winProbability ?? 0.5;
        const signalConf = opp?.signal?.confidence ?? 0.5;
        const regimeStability = opp?.regimeStability ?? 0.5;
        const breakdown = [
          { type: "signal", score: signalConf, weight: 0.35, rationale: `Lead signal confidence ${(signalConf * 100).toFixed(0)}%` },
          { type: "regime", score: regimeStability, weight: 0.30, rationale: `Regime stability ${(regimeStability * 100).toFixed(0)}%` },
          { type: "opportunity", score: score / 100, weight: 0.35, rationale: `Composite score ${score.toFixed(0)} / win prob ${(winProb * 100).toFixed(0)}%` },
        ];
        const topThreeSignals = breakdown
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map((s) => ({ type: s.type, score: s.score, rationale: s.rationale }));
        // DB optional: don't block breakdown on DB (avoids hang when MySQL not running)
        const active = await Promise.race([
          db.getActiveSignals(input.underlying),
          new Promise<never[]>((_, reject) => setTimeout(() => reject(new Error("DB timeout")), 3000)),
        ]).catch(() => []);
        return {
          finalScore: score,
          winProbability: winProb,
          breakdown,
          topThreeSignals,
          activeSignals: active,
        };
      }),

    getByClass: publicProcedure
      .input(z.object({ underlying: z.string(), signalClass: z.enum(["A", "B", "C", "D"]) }))
      .query(async ({ input }) => {
        return await db.getSignalsByClass(input.underlying, input.signalClass);
      }),

    generateDealerGamma: publicProcedure
      .input(z.object({ gex: z.number(), vegaExposure: z.number(), spotPrice: z.number(), iv: z.number() }))
      .query(({ input }) => {
        return services.generateDealerGammaSignal(input.gex, input.vegaExposure, input.spotPrice, input.iv);
      }),

    generateFlow: publicProcedure
      .input(
        z.object({
          sweepVolume: z.number(),
          avgVolume: z.number(),
          blockTradeCount: z.number(),
          bidAskSpread: z.number(),
        })
      )
      .query(({ input }) => {
        return services.generateFlowSignal(
          input.sweepVolume,
          input.avgVolume,
          input.blockTradeCount,
          input.bidAskSpread
        );
      }),

    generateMomentum: publicProcedure
      .input(z.object({ roc: z.number(), rsi: z.number(), bbPosition: z.number(), volatility: z.number() }))
      .query(({ input }) => {
        return services.generateMomentumSignal(input.roc, input.rsi, input.bbPosition, input.volatility);
      }),

    generateCatalyst: publicProcedure
      .input(z.object({ daysToEvent: z.number(), expectedMove: z.number(), historicalMove: z.number() }))
      .query(({ input }) => {
        return services.generateCatalystSignal(input.daysToEvent, input.expectedMove, input.historicalMove);
      }),

    /** Alternative data summary: sentiment (API or headline-derived) + news headlines + flow. Beyond basic. */
    getAlternativeDataSummary: publicProcedure
      .input(z.object({
        symbol: z.string().min(1).max(10),
        putCallRatio: z.number().optional(),
        impliedVolatility: z.number().optional(),
      }))
      .query(async ({ input }) => {
        const { getAlternativeDataSummary } = await import("./alternative-data");
        return getAlternativeDataSummary(input.symbol, input.putCallRatio, input.impliedVolatility);
      }),
  }),

  // ========================================================================
  // OPTIONS STRUCTURE PROCEDURES
  // ========================================================================
  structures: router({
    getLatestRecommendation: publicProcedure
      .input(z.object({ underlying: z.string() }))
      .query(async ({ input }) => {
        return await db.getLatestStructureRecommendation(input.underlying);
      }),

    selectOptimal: publicProcedure
      .input(
        z.object({
          regime: z.string(),
          signalConfidence: z.number(),
          expectedMove: z.number(),
          iv: z.number(),
          ivPercentile: z.number(),
        })
      )
      .query(({ input }) => {
        return services.selectOptimalStructure(
          input.regime,
          input.signalConfidence,
          input.expectedMove,
          input.iv,
          input.ivPercentile
        );
      }),
  }),

  // ========================================================================
  // RISK MANAGEMENT PROCEDURES
  // ========================================================================
  risk: router({
    getLatestMetrics: protectedProcedure.query(async ({ ctx }) => {
      return await db.getLatestRiskMetrics(ctx.user.id);
    }),

    calculateDynamic: publicProcedure
      .input(
        z.object({
          baseCapital: z.number(),
          currentVix: z.number(),
          historicalVixAvg: z.number(),
          portfolioDelta: z.number(),
          portfolioGamma: z.number(),
          correlationExposure: z.number(),
          dailyLoss: z.number(),
          dailyLossLimit: z.number(),
        })
      )
      .query(({ input }) => {
        return services.calculateDynamicRisk(
          input.baseCapital,
          input.currentVix,
          input.historicalVixAvg,
          input.portfolioDelta,
          input.portfolioGamma,
          input.correlationExposure,
          input.dailyLoss,
          input.dailyLossLimit
        );
      }),
  }),

  // ========================================================================
  // EXECUTION PROCEDURES
  // ========================================================================
  execution: router({
    validateGates: publicProcedure
      .input(
        z.object({
          ivRank: z.number(),
          rvTrend: z.number(),
          sweepVolume: z.number(),
          avgVolume: z.number(),
          daysToOpex: z.number(),
          daysToEarnings: z.number(),
        })
      )
      .query(({ input }) => {
        return services.validateExecutionGates(
          input.ivRank,
          input.rvTrend,
          input.sweepVolume,
          input.avgVolume,
          input.daysToOpex,
          input.daysToEarnings
        );
      }),

    calculateSlippage: publicProcedure
      .input(
        z.object({
          bidAskSpread: z.number(),
          orderSize: z.number(),
          avgDailyVolume: z.number(),
          marketImpactFactor: z.number().optional(),
        })
      )
      .query(({ input }) => {
        return services.calculateSlippageModel(
          input.bidAskSpread,
          input.orderSize,
          input.avgDailyVolume,
          input.marketImpactFactor
        );
      }),
  }),

  // ========================================================================
  // TRADE PROCEDURES
  // ========================================================================
  trades: router({
    getOpenTrades: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserOpenTrades(ctx.user.id);
    }),

    getHistory: protectedProcedure
      .input(z.object({ limit: z.number().default(50) }))
      .query(async ({ ctx, input }) => {
        return await db.getUserTradeHistory(ctx.user.id, input.limit);
      }),
  }),

  // ========================================================================
  // META-INTELLIGENCE PROCEDURES
  // ========================================================================
  metaIntelligence: router({
    getLatest: protectedProcedure.query(async ({ ctx }) => {
      return await db.getLatestMetaIntelligence(ctx.user.id);
    }),

    calculate: publicProcedure
      .input(
        z.object({
(Content truncated due to size limit. Use line ranges to read remaining content)