/**
 * Main App Router
 * 
 * Central tRPC router combining all sub-routers.
 * This is the primary API for the frontend.
 */

import { router } from '../_core/trpc';
import { tradingRouter } from './trading-unified';
import { monitorRouter } from './monitor';

/**
 * Main application router
 * Combine all feature routers here
 */
export const appRouter = router({
  trading: tradingRouter,
  monitor: monitorRouter,
  
  // Add other routers as needed:
  // system: systemRouter,
  // auth: authRouter,
  // data: dataRouter,
});

export type AppRouter = typeof appRouter;
