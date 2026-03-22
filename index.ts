import "dotenv/config";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";

// Load .env.local from project root (folder containing server/) so it works regardless of cwd
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
const envLocalPath = resolve(projectRoot, ".env.local");

if (existsSync(envLocalPath)) {
  console.log("[Env] Loading .env.local from:", envLocalPath);
  const result = config({ path: envLocalPath, override: true });
  if (result.error) {
    console.warn("[Env] Error loading .env.local:", result.error);
  } else {
    console.log("[Env] .env.local loaded successfully");
    console.log("[Env] JWT_SECRET present:", !!process.env.JWT_SECRET);
    console.log("[Env] ANTHROPIC_API_KEY present:", !!process.env.ANTHROPIC_API_KEY);
    console.log("[Env] DATABASE_URL present:", !!process.env.DATABASE_URL);
    console.log("[Env] TWS_PORT:", process.env.TWS_PORT || "5000");
    console.log("[Env] IB_GATEWAY_COOKIE present:", !!process.env.IB_GATEWAY_COOKIE?.trim(), "(required for Gateway Connect)");
  }
} else {
  console.warn("[Env] .env.local not found at:", envLocalPath);
  console.warn("[Env] Copy .env.local.example to .env.local and fill in values, then restart.");
}

// Set NODE_ENV if not already set
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "development";
}
import { exec } from "child_process";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const outcomeStore = process.env.OUTCOME_STORE || "file";
  if (outcomeStore === "sqlite") {
    try {
      const { createSQLiteOutcomeStoreIfRequested } = await import("../outcome-store-sqlite");
      const { setOutcomeStore } = await import("../outcome-log");
      const store = await createSQLiteOutcomeStoreIfRequested();
      if (store) {
        setOutcomeStore(store);
        console.log("[OutcomeStore] Using SQLite (persistent) — trades will improve calibration over time.");
      }
    } catch (e) {
      console.warn("[OutcomeStore] SQLite init skipped:", e);
    }
  } else if (outcomeStore === "file") {
    try {
      const { FileOutcomeStore } = await import("../outcome-store-file");
      const { setOutcomeStore } = await import("../outcome-log");
      const store = new FileOutcomeStore();
      setOutcomeStore(store as import("../outcome-log").OutcomeStore & { getAll?(): import("../outcome-log").TradeOutcome[]; getCount?(): number });
      console.log("[OutcomeStore] Using file (persistent) — trades will improve calibration over time.");
    } catch (e) {
      console.warn("[OutcomeStore] File store init skipped:", e);
    }
  }
  if (outcomeStore === "memory") {
    console.log("[OutcomeStore] Using memory (outcomes lost on restart — set OUTCOME_STORE=file so the system learns from trades).");
  }

  const app = express();
  const server = createServer(app);
  
  // Add CORS headers for local development
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
  
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  
  // Health check endpoint — uses full system.health for readyForTrade and component status
  app.get("/api/health", async (req, res) => {
    try {
      const ctx = await createContext({ req, res, info: undefined as any });
      const caller = appRouter.createCaller(ctx);
      const health = await caller.system.health();
      res.json({
        ok: health.ok,
        status: health.status,
        readyForTrade: health.readyForTrade ?? false,
        timestamp: new Date(health.timestamp).toISOString(),
        components: health.components?.length ?? 0,
      });
    } catch (err) {
      console.error("[Health] system.health failed:", err);
      res.status(503).json({
        ok: false,
        status: "error",
        readyForTrade: false,
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : "Health check failed",
      });
    }
  });

  // Flow API health — connected, lastUpdate, alertsCount, status
  app.get("/api/health/flow-api", async (_req, res) => {
    try {
      const { getFlowCacheStats } = await import("../options-flow");
      const stats = getFlowCacheStats();
      res.json({
        connected: stats.connected,
        lastUpdate: stats.lastUpdate,
        alertsCount: stats.alertsCount,
        status: stats.status,
      });
    } catch (err) {
      res.status(500).json({
        connected: false,
        lastUpdate: 0,
        alertsCount: 0,
        status: "error",
        error: err instanceof Error ? err.message : "Flow health failed",
      });
    }
  });

  // IV surface health — lastCalibration, avgRsquared, status
  app.get("/api/health/iv-surface", async (_req, res) => {
    try {
      const { getIVSurfaceHealth } = await import("../iv-surface-analyzer");
      const health = getIVSurfaceHealth();
      res.json({
        lastCalibration: health.lastCalibration,
        avgRsquared: health.avgRsquared,
        status: health.status,
      });
    } catch (err) {
      res.status(500).json({
        lastCalibration: 0,
        avgRsquared: 0,
        status: "error",
        error: err instanceof Error ? err.message : "IV surface health failed",
      });
    }
  });
  
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    (req, res, next) => {
      console.log("[tRPC Server] Request received:", req.method, req.url, "headers:", {
        origin: req.headers.origin,
        cookie: req.headers.cookie ? "present" : "missing",
      });
      next();
    },
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError: ({ error, path, type }) => {
        console.error("[tRPC Server] Error:", {
          path,
          type,
          message: error.message,
          code: error.code,
          cause: error.cause,
        });
      },
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  return new Promise<{ server: ReturnType<typeof createServer>; port: number }>((resolve) => {
    server.listen(port, async () => {
      const url = "http://localhost:" + port + "/";
      console.log("");
      console.log(">>> Server running: " + url);
      // Start IB session keep-alive (tickle) to prevent "data pulled then gone"
      try {
        const { startIBSessionKeepAlive } = await import("../ib-market-data");
        startIBSessionKeepAlive();
      } catch {
        /* ib-market-data may not load in some setups */
      }
      if (process.env.NODE_ENV !== "test") {
        console.log(">>> Opening browser...");
        console.log("");
      }

      // Auto-open browser in development (not in test)
      if (process.env.NODE_ENV === "development") {
        setTimeout(() => {
          try {
            const cmd =
              process.platform === "win32"
                ? `start "" "${url}"`
                : process.platform === "darwin"
                  ? `open "${url}"`
                  : `xdg-open "${url}"`;
            exec(cmd, (err) => {
              if (err) console.warn("[Server] Could not open browser:", (err as Error).message);
            });
          } catch (e) {
            console.warn("[Server] Could not open browser:", (e as Error).message);
          }
          console.log(">>> If the browser did not open, go to: " + url);
        }, 1500);
      }

      // Auto-start the trading engine in development/demo mode (not in test)
      if (process.env.NODE_ENV !== "test" && (process.env.NODE_ENV !== "production" || process.env.AUTO_START_ENGINE === "true")) {
        try {
          const { getAutoTradingEngine } = await import("../auto-trading-engine");
          const engine = getAutoTradingEngine();
          const state = engine.getState();
          if (!state.isRunning) {
            console.log("[Server] Auto-starting trading engine...");
            engine.start();
            console.log("[Server] Trading engine started successfully");
          } else {
            console.log("[Server] Trading engine already running");
          }
        } catch (error) {
          console.error("[Server] Failed to auto-start trading engine:", error);
        }
      }
      resolve({ server, port });
    });
  });
}

/** Start server and return { server, port } for E2E tests. */
export async function startServerForE2E(): Promise<{ server: ReturnType<typeof createServer>; port: number }> {
  return startServer();
}

if (process.env.NODE_ENV !== "test") {
  startServer().catch(console.error);
}
