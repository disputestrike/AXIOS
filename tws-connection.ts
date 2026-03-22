import { publicProcedure, router } from '../_core/trpc';
import { z } from 'zod';
import {
  checkTWSConnection,
  getTWSConnectionStatus,
  disconnectTWS,
  initializeTWSConnection,
  setBrowserConfirmedConnected,
} from '../tws-market-data';
import { checkIBGatewayConnectionWithReason, getIBMarketData, getIBGatewayDiagnostic } from '../ib-market-data';

export const twsConnectionRouter = router({
  /**
   * Test if we can get one symbol's price (SPY) – use when scan returns 0 to see if market data works.
   */
  testMarketData: publicProcedure.query(async () => {
    try {
      const data = await getIBMarketData('SPY');
      if (data && data.price > 0) {
        return { ok: true, symbol: 'SPY', price: data.price, error: undefined };
      }
      return { ok: false, symbol: 'SPY', price: undefined, error: 'No price returned (check server console for [IB] messages)' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, symbol: 'SPY', price: undefined, error: msg };
    }
  }),

  /**
   * One-shot diagnostic: gateway URL, cookie set, /iserver/accounts status, and fix steps.
   * Use when Connect fails to show the user exactly what to do.
   */
  getDiagnostic: publicProcedure.query(async () => {
    return getIBGatewayDiagnostic();
  }),

  /**
   * Get current TWS connection status (server check or browser-confirmed) and error reason when not connected.
   */
  getStatus: publicProcedure.query(async () => {
    const cached = getTWSConnectionStatus();
    const result = await checkIBGatewayConnectionWithReason();
    const connected = result.connected || cached;
    return {
      connected,
      host: process.env.TWS_HOST || 'localhost',
      port: parseInt(process.env.TWS_PORT || '5000', 10),
      timestamp: new Date().toISOString(),
      error: result.connected ? undefined : result.error,
      errorCode: result.connected ? undefined : result.errorCode,
    };
  }),

  /**
   * Confirm connection from browser (gateway uses cookie; only browser can send it)
   */
  confirmBrowserConnection: publicProcedure.mutation(async () => {
    setBrowserConfirmedConnected(true);
    return { success: true, connected: true };
  }),

  /**
   * Manually connect to TWS (tries server first; use gear + Configure & Connect for browser-based connect)
   */
  connect: publicProcedure.mutation(async () => {
    try {
      const connected = await initializeTWSConnection();
      if (connected) {
        return {
          success: true,
          message: 'Connected to IB Gateway',
          connected: true,
        };
      }
      const result = await checkIBGatewayConnectionWithReason();
      return {
        success: false,
        message: result.error ?? 'Failed to connect to IB Gateway',
        connected: false,
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        connected: false,
      };
    }
  }),

  /**
   * Manually disconnect from TWS
   */
  disconnect: publicProcedure.mutation(async () => {
    try {
      disconnectTWS();
      return {
        success: true,
        message: 'Disconnected from IB Gateway',
        connected: false,
      };
    } catch (error) {
      return {
        success: false,
        message: `Disconnect error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        connected: false,
      };
    }
  }),

  /**
   * Get connection status (cached)
   */
  getStatusCached: publicProcedure.query(() => {
    return {
      connected: getTWSConnectionStatus(),
      timestamp: new Date().toISOString(),
    };
  }),

  /**
   * Configure TWS host and port (for tunnel setup)
   */
  configure: publicProcedure
    .input(z.object({
      host: z.string(),
      port: z.number(),
    }))
    .mutation(async ({ input }) => {
      try {
        // Update environment variables (empty host = localhost)
        process.env.TWS_HOST = (input.host?.trim() || 'localhost');
        process.env.TWS_PORT = input.port.toString();
        
        console.log(`[TWS] Configuration updated: ${input.host}:${input.port}`);
        
        // Disconnect existing connection
        disconnectTWS();
        
        // Try to connect with new settings
        const connected = await initializeTWSConnection();
        
        return {
          success: true,
          message: `TWS configured to ${input.host}:${input.port}`,
          connected,
          host: input.host,
          port: input.port,
        };
      } catch (error) {
        return {
          success: false,
          message: `Configuration error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          connected: false,
        };
      }
    }),
});
