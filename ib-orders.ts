/**
 * IBKR Client Portal API – Order placement
 * Places real orders through Interactive Brokers when Gateway is connected.
 */

import axios from "axios";
import {
  checkIBGatewayConnection,
  getIBOptionsChain,
  getIBAccountInfo,
} from "./ib-market-data";

/** Base URL for Client Portal API (same as ib-market-data). */
function getIBGatewayUrl(): string {
  if (process.env.IB_GATEWAY_URL) return process.env.IB_GATEWAY_URL;
  const host = (process.env.TWS_HOST || "localhost").trim() || "localhost";
  const port = (process.env.TWS_PORT || "5000").trim() || "5000";
  return `http://${host}:${port}/v1/api`;
}

function gatewayRequestConfig() {
  const headers: Record<string, string> = {
    Host: process.env.TWS_HOST || "localhost",
    "User-Agent": "AOIX-1/1.0",
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const cookie = process.env.IB_GATEWAY_COOKIE?.trim();
  if (cookie) headers["Cookie"] = cookie;
  return { timeout: 15000, headers };
}

export { checkIBGatewayConnection };

/** Ledger response from IB Client Portal GET /portfolio/{accountId}/ledger. Rate limit ~1 req/5 sec. */
export interface IBPortfolioLedgerResult {
  cashBalance: number;
  netLiquidationValue: number;
  stockMarketValue: number;
  unrealizedPnL: number;
  realizedPnL: number;
}

/**
 * Fetch account balance/ledger from IB Client Portal API.
 * GET /portfolio/{accountId}/ledger returns USD (or base currency) cash, net liquidation, positions value, P&L.
 * Rate limit: ~1 req/5 sec for this endpoint; client refetches every 10s.
 */
export async function getIBPortfolioLedger(
  accountId: string
): Promise<IBPortfolioLedgerResult | null> {
  const base = getIBGatewayUrl();
  try {
    const res = await axios.get<Record<string, Record<string, unknown>>>(
      `${base}/portfolio/${encodeURIComponent(accountId)}/ledger`,
      { ...gatewayRequestConfig(), validateStatus: (s) => s === 200 }
    );
    if (res.status !== 200 || !res.data) return null;
    const ledger = res.data;
    const usd =
      (ledger.USD as Record<string, unknown>) ??
      (ledger.usd as Record<string, unknown>) ??
      (Object.keys(ledger).length > 0 ? (Object.values(ledger)[0] as Record<string, unknown>) : undefined);
    if (!usd) return null;
    const num = (v: unknown): number =>
      v != null && !Number.isNaN(Number(v)) ? Number(v) : 0;
    return {
      cashBalance: num(usd.cashbalance ?? usd.cashBalance),
      netLiquidationValue: num(usd.netliquidationvalue ?? usd.netLiquidationValue),
      stockMarketValue: num(usd.stockmarketvalue ?? usd.stockMarketValue),
      unrealizedPnL: num(usd.unrealizedpnl ?? usd.unrealizedPnL),
      realizedPnL: num(usd.realizedpnl ?? usd.realizedPnL),
    };
  } catch (e) {
    console.warn("[IB Orders] getIBPortfolioLedger failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Get first IB account ID for order placement.
 * Client Portal /iserver/accounts can return array of ids or array of account objects.
 */
export async function getIBAccountId(): Promise<string | null> {
  try {
    const data = await getIBAccountInfo();
    if (!data) return null;
    if (Array.isArray(data)) {
      const first = data[0];
      if (typeof first === "string") return first;
      const id = (first as { id?: string; accountId?: string; acctId?: string })?.id ?? (first as { id?: string; accountId?: string; acctId?: string })?.accountId ?? (first as { id?: string; accountId?: string; acctId?: string })?.acctId;
      return id != null ? String(id) : null;
    }
    const accounts = (data as { accounts?: unknown[] })?.accounts ?? [];
    const first = accounts[0];
    if (typeof first === "string") return first;
    const id = (first as { id?: string; accountId?: string; acctId?: string })?.id ?? (first as { id?: string; accountId?: string; acctId?: string })?.accountId ?? (first as { id?: string; accountId?: string; acctId?: string })?.acctId;
    return id != null ? String(id) : null;
  } catch (e) {
    console.warn("[IB Orders] Failed to get account id:", e);
    return null;
  }
}

export interface PlaceIBOptionOrderInput {
  accountId: string;
  symbol: string;
  expiry: string;
  strike: number;
  optionType: "C" | "P";
  side: "BUY" | "SELL";
  quantity: number;
  orderType?: "MKT" | "LMT";
  limitPrice?: number;
}

export interface PlaceIBOrderResult {
  success: boolean;
  orderId?: string;
  reply?: unknown;
  error?: string;
}

/**
 * Place a single option order via Client Portal API.
 * Uses option conid from options chain; requires Gateway connected and logged in.
 */
export async function placeIBOptionOrder(
  input: PlaceIBOptionOrderInput
): Promise<PlaceIBOrderResult> {
  const base = getIBGatewayUrl();
  try {
    let chain = await getIBOptionsChain(input.symbol, [input.expiry]);
    if (!chain?.options?.length) {
      chain = await getIBOptionsChain(input.symbol);
      if (chain?.options?.length) {
        const norm = (s: string) => String(s || "").replace(/[-/\s]/g, "").slice(0, 8);
        const want = norm(input.expiry);
        const matching = chain.options.filter((o) => norm(o.expiry) === want || norm(o.expiry).startsWith(want.slice(0, 6)));
        if (matching.length > 0) {
          chain = { ...chain, options: matching };
        }
      }
    }
    if (!chain?.options?.length) {
      console.warn(`[IB Orders] No option chain for ${input.symbol} ${input.expiry}. Check server logs above for [IB] chain fetch reason (429 cooldown, schedule failed, or iserver fallback empty).`);
      return {
        success: false,
        error: `No option chain for ${input.symbol} ${input.expiry}. Check symbol, expiry (YYYYMMDD), and that options exist for this date. Connect Gateway and try again. See server logs for [IB] details.`,
      };
    }
    const norm = (s: string) => String(s || "").replace(/[-/\s]/g, "").slice(0, 8);
    const wantExpiry = norm(input.expiry);
    const opt =
      chain.options.find(
        (o) => norm(o.expiry) === wantExpiry && o.strike === input.strike && o.right === input.optionType
      ) ||
      chain.options.find(
        (o) => o.expiry === input.expiry && o.strike === input.strike && o.right === input.optionType
      );
    if (!opt) {
      const sampleExpiries = [...new Set(chain.options.map((o) => o.expiry))].slice(0, 5).join(", ");
      console.warn(`[IB Orders] Option not in chain: ${input.symbol} ${input.expiry} ${input.strike}${input.optionType}. Chain expiries (sample): ${sampleExpiries}.`);
      return {
        success: false,
        error: `Option not found: ${input.symbol} ${input.expiry} ${input.strike}${input.optionType}. Available expirations in chain: ${sampleExpiries}.`,
      };
    }

    const orderType = input.orderType ?? "MKT";
    const body: Record<string, unknown> = {
      acctId: input.accountId,
      conid: opt.conid,
      secType: "OPT",
      orderType,
      side: input.side,
      quantity: input.quantity,
      tif: "DAY",
      ticker: input.symbol,
    };
    if (orderType === "LMT" && input.limitPrice != null) {
      body.price = input.limitPrice;
    }

    const url = `${base}/iserver/account/${encodeURIComponent(input.accountId)}/orders`;
    const res = await axios.post(
      url,
      { orders: [body] },
      { ...gatewayRequestConfig(), validateStatus: () => true }
    );

    if (res.status !== 200) {
      return {
        success: false,
        error: `Gateway returned ${res.status}: ${JSON.stringify(res.data ?? "")}`,
        reply: res.data,
      };
    }

    const data = res.data as { order_id?: string[]; order_ids?: string[]; error?: string };
    const orderId = data?.order_id?.[0] ?? data?.order_ids?.[0];
    if (data?.error) {
      return {
        success: false,
        error: data.error,
        orderId: orderId ? String(orderId) : undefined,
        reply: res.data,
      };
    }

    return {
      success: true,
      orderId: orderId ? String(orderId) : undefined,
      reply: res.data,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[IB Orders] placeIBOptionOrder failed:", msg);
    return {
      success: false,
      error: msg,
    };
  }
}
