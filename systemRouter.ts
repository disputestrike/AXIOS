import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import * as db from "../db";
import { getAutoTradingEngine } from "../auto-trading-engine";
import { getMarketScanner } from "../market-scanner";
import { checkTWSConnection } from "../tws-market-data";
import { runSystemAudit, type AuditTradeInput } from "../system-audit";
import { getLiquidityForAudit } from "../liquidity-for-audit";
import { runRegimeStrategyDiagnostic } from "../regime-strategy-diagnostic";

interface HealthComponent {
  component: string;
  status: 'healthy' | 'warning' | 'error';
  lastCheck: number;
  responseTimeMs?: number;
  error?: string;
  details?: Record<string, any>;
}

// ============================================================================
// CORE INFRASTRUCTURE CHECKS
// ============================================================================

async function checkDatabase(): Promise<HealthComponent> {
  const startTime = Date.now();
  const urlSet = !!(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
  try {
    const dbInstance = await db.getDb();
    const responseTime = Date.now() - startTime;

    if (dbInstance) {
      return {
        component: 'Database',
        status: 'healthy',
        lastCheck: Date.now(),
        responseTimeMs: responseTime,
        details: { connected: true },
      };
    }
    if (urlSet) {
      return {
        component: 'Database',
        status: 'warning',
        lastCheck: Date.now(),
        responseTimeMs: responseTime,
        error: 'MySQL connection failed. Check: (1) MySQL is running, (2) user/password/database in .env.local are correct, (3) stop the server (Ctrl+C) and run pnpm dev again.',
        details: { connected: false, mode: 'fallback', hint: 'Restart the server after fixing .env.local' },
      };
    }
    return {
      component: 'Database',
      status: 'warning',
      lastCheck: Date.now(),
      responseTimeMs: responseTime,
      error: 'DATABASE_URL not set. Add DATABASE_URL=mysql://user:password@localhost:3306/aoix1 to .env.local (same folder as package.json), then stop the server (Ctrl+C) and run pnpm dev again.',
      details: { connected: false, mode: 'fallback', hint: 'File must be named .env.local in the project root' },
    };
  } catch (error) {
    return {
      component: 'Database',
      status: 'error',
      lastCheck: Date.now(),
      responseTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkAPIServer(): Promise<HealthComponent> {
  const startTime = Date.now();
  try {
    const responseTime = Date.now() - startTime;
    return {
      component: 'API Server',
      status: 'healthy',
      lastCheck: Date.now(),
      responseTimeMs: responseTime,
      details: {
        port: process.env.PORT || 3000,
        nodeEnv: process.env.NODE_ENV || 'development',
      },
    };
  } catch (error) {
    return {
      component: 'API Server',
      status: 'error',
      lastCheck: Date.now(),
      responseTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkAuthentication(): Promise<HealthComponent> {
  const startTime = Date.now();
  try {
    const { sdk } = await import("./sdk");
    const responseTime = Date.now() - startTime;
    return {
      component: 'Authentication Service',
      status: 'healthy',
      lastCheck: Date.now(),
      responseTimeMs: responseTime,
      details: { available: true },
    };
  } catch (error) {
    return {
      component: 'Authentication Service',
      status: 'error',
      lastCheck: Date.now(),
      responseTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// TRADING ENGINE CHECKS
// ============================================================================

async function checkTradingEngine(): Promise<HealthComponent> {
  const startTime = Date.now();
  try {
    const engine = getAutoTradingEngine();
    const state = engine.getState();
    const responseTime = Date.now() - startTime;
    
    return {
      component: 'Auto Trading Engine',
      status: state.isRunning ? 'healthy' : 'warning',
      lastCheck: Date.now(),
      responseTimeMs: responseTime,
      details: {
        isRunning: state.isRunning,
        cycleCount: state.cycleCount,
        activePositions: state.positions.filter(p => p.status === 'open').length,
        currentRegime: state.currentRegime,
        accountBalance: state.accountBalance,
      },
    };
  } catch (error) {
    return {
      component: 'Auto Trading Engine',
      status: 'error',
      lastCheck: Date.now(),
      responseTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkEnhancedTradingEngine(): Promise<HealthComponent> {
  const startTime = Date.now();
  try {
    const { EnhancedTradingEngine } = await import("../enhanced-trading-engine");
    const responseTime = Date.now() - startTime;
    return {
      component: 'Enhanced Trading Engine',
      status: 'healthy',
      lastCheck: Date.now(),
      responseTimeMs: responseTime,
      details: { available: true },
    };
  } catch (error) {
    return {
      component: 'Enhanced Trading Engine',
      status: 'warning',
      lastCheck: Date.now(),
      responseTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// MARKET DATA CHECKS
// ============================================================================

async function checkMarketData(): Promise<HealthComponent> {
  const startTime = Date.now();
  const port = process.env.TWS_PORT || '5000';
  const gatewayUrl = `http://localhost:${port}`;
  try {
    const { getIBMarketData, checkIBGatewayConnection } = await import('../ib-market-data');
    const { getDataQuality } = await import('../real-market-data');
    const connected = await checkIBGatewayConnection();
    if (!connected) {
      return {
        component: 'Market Data (IBKR)',
        status: 'warning',
        lastCheck: Date.now(),
        responseTimeMs: Date.now() - startTime,
        error: `IB Gateway not connected. Connect at ${gatewayUrl}`,
        details: { port, gatewayUrl },
      };
    }
    const testData = await getIBMarketData('SPY');
    const responseTime = Date.now() - startTime;
    const dataQuality = getDataQuality();

    if (testData?.price > 0) {
      return {
        component: 'Market Data (IBKR)',
        status: dataQuality.isStale ? 'warning' : 'healthy',
        lastCheck: Date.now(),
        responseTimeMs: responseTime,
        details: {
          provider: 'ibkr',
          testSymbol: 'SPY',
          testPrice: testData.price,
          cacheTtlMs: dataQuality.cacheTtlMs,
          priceCacheCount: dataQuality.priceCacheCount,
          optionsCacheCount: dataQuality.optionsCacheCount,
          maxAgeMs: dataQuality.maxAgeMs,
          isStale: dataQuality.isStale,
        },
      };
    }
    return {
      component: 'Market Data (IBKR)',
      status: 'warning',
      lastCheck: Date.now(),
      responseTimeMs: responseTime,
      error: `No SPY price from IB. Connect Gateway at ${gatewayUrl}`,
      details: { port, gatewayUrl, dataQuality: getDataQuality() },
    };
  } catch (error) {
    return {
      component: 'Market Data (IBKR)',
      status: 'error',
      lastCheck: Date.now(),
      responseTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
      details: { port, gatewayUrl },
    };
  }
}

async function checkMarketDataService(): Promise<HealthComponent> {
  const startTime = Date.now();
  try {
    const marketDataService = await import("../marketDataService");
    const responseTime = Date.now() - startTime;
    return {
      component: 'Market Data Service',
      status: 'healthy',
      lastCheck: Date.now(),
      responseTimeMs: responseTime,
      details: { available: true },
    };
  } catch (error) {
    return {
      component: 'Market Data Service',
      status: 'warning',
      lastCheck: Date.now(),
      responseTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkMarketScanner(): Promise<HealthComponent> {
  const startTime = Date.now();
  try {
    const scanner = getMarketScanner();
    const opportunities = scanner.getTopOpportunities(1);
    const responseTime = Date.now() - startTime;
    
    const engine = getAutoTradingEngine();
    const state = engine.getState();
    
    return {
      component: 'Market Scanner',
      status: 'healthy',
      lastCheck: Date.now(),
      responseTimeMs: responseTime,
      details: {
        cachedOpportunities: opportunities.length,
        lastScan: state.lastScanTime ? new Date(state.lastScanTime).toISOString() : 'Never',
        opportunitiesFound: state.lastOpportunities.length,
      },
    };
  } catch (error) {
    return {
      component: 'Market Scanner',
      status: 'error',
      lastCheck: Date.now(),
      responseTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkMarketUtils(): Promise<HealthComponent> {
  const startTime = Date.now();
  try {
    const { getRealVIX } = await import("../market-utils");
    const vix = await getRealVIX().catch(() => null);
    const responseTime = Date.now() - startTime;
    return {
      component: 'Market Utils',
      status: 'healthy',
      lastCheck: Date.now(),
      responseTimeMs: responseTime,
      details: { vixAvailable: vix !== null },
    };
  } catch (error) {
    return {
      component: 'Market Utils',
      status: 'warning',
      lastCheck: Date.now(),
      responseTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// IBKR/TWS CHECKS
// ============================================================================

async function checkTWSConnectionHealth(): Promise<HealthComponent> {
  const startTime = Date.now();
  try {
    const connected = await checkTWSConnection();
    const responseTime = Date.now() - startTime;
    const host = process.env.TWS_HOST || 'localhost';
    const port = parseInt(process.env.TWS_PORT || '5000', 10);

    return {
      component: 'TWS/IB Gateway',
      status: 'healthy',
      lastCheck: Date.now(),
      responseTimeMs: responseTime,
      details: {
        connected,
        host,
        port,
        note: connected ? 'Connected' : 'IB Gateway required',
      },
      error: undefined,
    };
  } catch (error) {
    return {
      component: 'TWS/IB Gateway',
      status: 'error',
      lastCheck: Date.now(),
      responseTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkTWSAPIClient(): Promise<HealthComponent> {
  const startTime = Date.now();
  try {
    const { TWSAPIClient } = await import("../tws-api-client");
    const responseTime = Date.now() - startTime;
    return {
      component: 'TWS API Client',
      status: 'healthy',
      lastCheck: Date.now(),
      responseTimeMs: responseTime,
      details: { available: true },
    };
  } catch (error) {
    return {
      component: 'TWS API Client',
      status: 'warning',
      lastCheck: Date.now(),
      responseTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkIBKRService(): Promise<HealthComponent> {
  const startTime = Date.now();
  try {
    const { Omega0Engine } = await import("../ibkr");
    const responseTime = Date.now() - startTime;
    return {
      component: 'IBKR Service (Omega-0)',
      status: 'healthy',
      lastCheck: Date.now(),
      responseTimeMs: responseTime,
      details: { available: true },
    };
  } catch (error) {
    return {
      component: 'IBKR Service (Omega-0)',
      status: 'warning',
      lastCheck: Date.now(),
      responseTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkGatewayAdapter(): Promise<HealthComponent> {
  const startTime = Date.now();
  try {
    const { getGatewayAdapter } = await import("../gateway-adapter");
    const { getAutoTradingEngine } = await import("../auto-trading-engine");
    const engine = getAutoTradingEngine();
    const adapter = getGatewayAdapter(engine);
    const responseTime = Date.now() - startTime;
    
    const isLive = adapter?.isLiveMode?.() || false;

    return {
      component: 'Gateway Adapter',
      status: 'healthy',
      lastCheck: Date.now(),
      responseTimeMs: responseTime,
      details: {
        available: true,
        liveMode: isLive,
        mode: isLive ? 'Live' : 'Paper trading',
      },
      error: undefined,
    };
  } catch (error) {
    return {
      component: 'Gateway Adapter',
      status: 'warning',
      lastCheck: Date.now(),
      responseTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
      details: { available: false },
    };
  }
}

// ============================================================================
// SIGNAL & ANALYSIS CHECKS
// ============================================================================

async function checkAdvancedSignals(): Promise<HealthComponent> {
  const startTime = Date.now();
  try {
    const { generateAdvancedSignal } = await import("../advanced-signals");
    const responseTime = Date.now() - startTime;
    return {
      component: 'Advanced Signals',
      status: 'healthy',
      lastCheck: Date.now(),
      responseTimeMs: responseTime,
      details: { available: true },
    };
  } catch (error) {
    return {
      component: 'Advanced Signals',
      status: 'warning',
      lastCheck: Date.now(),
      responseTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkAdaptiveRisk(): Promise<HealthComponent> {
  const startTime = Date.now();
  try {
    const { calculateAdaptiveRisk } = await import("../adaptive-risk");
    const responseTime = Date.now() - startTime;
    return {
      component: 'Adaptive Risk Management',
      status: 'healthy',
      lastCheck: Date.now(),
      responseTimeMs: responseTime,
      details: { available: true },
    };
  } catch (error) {
    return {
      component: 'Adaptive Risk Management',
      status: 'warning',
      lastCheck: Date.now(),
      responseTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkRiskManager(): Promise<HealthComponent> {
  const startTime = Date.now();
  try {
    const engine = getAutoTradingEngine();
    const state = engine.getState();
    const riskMetrics = state.riskMetrics;
    const responseTime = Date.now() - startTime;
    
    return {
      component: 'Risk Manager',
      status: riskMetrics.killSwitchActive ? 'error' : 'healthy',
      lastCheck: Date.now(),
      responseTimeMs: responseTime,
      details: {
        killSwitchActive: riskMetrics.killSwitchActive,