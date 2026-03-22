/**
 * Unified Trading Router
 * 
 * tRPC API for the unified trading system.
 * Handles engine control, IBKR connection, and monitoring.
 */

import { protectedProcedure, publicProcedure, router } from '../_core/trpc';
import { z } from 'zod';
import { getUnifiedTradingEngine } from '../../trading-core/unified-engine';
import { getIBKRConnection } from '../../trading-core/ibkr-unified';
import { getMarketScanner } from '../../trading-core/market-scanner';

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

const IBKRConnectSchema = z.object({
  sessionToken: z.string().min(10, 'Invalid session token'),
});

const StrikeValidationSchema = z.object({
  symbol: z.string().toUpperCase(),
  expiry: z.string().regex(/^\d{8}$/, 'Expiry must be YYYYMMDD'),
  strike: z.number().positive('Strike must be positive'),
  optionType: z.enum(['C', 'P']),
});

const OptionChainSchema = z.object({
  symbol: z.string().toUpperCase(),
});

// ============================================================================
// ROUTER
// ============================================================================

export const tradingRouter = router({
  // ========================================================================
  // ENGINE CONTROL
  // ========================================================================

  /**
   * Start the autonomous trading engine
   */
  startEngine: protectedProcedure
    .mutation(async () => {
      const engine = getUnifiedTradingEngine();
      
      // Check IBKR connection
      const ibkr = getIBKRConnection();
      if (!ibkr.isAlive()) {
        throw new Error('IBKR Gateway not connected - connect first');
      }

      await engine.start();
      return {
        ok: true,
        message: 'Trading engine started',
        state: engine.getState(),
      };
    }),

  /**
   * Stop the autonomous trading engine
   */
  stopEngine: protectedProcedure
    .mutation(async () => {
      const engine = getUnifiedTradingEngine();
      engine.stop();
      return {
        ok: true,
        message: 'Trading engine stopped',
        state: engine.getState(),
      };
    }),

  /**
   * Get current engine state
   */
  getEngineState: protectedProcedure
    .query(async () => {
      const engine = getUnifiedTradingEngine();
      return engine.getState();
    }),

  /**
   * Get open positions
   */
  getPositions: protectedProcedure
    .query(async () => {
      const engine = getUnifiedTradingEngine();
      const state = engine.getState();
      return state.positions.filter(p => p.status === 'open');
    }),

  /**
   * Get closed positions
   */
  getClosedPositions: protectedProcedure
    .query(async () => {
      const engine = getUnifiedTradingEngine();
      const state = engine.getState();
      return state.positions.filter(p => p.status === 'closed');
    }),

  /**
   * Get trade history
   */
  getTrades: protectedProcedure
    .query(async () => {
      const engine = getUnifiedTradingEngine();
      const state = engine.getState();
      return state.trades;
    }),

  /**
   * Get status log
   */
  getStatusLog: protectedProcedure
    .query(async () => {
      const engine = getUnifiedTradingEngine();
      const state = engine.getState();
      return state.statusLog;
    }),

  /**
   * Reset account (for testing)
   */
  resetAccount: protectedProcedure
    .mutation(async () => {
      const engine = getUnifiedTradingEngine();
      engine.stop();
      
      // Reset by getting new instance
      // In production, would need proper account reset logic
      return {
        ok: true,
        message: 'Account reset (stop engine first)',
      };
    }),

  // ========================================================================
  // IBKR CONNECTION
  // ========================================================================

  /**
   * Connect to IBKR Gateway
   */
  connectIBKR: protectedProcedure
    .input(IBKRConnectSchema)
    .mutation(async ({ input }) => {
      const ibkr = getIBKRConnection();
      
      try {
        const connected = await ibkr.connect(input.sessionToken);
        
        if (!connected) {
          throw new Error('Failed to connect to IBKR Gateway');
        }

        // Get account info
        const account = await ibkr.getAccount();

        return {
          ok: true,
          connected: true,
          account,
          message: `Connected to IBKR account ${account?.accountId}`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          connected: false,
          error: errorMsg,
        };
      }
    }),

  /**
   * Disconnect from IBKR
   */
  disconnectIBKR: protectedProcedure
    .mutation(async () => {
      const ibkr = getIBKRConnection();
      ibkr.disconnect();
      return {
        ok: true,
        message: 'Disconnected from IBKR',
      };
    }),

  /**
   * Get IBKR connection status
   */
  getIBKRStatus: protectedProcedure
    .query(async () => {
      const ibkr = getIBKRConnection();
      
      if (!ibkr.isAlive()) {
        return {
          connected: false,
          account: null,
          message: 'Not connected to IBKR Gateway',
        };
      }

      try {
        const account = await ibkr.getAccount();
        const positions = await ibkr.getPositions();

        return {
          connected: true,
          account,
          positions,
          message: 'Connected to IBKR Gateway',
        };
      } catch (error) {
        return {
          connected: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),

  // ========================================================================
  // MARKET DATA & VALIDATION
  // ========================================================================

  /**
   * Get option chain for a symbol
   */
  getOptionChain: protectedProcedure
    .input(OptionChainSchema)
    .query(async ({ input }) => {
      const ibkr = getIBKRConnection();

      if (!ibkr.isAlive()) {
        throw new Error('IBKR not connected');
      }

      const chain = await ibkr.getOptionChain(input.symbol);
      if (!chain) {
        throw new Error(`Failed to get option chain for ${input.symbol}`);
      }

      // Convert Map to array for JSON serialization
      const strikesArray = Array.from(chain.strikes.entries()).map(([expiry, strikes]) => ({
        expiry,
        strikes: strikes.map(s => ({
          strike: s.strike,
          call: {
            bid: s.call.bid,
            ask: s.call.ask,
            mid: (s.call.bid + s.call.ask) / 2,
            impliedVol: s.call.impliedVol,
            delta: s.call.delta,
            gamma: s.call.gamma,
            theta: s.call.theta,
            vega: s.call.vega,
          },
          put: {
            bid: s.put.bid,
            ask: s.put.ask,
            mid: (s.put.bid + s.put.ask) / 2,
            impliedVol: s.put.impliedVol,
            delta: s.put.delta,
            gamma: s.put.gamma,
            theta: s.put.theta,
            vega: s.put.vega,
          },
        })),
      }));

      return {
        symbol: chain.symbol,
        spot: chain.spot,
        expirations: chain.expirations,
        strikes: strikesArray,
        lastUpdate: chain.lastUpdate,
      };
    }),

  /**
   * Validate strike exists in IBKR
   */
  validateStrike: protectedProcedure
    .input(StrikeValidationSchema)
    .query(async ({ input }) => {
      const ibkr = getIBKRConnection();

      if (!ibkr.isAlive()) {
        return {
          valid: false,
          error: 'IBKR not connected',
        };
      }

      try {
        const valid = await ibkr.validateStrike(
          input.symbol,
          input.expiry,
          input.strike,
          input.optionType as 'C' | 'P'
        );

        return {
          valid,
          symbol: input.symbol,
          strike: input.strike,
          expiry: input.expiry,
          optionType: input.optionType,
        };
      } catch (error) {
        return {
          valid: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),

  // ========================================================================
  // MARKET SCANNING
  // ========================================================================

  /**
   * Scan universe for opportunities
   */
  scanMarket: protectedProcedure
    .mutation(async () => {
      const scanner = getMarketScanner();

      try {
        const result = await scanner.scan(true); // Force refresh

        return {
          ok: true,
          timestamp: result.timestamp,
          opportunities: result.opportunities,
          stats: {
            scannedSymbols: result.scannedSymbols,
            validatedStrikes: result.validatedStrikes,
            rejectedStrikes: result.rejectedStikes,
            topOpportunities: result.opportunities.length,
          },
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),

  /**
   * Get opportunities for specific symbol
   */
  getSymbolOpportunities: protectedProcedure
    .input(z.object({ symbol: z.string().toUpperCase() }))
    .query(async ({ input }) => {
      const scanner = getMarketScanner();

      try {
        return await scanner.getSymbolOpportunities(input.symbol, 10);
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : String(error));
      }
    }),

  // ========================================================================
  // HEALTH & STATUS
  // ========================================================================

  /**
   * System health check
   */
  healthCheck: publicProcedure
    .query(async () => {
      const engine = getUnifiedTradingEngine();
      const ibkr = getIBKRConnection();
      const scanner = getMarketScanner();

      const engineState = engine.getState();

      return {
        timestamp: new Date().toISOString(),
        engine: {
          running: engineState.isRunning,
          positions: engineState.positions.length,
          balance: engineState.accountBalance,
          pnl: engineState.totalPnL,
          cycleCount: engineState.cycleCount,
        },
        ibkr: {
          connected: ibkr.isAlive(),
          mode: engineState.ibkrMode,
        },
        system: {
          ok: true,
          uptime: process.uptime(),
        },
      };
    }),

  /**
   * Detailed system status
   */
  getSystemStatus: protectedProcedure
    .query(async () => {
      const engine = getUnifiedTradingEngine();
      const ibkr = getIBKRConnection();

      const state = engine.getState();

      return {
        engine: {
          isRunning: state.isRunning,
          balance: state.accountBalance,
          equity: state.totalEquity,
          dayPnL: state.dayPnL,
          totalPnL: state.totalPnL,
          positions: state.positions.length,
          openPositions: state.positions.filter(p => p.status === 'open').length,
          closedPositions: state.positions.filter(p => p.status === 'closed').length,
          cycleCount: state.cycleCount,
          lastScanTime: state.lastScanTime,
          lastUpdate: state.lastUpdate,
        },
        ibkr: {
          connected: ibkr.isAlive(),
          mode: state.ibkrMode,
        },
        risk: {
          maxRiskPerTrade: state.riskMetrics.maxRiskPerTrade,
          currentExposure: state.riskMetrics.currentExposure,
          dailyLossLimit: state.riskMetrics.dailyLossLimit,
          currentDailyLoss: state.riskMetrics.currentDailyLoss,
          killSwitch: state.riskMetrics.killSwitchActive,
        },
        opportunities: {
          count: state.lastOpportunities.length,
          topScore: state.lastOpportunities[0]?.score ?? 0,
        },
      };
    }),
});

export type TradingRouter = typeof tradingRouter;
