/**
 * Gateway Router
 * tRPC procedures for managing IB Gateway connection
 */

import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getAutoTradingEngine } from "../auto-trading-engine";
import { getGatewayAdapter } from "../gateway-adapter";

export const gatewayRouter = router({
  // Get current Gateway connection status
  getStatus: publicProcedure.query(() => {
    const engine = getAutoTradingEngine();
    const adapter = getGatewayAdapter(engine);
    return adapter.getConnectionStatus();
  }),

  // Get Gateway configuration
  getConfig: protectedProcedure.query(() => {
    const engine = getAutoTradingEngine();
    const adapter = getGatewayAdapter(engine);
    return adapter.getConfig();
  }),

  // Update Gateway configuration
  setConfig: protectedProcedure
    .input(
      z.object({
        host: z.string().optional(),
        port: z.number().optional(),
        clientId: z.number().optional(),
        accountId: z.string().optional(),
        enabled: z.boolean().optional(),
      })
    )
    .mutation(({ input }) => {
      const engine = getAutoTradingEngine();
      const adapter = getGatewayAdapter(engine);
      adapter.setConfig(input);
      return { success: true, config: adapter.getConfig() };
    }),

  // Connect to Gateway
  connect: protectedProcedure.mutation(async () => {
    const engine = getAutoTradingEngine();
    const adapter = getGatewayAdapter(engine);
    const connected = await adapter.connect();
    return {
      success: connected,
      status: adapter.getConnectionStatus(),
    };
  }),

  // Disconnect from Gateway
  disconnect: protectedProcedure.mutation(() => {
    const engine = getAutoTradingEngine();
    const adapter = getGatewayAdapter(engine);
    adapter.disconnect();
    return {
      success: true,
      status: adapter.getConnectionStatus(),
    };
  }),

  // Enable Gateway
  enable: protectedProcedure.mutation(async () => {
    const engine = getAutoTradingEngine();
    const adapter = getGatewayAdapter(engine);
    adapter.enableGateway();
    const connected = await adapter.connect();
    return {
      success: true,
      connected,
      status: adapter.getConnectionStatus(),
    };
  }),

  // Disable Gateway (fall back to paper trading)
  disable: protectedProcedure.mutation(() => {
    const engine = getAutoTradingEngine();
    const adapter = getGatewayAdapter(engine);
    adapter.disableGateway();
    return {
      success: true,
      status: adapter.getConnectionStatus(),
    };
  }),

  // Check if in live mode
  isLiveMode: publicProcedure.query(() => {
    const engine = getAutoTradingEngine();
    const adapter = getGatewayAdapter(engine);
    return {
      isLiveMode: adapter.isLiveMode(),
      isPaperMode: adapter.isPaperMode(),
    };
  }),
});
