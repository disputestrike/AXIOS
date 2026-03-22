import axios from 'axios';

/**
 * IB Gateway Market Data Connector
 * Connects to Interactive Brokers Gateway (default port 4002 for paper/simulated)
 * Fetches real-time market data, options chains, and Greeks
 */

interface IBContract {
  conid: number;
  symbol: string;
  secType: string;
  exchange: string;
  currency: string;
}

interface IBMarketData {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  volume: number;
  change?: number;
  changePercent?: number;
  iv?: number;
  bidSize?: number;
  askSize?: number;
  lastTradeTime?: number;
}

interface IBOption {
  conid: number;
  symbol: string;
  strike: number;
  right: 'C' | 'P';
  expiry: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

interface IBOptionsChain {
  underlying: string;
  underlyingPrice: number;
  expirations: string[];
  strikes: number[];
  options: IBOption[];
}

/** Client Portal Gateway base URL: /v1/api (REST API). Use IB_GATEWAY_URL, or build from TWS_HOST/TWS_PORT. */
function getIBGatewayUrl(): string {
  if (process.env.IB_GATEWAY_URL) return process.env.IB_GATEWAY_URL;
  const host = (process.env.TWS_HOST || 'localhost').trim() || 'localhost';
  const port = (process.env.TWS_PORT || '5000').trim() || '5000';
  return `http://${host}:${port}/v1/api`;
}

/** Throttle IB connection failure logs to once per 60s */
let lastIBConnectionLog = 0;
const IB_CONNECTION_LOG_INTERVAL_MS = 60_000;

/** After a 429, don't call the Gateway again for this long (so we stop hammering it from multiple tabs/polling) */
const GATEWAY_429_COOLDOWN_MS = 120_000; // 2 min
let lastGateway429Time = 0;

/** Set 429 cooldown when any gateway request returns 429. Call from catch blocks. */
function set429Cooldown(): void {
  lastGateway429Time = Date.now();
}

/** Axios config for all Client Portal Gateway requests. Uses IB_GATEWAY_COOKIE if set (e.g. api=xxx from browser after login). */
function gatewayRequestConfig() {
  const headers: Record<string, string> = {
    Host: process.env.TWS_HOST || 'localhost',
    'User-Agent': 'AOIX-1/1.0',
    Accept: '*/*',
    Connection: 'keep-alive',
  };
  const cookie = process.env.IB_GATEWAY_COOKIE?.trim();
  if (cookie) headers['Cookie'] = cookie;
  return { timeout: 10000, headers };
}

/** Call /tickle to keep IB Gateway session alive. Run every 45s when cookie is set. */
async function callTickle(): Promise<boolean> {
  if (!process.env.IB_GATEWAY_COOKIE?.trim()) return false;
  const now = Date.now();
  if (now - lastGateway429Time < GATEWAY_429_COOLDOWN_MS) return false;
  try {
    const res = await axios.get(`${getIBGatewayUrl()}/tickle`, {
      ...gatewayRequestConfig(),
      validateStatus: () => true,
    });
    if (res.status === 429) {
      set429Cooldown();
      return false;
    }
    return res.status === 200;
  } catch {
    return false;
  }
}

let tickleIntervalId: ReturnType<typeof setInterval> | null = null;

/** Start periodic /tickle to keep IB session alive. Call once at server startup. */
export function startIBSessionKeepAlive(): void {
  if (tickleIntervalId) return;
  if (!process.env.IB_GATEWAY_COOKIE?.trim()) return;
  const TICKLE_MS = 45_000; // IB recommends pinging to keep session open
  tickleIntervalId = setInterval(async () => {
    const ok = await callTickle();
    if (!ok && process.env.NODE_ENV !== 'test') {
      // Log only occasionally to avoid spam
    }
  }, TICKLE_MS);
  if (process.env.NODE_ENV !== 'test') {
    console.log('[IB] Session keep-alive started (tickle every 45s)');
  }
}

/**
 * Get contract ID (conid) for a stock/ETF symbol.
 * Uses GET /trsrv/stocks (Security Stocks by Symbol) first, then /iserver/secdef/search as fallback.
 */
async function getContractIdForSymbol(symbol: string): Promise<number | null> {
  if (Date.now() - lastGateway429Time < GATEWAY_429_COOLDOWN_MS) return null;
  const base = getIBGatewayUrl();
  const sym = symbol.toUpperCase();

  // 1) GET /trsrv/stocks - "Security Stocks by Symbol" (returns { "SPY": [{ conid, name, ... }] })
  try {
    const res = await axios.get(`${base}/trsrv/stocks`, {
      ...gatewayRequestConfig(),
      params: { symbols: sym },
    });
    const data = res.data;
    const arr = data?.[sym] ?? data?.[symbol] ?? (Array.isArray(data) ? data : null);
    const contract = Array.isArray(arr) && arr.length > 0 ? (arr[0] as { conid?: number }) : null;
    if (contract?.conid != null) return Number(contract.conid);
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 429) set429Cooldown();
    if (axios.isAxiosError(e) && e.response?.status !== 404) {
      console.warn(`[IB] trsrv/stocks failed for ${symbol}:`, e.response?.status ?? e.message);
    }
  }

  // 2) Fallback: POST /iserver/secdef/search
  try {
    const cfg = gatewayRequestConfig();
    const searchRes = await axios.post(
      `${base}/iserver/secdef/search?symbol=${encodeURIComponent(sym)}&sectype=STK`,
      { symbol: sym, name: false },
      { ...cfg, headers: { ...cfg.headers, 'Content-Type': 'application/json' } }
    );
    const data = searchRes.data;
    if (Array.isArray(data) && data.length > 0) {
      const first = data[0] as { conid?: number };
      if (first?.conid != null) return Number(first.conid);
    }
    if (data && typeof data === 'object' && 'conid' in (data as object)) {
      return Number((data as { conid: number }).conid);
    }
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 429) set429Cooldown();
    if (axios.isAxiosError(e) && e.response?.status !== 404) {
      console.warn(`[IB] secdef/search failed for ${symbol}:`, e.response?.status ?? e.message);
    }
  }
  return null;
}

/**
 * Get market data for a symbol
 */
export async function getIBMarketData(symbol: string): Promise<IBMarketData | null> {
  try {
    if (Date.now() - lastGateway429Time < GATEWAY_429_COOLDOWN_MS) return null;
    const conid = await getContractIdForSymbol(symbol);
    if (!conid) {
      console.warn(`[IB] No contract for ${symbol} – trsrv/stocks and secdef/search both returned no conid`);
      return null;
    }

    // Client Portal API: 31=last, 82=change, 83=change%, 84=bid, 85=bidSize, 86=ask, 87=volume, 88=askSize
    const fields = '31,82,83,84,85,86,87,88';
    let raw: Record<string, string | number> = {};
    for (let attempt = 0; attempt < 2; attempt++) {
      const marketRes = await axios.get(`${getIBGatewayUrl()}/iserver/marketdata/snapshot`, {
        ...gatewayRequestConfig(),
        params: { conids: String(conid), fields },
      });
      if (!marketRes.data) {
        if (attempt === 1) {
          console.warn(`[IB] No market data for ${symbol}`);
          return null;
        }
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      const res = marketRes.data;
      // Response can be single object or array of one object
      raw = Array.isArray(res) ? (res[0] as Record<string, string | number>) || {} : (res as Record<string, string | number>) || {};
      const last = raw['31'];
      if (last != null && String(last).length > 0 && !Number.isNaN(Number(last))) break;
      if (attempt === 1) break;
      await new Promise((r) => setTimeout(r, 400));
    }

    const num = (v: string | number | undefined): number => {
      if (v == null) return 0;
      const n = typeof v === 'string' ? parseFloat(String(v).replace(/,/g, '')) : Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const price = num(raw['31']) || num(raw['86']) || num(raw['84']) || 0;
    const bid = num(raw['84']) || 0;
    const ask = num(raw['86']) || 0;
    const volume = num(raw['87']) || 0;
    const change = raw['82'] != null ? num(raw['82']) : undefined;
    const changePercent = raw['83'] != null ? num(raw['83']) : undefined;

    if (price <= 0) {
      const keys = Object.keys(raw).filter((k) => k !== '_updated').slice(0, 15);
      console.warn(`[IB] No price in snapshot for ${symbol} – keys:`, keys.join(', ') || '(none)');
      return null;
    }

    return {
      symbol,
      price,
      bid: bid || price,
      ask: ask || price,
      volume,
      change,
      changePercent,
      iv: undefined,
      bidSize: raw['85'] != null ? num(raw['85']) : undefined,
      askSize: raw['88'] != null ? num(raw['88']) : undefined,
      lastTradeTime: raw['_updated'] != null ? Number(raw['_updated']) : undefined,
    };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 429) set429Cooldown();
    console.error(`[IB] Error fetching market data for ${symbol}:`, error);
    return null;
  }
}

/** YYYYMMDD → MMMYY (e.g. 20260130 → JAN26) for /iserver/secdef. */
function yyyymmddToMmmYY(s: string): string {
  const y = s.slice(0, 4);
  const m = parseInt(s.slice(4, 6), 10);
  const mon = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][m - 1] ?? "JAN";
  return `${mon}${y.slice(2, 4)}`;
}

/** Fallback: use /iserver/secdef/search → strikes → info (IB recommended flow). */
async function getOptionsViaIserverSecdef(
  symbol: string,
  underConid: number,
  underlyingPrice: number,
  expiryFilter: string[]
): Promise<IBOptionsChain | null> {
  const wantNorm = String(expiryFilter[0] ?? "").replace(/[-/\s]/g, "").slice(0, 8);
  if (wantNorm.length < 8) return null;
  const month = yyyymmddToMmmYY(wantNorm);
  const parseNum = (v: unknown): number => (v != null && !Number.isNaN(Number(v)) ? Number(String(v).replace(/,/g, "")) : 0);

  try {
    const strikesRes = await axios.get(`${getIBGatewayUrl()}/iserver/secdef/strikes`, {
      ...gatewayRequestConfig(),
      params: { conid: underConid, secType: "OPT", month },
    });
    const putStrikes = strikesRes.data?.put as number[] | undefined;
    const callStrikes = strikesRes.data?.call as number[] | undefined;
    const strikes = [...new Set([...(putStrikes ?? []), ...(callStrikes ?? [])])].filter(
      (s) => Math.abs(s - underlyingPrice) <= underlyingPrice * 0.5
    );
    if (strikes.length === 0) return null;

    const options: IBOption[] = [];
    for (const right of ["C", "P"] as const) {
      for (const strike of strikes.slice(0, 15)) {
        try {
          const infoRes = await axios.get(`${getIBGatewayUrl()}/iserver/secdef/info`, {
            ...gatewayRequestConfig(),
            params: { conid: underConid, secType: "OPT", month, strike, right, exchange: "SMART" },
          });
          const arr = Array.isArray(infoRes.data) ? infoRes.data : [];
          for (const c of arr) {
            const mat = String(c.maturityDate ?? "").replace(/[-/\s]/g, "").slice(0, 8);
            if (mat !== wantNorm) continue;
            const conid = c.conid;
            let bid = 0, ask = 0, last = 0;
            try {
              const snap = await axios.get(`${getIBGatewayUrl()}/iserver/marketdata/snapshot`, {
                ...gatewayRequestConfig(),
                params: { conids: String(conid), fields: "31,84,86" },
              });
              const d = Array.isArray(snap.data) ? snap.data[0] : snap.data;
              bid = parseNum((d as Record<string, unknown>)?.["84"]) || 0;
              ask = parseNum((d as Record<string, unknown>)?.["86"]) || 0;
              last = parseNum((d as Record<string, unknown>)?.["31"]) || bid || ask || 0;
            } catch { /* optional */ }
            options.push({
              conid,
              symbol: `${symbol} ${wantNorm} ${strike} ${right}`,
              strike: Number(strike),
              right,
              expiry: wantNorm,
              bid,
              ask,
              last: last || bid || ask || 0,
              volume: 0,
              openInterest: 0,
              impliedVolatility: 0,
              delta: 0,
              gamma: 0,
              theta: 0,
              vega: 0,
            });
          }
        } catch { /* skip strike */ }
      }
    }
    if (options.length === 0) {
      console.warn(`[IB] iserver/secdef fallback for ${symbol} ${wantNorm}: strikes/info returned no options.`);
      return null;
    }
    return {
      underlying: symbol,
      underlyingPrice,
      expirations: [wantNorm],
      strikes: [...new Set(options.map((o) => o.strike))].sort((a, b) => a - b),
      options,
    };
  } catch (e) {
    console.warn(`[IB] iserver/secdef fallback for ${symbol} ${expiryFilter[0]}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Get options chain for a symbol
 */
export async function getIBOptionsChain(symbol: string, expiryFilter?: string[]): Promise<IBOptionsChain | null> {
  try {
    if (Date.now() - lastGateway429Time < GATEWAY_429_COOLDOWN_MS) {
      console.warn(`[IB] Option chain skipped: in 429 cooldown (wait ~2 min). Symbol: ${symbol}`);
      return null;
    }
    const conid = await getContractIdForSymbol(symbol);
    if (!conid) {
      console.warn(`[IB] No contract found for ${symbol} — trsrv/stocks and secdef/search returned no conid.`);
      return null;
    }

    // Get market data for underlying (Client Portal uses string keys: 31=last, 84=bid, 86=ask)
    const underlyingRes = await axios.get(`${getIBGatewayUrl()}/iserver/marketdata/snapshot`, {
      ...gatewayRequestConfig(),
      params: { conids: String(conid), fields: '31,84,86' },
    });
    const underRaw = Array.isArray(underlyingRes.data) ? underlyingRes.data[0] : underlyingRes.data;
    const parseNum = (v: unknown): number => (v != null && !Number.isNaN(Number(v)) ? Number(String(v).replace(/,/g, '')) : 0);
    const underlyingPrice = parseNum((underRaw as Record<string, unknown>)?.['31']) || parseNum((underRaw as Record<string, unknown>)?.['86']) || parseNum((underRaw as Record<string, unknown>)?.['84']) || 0;

    // Get option chains (trsrv/secdef/schedule — different from scanner API)
    let rawExps: string[] = [];
    try {
      const chainRes = await axios.get(`${getIBGatewayUrl()}/trsrv/secdef/schedule`, {
        ...gatewayRequestConfig(),
        params: { conid, secType: 'OPT' },
        validateStatus: (s) => s === 200 || s === 400,
      });
      if (chainRes.data?.expirations) {
        rawExps = chainRes.data.expirations as string[];
      }
      if (rawExps.length === 0) {
        console.warn(`[IB] trsrv/secdef/schedule for ${symbol} (conid ${conid}): no expirations. Status=${chainRes.status}. Trying iserver fallback if expiryFilter set.`);
      }
    } catch (scheduleErr) {
      const status = axios.isAxiosError(scheduleErr) ? scheduleErr.response?.status : '';
      if (status === 429) set429Cooldown();
      console.warn(`[IB] trsrv/secdef/schedule failed for ${symbol}:`, status || (scheduleErr instanceof Error ? scheduleErr.message : scheduleErr));
    }

    if (rawExps.length === 0 && expiryFilter?.length) {
      const allOptions: IBOption[] = [];
      const allExpirations = new Set<string>();
      const allStrikes = new Set<number>();
      for (const exp of expiryFilter.slice(0, 5)) {
        const chain = await getOptionsViaIserverSecdef(symbol, conid, underlyingPrice, [exp]);
        if (chain?.options?.length) {
          chain.options.forEach((o) => {
            allOptions.push(o);
            allExpirations.add(o.expiry);
            allStrikes.add(o.strike);
          });
        }
      }
      if (allOptions.length > 0) {
        console.warn(`[IB] Option chain for ${symbol} via iserver/secdef fallback: ${allOptions.length} options, expirations ${[...allExpirations].join(", ")}.`);
        return {
          underlying: symbol,
          underlyingPrice,
          expirations: [...allExpirations].sort(),
          strikes: [...allStrikes].sort((a, b) => a - b),
          options: allOptions,
        };
      }
      console.warn(`[IB] Option chain for ${symbol}: iserver fallback for expiries ${expiryFilter.slice(0, 3).join(", ")} returned no options.`);
    }
    if (rawExps.length === 0) {
      console.warn(`[IB] Option chain for ${symbol}: no expirations from schedule and no iserver result. Returning empty.`);
      return { underlying: symbol, underlyingPrice, expirations: [], strikes: [], options: [] };
    }

    const toYyyymmdd = (s: string): string => {
(Content truncated due to size limit. Use line ranges to read remaining content)