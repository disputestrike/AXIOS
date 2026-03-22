import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { dbTradeService } from "../db-trade-service";
import { getBreakevens, getMaxLossEstimate, getMaxProfitEstimate } from "../risk-metrics";
import { aggregatePortfolioRisk, stressPortfolioRisk, type OpenPositionForRisk } from "../portfolio-risk";

/**
 * In-memory paper trading state
 * Persists across requests but resets on server restart
 */
interface PaperTrade {
  tradeId: string;
  userId: string;
  symbol: string;
  expiry: string;
  strike: number;
  optionType: "C" | "P";
  action: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  entryTime: Date;
  exitPrice?: number;
  exitTime?: Date;
  pnl?: number;
  status: "OPEN" | "CLOSED";
  /** Multi-leg strategy: same comboId on all legs so we can close entire strategy at once */
  comboId?: string;
  /** Structure type (e.g. iron_condor, calendar_spread) for display and close-strategy */
  structureType?: string;
}

// Global paper trading state
const paperTrades: PaperTrade[] = [];
let accountValue = 100000;
let buyingPower = 400000;

/** Last order summary for trade log — exactly what was traded (structure + each leg). Keyed by userId. */
interface LastOrderSummary {
  message: string;
  structureType: string;
  legsCount: number;
  legsDetail: Array<{ strike: number; optionType: string; action: string; fillPrice: number; quantity: number }>;
  symbol: string;
  quantity: number;
  filledTime: Date;
  orderId: string;
  /** Total cost in USD (debit to open; credit if net credit). */
  totalCost: number;
}
const lastOrderByUser: Map<string, LastOrderSummary> = new Map();

const INITIAL_ACCOUNT = 100000;
const INITIAL_BUYING_POWER = 400000;

function safeNum(n: unknown, fallback: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

/** Get current price for an option position (option premium, not underlying). Returns entryPrice if unavailable so P&L stays sane. */
async function getCurrentOptionPrice(t: PaperTrade): Promise<number> {
  try {
    const { getIBOptionsChain } = await import('../ib-market-data');
    const chain = await getIBOptionsChain(t.symbol);
    if (!chain?.options?.length) return t.entryPrice;
    const opt = chain.options.find(
      (o) => o.expiry === t.expiry && o.strike === t.strike && o.right === t.optionType
    );
    if (!opt) return t.entryPrice;
    const mid = opt.bid > 0 || opt.ask > 0 ? (opt.bid + opt.ask) / 2 : opt.last;
    return mid > 0 ? mid : t.entryPrice;
  } catch {
    return t.entryPrice;
  }
}

/** Get fill price for a single option leg (for multi-leg structures). Uses REAL prices per expiry. */
async function getFillPriceForLeg(symbol: string, expiry: string, strike: number, optionType: "C" | "P"): Promise<number> {
  try {
    const { getIBOptionsChain } = await import('../ib-market-data');
    const chain = await getIBOptionsChain(symbol);
    if (chain?.options?.length) {
      const opt = chain.options.find(
        (o) => o.expiry === expiry && o.strike === strike && o.right === optionType
      );
      if (opt) {
        const mid = opt.bid > 0 || opt.ask > 0 ? (opt.bid + opt.ask) / 2 : opt.last;
        if (mid > 0) return mid;
      }
    }
  } catch {
    // IB only
  }
  try {
    const { getRealOptionPrice } = await import('../real-market-data');
    const realPrice = await getRealOptionPrice(symbol, expiry, strike, optionType);
    if (realPrice != null && realPrice > 0) return realPrice;
  } catch {
    // ignore
  }
  try {
    const { getIBMarketData } = await import('../ib-market-data');
    const ibData = await getIBMarketData(symbol);
    if (ibData?.price != null && ibData.price > 0) {
      const intrinsic = optionType === 'C'
        ? Math.max(0, ibData.price - strike)
        : Math.max(0, strike - ibData.price);
      const daysToExpiry = daysFromExpiry(expiry);
      const timeValue = Math.max(0.1, 0.02 * ibData.price * Math.sqrt(daysToExpiry / 365));
      const fill = Math.max(0.50, intrinsic + timeValue * 0.5);
      return fill;
    }
  } catch {
    // ignore
  }
  return 0.50; // minimum sane option price (never use 0.01)
}

function daysFromExpiry(expiryStr: string): number {
  if (!/^\d{8}$/.test(expiryStr)) return 30;
  const y = parseInt(expiryStr.slice(0, 4), 10);
  const m = parseInt(expiryStr.slice(4, 6), 10) - 1;
  const d = parseInt(expiryStr.slice(6, 8), 10);
  const exp = new Date(y, m, d);
  const now = new Date();
  return Math.max(0, Math.ceil((exp.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
}

/** One option leg for a multi-leg order. expiry optional; quantity defaults to order quantity (butterfly uses 1,2,1). */
interface OrderLeg {
  strike: number;
  optionType: "C" | "P";
  action: "BUY" | "SELL";
  expiry?: string;
  quantity?: number;
}

/** Given YYYYMMDD string, return YYYYMMDD for 7 days earlier (for calendar/diagonal near-term). */
function nearExpiryFrom(expiryStr: string): string {
  if (!/^\d{8}$/.test(expiryStr)) return expiryStr;
  const y = parseInt(expiryStr.slice(0, 4), 10);
  const m = parseInt(expiryStr.slice(4, 6), 10) - 1;
  const d = parseInt(expiryStr.slice(6, 8), 10);
  const date = new Date(y, m, d);
  date.setDate(date.getDate() - 7);
  const ny = date.getFullYear();
  const nm = String(date.getMonth() + 1).padStart(2, "0");
  const nd = String(date.getDate()).padStart(2, "0");
  return `${ny}${nm}${nd}`;
}

/** All structure types the scanner/strategies can recommend — every one maps to legs. */
const STRUCTURE_ALIASES: Record<string, string> = {
  cash_secured_put: "cash_secured_put",
  csp: "cash_secured_put",
  covered_call: "covered_call",
  cc: "covered_call",
  vertical_call_spread: "vertical_call_spread",
  vertical_put_spread: "vertical_put_spread",
  iron_condor: "iron_condor",
  iron_butterfly: "iron_butterfly",
  calendar_spread: "calendar_spread",
  calendar: "calendar_spread",
  diagonal_spread: "diagonal_spread",
  diagonal: "diagonal_spread",
  straddle: "straddle",
  strangle: "strangle",
  butterfly: "butterfly",
  call_spread: "vertical_call_spread",
  put_spread: "vertical_put_spread",
};

/** Options for getLegsForStructure (e.g. true diagonal = different far strike). */
interface LegsOptions {
  /** For diagonal spread only: far-dated leg strike = center + this offset (default 0 = calendar-style same strike). */
  diagonalFarStrikeOffset?: number;
}

/** Expand recommended structure into legs. center = at-the-money strike. inputExpiry = YYYYMMDD. */
function getLegsForStructure(
  structureType: string,
  center: number,
  direction: "bullish" | "bearish",
  inputExpiry: string,
  options?: LegsOptions
): OrderLeg[] {
  const w = 5;
  const norm = (structureType || "").toLowerCase().replace(/\s+/g, "_");
  const key = STRUCTURE_ALIASES[norm] ?? norm;

  // ——— Single-leg (wheel / income) ———
  if (key === "cash_secured_put") {
    return [{ strike: center, optionType: "P", action: "SELL" }];
  }
  if (key === "covered_call") {
    return [{ strike: center, optionType: "C", action: "SELL" }];
  }

  // ——— Vertical spreads ———
  if (key === "vertical_call_spread") {
    if (direction === "bullish") {
      return [
        { strike: center, optionType: "C", action: "BUY" },
        { strike: center + w, optionType: "C", action: "SELL" },
      ];
    }
    return [
      { strike: center, optionType: "C", action: "SELL" },
      { strike: center + w, optionType: "C", action: "BUY" },
    ];
  }
  if (key === "vertical_put_spread") {
    if (direction === "bullish") {
      return [
        { strike: center, optionType: "P", action: "SELL" },
        { strike: center - w, optionType: "P", action: "BUY" },
      ];
    }
    return [
      { strike: center - w, optionType: "P", action: "BUY" },
      { strike: center, optionType: "P", action: "SELL" },
    ];
  }

  // ——— Condor / butterfly (symmetric wings: w each side, 2w between short strikes) ———
  if (key === "iron_condor") {
    // Standard iron condor: BUY put @ center-2w, SELL put @ center-w, SELL call @ center+w, BUY call @ center+2w
    return [
      { strike: center - 2 * w, optionType: "P", action: "BUY" },
      { strike: center - w, optionType: "P", action: "SELL" },
      { strike: center + w, optionType: "C", action: "SELL" },
      { strike: center + 2 * w, optionType: "C", action: "BUY" },
    ];
  }
  if (key === "iron_butterfly") {
    // Short straddle (SELL put/call @ center) + long wings (BUY put @ center-w, BUY call @ center+w); credit
    return [
      { strike: center - w, optionType: "P", action: "BUY" },
      { strike: center, optionType: "P", action: "SELL" },
      { strike: center, optionType: "C", action: "SELL" },
      { strike: center + w, optionType: "C", action: "BUY" },
    ];
  }
  if (key === "butterfly") {
    // Call butterfly: buy 1 low, sell 2 mid, buy 1 high (quantity per leg)
    return [
      { strike: center - w, optionType: "C", action: "BUY", quantity: 1 },
      { strike: center, optionType: "C", action: "SELL", quantity: 2 },
      { strike: center + w, optionType: "C", action: "BUY", quantity: 1 },
    ];
  }

  // ——— Straddle / strangle ———
  if (key === "straddle") {
    return [
      { strike: center, optionType: "C", action: "BUY" },
      { strike: center, optionType: "P", action: "BUY" },
    ];
  }
  if (key === "strangle") {
    return [
      { strike: center - w, optionType: "P", action: "BUY" },
      { strike: center + w, optionType: "C", action: "BUY" },
    ];
  }

  // ——— Time spreads. Calendar = same strike; diagonal = optional different far strike (true diagonal). ———
  // Calendar: net debit always (far-dated costs more). Diagonal with diagonalFarStrikeOffset = different strike + expiry.
  if (key === "calendar_spread" || key === "diagonal_spread") {
    const nearExp = nearExpiryFrom(inputExpiry);
    const ot = direction === "bullish" ? "C" : "P";
    const farStrike = (key === "diagonal_spread" && options?.diagonalFarStrikeOffset != null)
      ? center + options.diagonalFarStrikeOffset
      : center;
    return [
      { strike: center, optionType: ot, action: "SELL", expiry: nearExp },
      { strike: farStrike, optionType: ot, action: "BUY", expiry: inputExpiry },
    ];
  }

  return [];
}

const W = 5; // strike width for spreads

/** Snap a strike to the nearest available in the chain (avoids "No options for strike X" when chain has 72.5, 75, etc.). */
function snapStrikeToNearest(strike: number, availableStrikes: number[]): number {
  if (!availableStrikes?.length) return strike;
  let best = availableStrikes[0]!;
  let bestDist = Math.abs(strike - best);
  for (const s of availableStrikes) {
    const d = Math.abs(strike - s);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

/**
 * Omega-0 IBKR Execution Router
 * All trading (paper and live) goes through IBKR Gateway. No mock or in-memory execution.
 */
export const omega0Router = router({
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const openTrades = paperTrades.filter(t => t.userId === String(ctx.user.id) && t.status === "OPEN");
    const totalTrades = paperTrades.filter(t => t.userId === String(ctx.user.id));
    const safeAccount = safeNum(accountValue, INITIAL_ACCOUNT);
    if (!Number.isFinite(accountValue)) accountValue = safeAccount;
    try {
      const { updateDrawdown } = await import("../drawdown-limiter");
      updateDrawdown(safeAccount);
    } catch {
      // non-fatal
    }
    let connected = false;
    const gatewayPort = process.env.TWS_PORT || "5000";
    const gatewayHost = process.env.TWS_HOST || "localhost";
    const gatewayUrl = `http://${gatewayHost}:${gatewayPort}`;
    let message = `Connect IBKR Gateway to trade. App checks ${gatewayUrl}/v1/api (Client Portal Gateway uses port 5000).`;
    try {
      const { checkIBGatewayConnection } = await import("../ib-orders");
      connected = await checkIBGatewayConnection();
      message = connected
        ? "Connected to IBKR Gateway — paper and live orders go through Gateway."
        : `Not connected. Start Client Portal Gateway, open ${gatewayUrl} in your browser, log in, then click Connect or open the demo app to activate the API session.`;
    } catch {
      // keep connected false, message as above
    }
    return {
      connected,
      paperTrading: true, // UI: paper vs live is account type in IBKR
      accountValue: safeAccount,
      openTrades: openTrades.length,
      totalTrades: totalTrades.length,
      message,
      gatewayUrl: gatewayUrl + "/v1/api",
    };
  }),

  getAccountSummary: protectedProcedure.query(async ({ ctx }) => {
    // Prefer real IB balance when Gateway is connected
    try {
      const { checkIBGatewayConnection, getIBAccountId, getIBPortfolioLedger } = await import("../ib-orders");
      if (await checkIBGatewayConnection()) {
        const accountId = await getIBAccountId();
        if (accountId) {
          const ledger = await getIBPortfolioLedger(accountId);
          if (ledger && ledger.netLiquidationValue > 0) {
            return {
              netLiquidation: ledger.netLiquidationValue,
              buyingPower: ledger.cashBalance,
              cashBalance: ledger.cashBalance,
              stockMarketValue: ledger.stockMarketValue,
              unrealizedPnL: ledger.unrealizedPnL,
              realizedPnL: ledger.realizedPnL,
              source: "ib" as const,
            };
          }
        }
      }
    } catch (e) {
      console.warn("[Omega0] IB ledger fetch failed, using simulated:", e instanceof Error ? e.message : e);
    }

    // Fallback: in-memory simulated values (original 100k / 400k behavior)
    const openTrades = paperTrades.filter(t => t.userId === String(ctx.user.id) && t.status === "OPEN");
    const unrealizedArr = await Promise.all(openTrades.map(async (t) => {
      const entryPrice = safeNum(t.entryPrice, 0);
      const quantity = safeNum(t.quantity, 0);
      if (entryPrice <= 0) return 0;
      try {
        const currentPrice = await getCurrentOptionPrice(t);
        const pnl = (currentPrice - entryPrice) * quantity * 100;
        return Number.isFinite(pnl) ? pnl : 0;
      } catch (error) {
        console.warn(`[Omega0] Could not fetch option price for ${t.symbol}:`, error);
        return 0;
      }
    }));
    const unrealizedPnL = unrealizedArr.reduce((sum, p) => sum + (Number.isFinite(p) ? p : 0), 0);
    const safeAccount = safeNum(accountValue, INITIAL_ACCOUNT);
    const safeBuying = safeNum(buyingPower, INITIAL_BUYING_POWER);
    if (!Number.isFinite(accountValue)) accountValue = safeAccount;
    if (!Number.isFinite(buyingPower)) buyingPower = safeBuying;
    const netLiq = safeAccount + (Number.isFinite(unrealizedPnL) ? unrealizedPnL : 0);
    return {
      netLiquidation: netLiq,
      buyingPower: safeBuying,
      cashBalance: safeAccount * 0.2,
      stockMarketValue: undefined,
      unrealizedPnL: Number.isFinite(unrealizedPnL) ? unrealizedPnL : 0,
      realizedPnL: undefined,
      source: "simulated" as const,
    };
  }),

  getOptionChain: protectedProcedure
    .input(z.object({ symbol: z.string(), expiryDaysOut: z.number().default(0) }))
    .query(async ({ input }) => {
      // Get real option chain from IB Gateway or market data service; include ivSurfaces and termStructure when IV data available
      try {
        const { getIBOptionsChain } = await import('../ib-market-data');
        const { getOptionChain } = await import('../marketDataService');
        const { fitIVSurface, getTermStructure, setIVSurfaceLastCalibration } = await import('../iv-surface-analyzer');

        // Try IB Gateway first
        const ibChain = await getIBOptionsChain(input.symbol);
        if (ibChain && ibChain.options.length > 0) {
          const base = {
            symbol: ibChain.underlying,
            currentPrice: ibChain.underlyingPrice,
            expirations: ibChain.expirations,
            strikes: ibChain.strikes,
          };
          let ivSurfaces: Array<{ expiry: string; spotPrice: number; fitQuality: number; skewIntercept: number }> = [];
(Content truncated due to size limit. Use line ranges to read remaining content)