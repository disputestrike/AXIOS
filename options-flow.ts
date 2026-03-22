/**
 * Options Flow — Hedge fund style (Citadel / flow desks)
 * Unusual volume, sweeps, put/call imbalance. Plug point for OPTIONS_FLOW_API_URL.
 * When no API: use put/call + IV from our options data as proxy (already in alternative-data).
 */

export interface OptionsFlowSignal {
  unusualVolume: boolean;
  putCallRatio: number;
  sweepCount: number;
  /** Implied move % from flow/IV */
  impliedMovePercent: number;
  source: "api" | "proxy" | "none";
  timestamp: number;
}

const FLOW_CACHE = new Map<string, { data: OptionsFlowSignal; ts: number }>();
/** FIFO: per-symbol list of cache keys (oldest first) for eviction at MAX_CACHED_PER_SYMBOL */
const FLOW_CACHE_KEYS_BY_SYMBOL = new Map<string, string[]>();
const FLOW_TTL_MS = 120_000; // 2 min
const MAX_CACHED_PER_SYMBOL = 100;

/**
 * Get options flow signal for a symbol.
 * Set OPTIONS_FLOW_API_URL (e.g. Unusual Whales, Cheddar) for real flow; else proxy from options data or none (no fake data).
 */
export async function getUnusualFlow(
  symbol: string,
  putCallRatio?: number,
  impliedVol?: number
): Promise<OptionsFlowSignal> {
  const cacheKey = `${symbol}_${putCallRatio ?? 0}_${impliedVol ?? 0}`;
  const cached = FLOW_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < FLOW_TTL_MS) return cached.data;

  const apiUrl = process.env.OPTIONS_FLOW_API_URL?.trim();
  if (apiUrl) {
    try {
      const url = `${apiUrl}${apiUrl.includes("?") ? "&" : "?"}symbol=${encodeURIComponent(symbol)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = (await res.json()) as {
          unusualVolume?: boolean;
          putCallRatio?: number;
          sweepCount?: number;
          impliedMovePercent?: number;
        };
        const out: OptionsFlowSignal = {
          unusualVolume: Boolean(data?.unusualVolume),
          putCallRatio: Number(data?.putCallRatio) || 1,
          sweepCount: Number(data?.sweepCount) || 0,
          impliedMovePercent: Number(data?.impliedMovePercent) || (impliedVol ?? 25) * 0.4,
          source: "api",
          timestamp: Date.now(),
        };
        setFlowCache(cacheKey, symbol, out);
        return out;
      }
    } catch (e) {
      console.warn("[OptionsFlow] API failed for", symbol, e);
    }
  }

  // Proxy from our data when we have putCallRatio/IV; otherwise no flow data (no fake values)
  const ratio = putCallRatio ?? 1;
  const iv = impliedVol ?? 0.25;
  const hasProxyData = putCallRatio != null || impliedVol != null;
  const out: OptionsFlowSignal = {
    unusualVolume: hasProxyData ? (ratio > 1.5 || ratio < 0.6) : false,
    putCallRatio: ratio,
    sweepCount: 0,
    impliedMovePercent: hasProxyData ? iv * 100 * 0.4 : 0,
    source: hasProxyData ? "proxy" : "none",
    timestamp: Date.now(),
  };
  setFlowCache(cacheKey, symbol, out);
  return out;
}

function setFlowCache(cacheKey: string, symbol: string, data: OptionsFlowSignal): void {
  const ts = Date.now();
  FLOW_CACHE.set(cacheKey, { data, ts });
  let keys = FLOW_CACHE_KEYS_BY_SYMBOL.get(symbol) ?? [];
  keys.push(cacheKey);
  while (keys.length > MAX_CACHED_PER_SYMBOL) {
    const oldest = keys.shift()!;
    FLOW_CACHE.delete(oldest);
  }
  FLOW_CACHE_KEYS_BY_SYMBOL.set(symbol, keys);
}

/** Health: connected (API configured), lastUpdate, alertsCount (cache size), status */
export function getFlowCacheStats(): {
  connected: boolean;
  lastUpdate: number;
  alertsCount: number;
  status: string;
} {
  let lastUpdate = 0;
  let alertsCount = 0;
  for (const [, v] of Array.from(FLOW_CACHE)) {
    alertsCount++;
    if (v.ts > lastUpdate) lastUpdate = v.ts;
  }
  const hasApi = Boolean(process.env.OPTIONS_FLOW_API_URL?.trim());
  return {
    connected: hasApi,
    lastUpdate,
    alertsCount,
    status: hasApi ? (alertsCount > 0 ? "ok" : "idle") : "none",
  };
}

/** Recent flow summary for a symbol (from cache or single fetch). Use for flowScore in signals. */
export async function getRecentFlow(
  symbol: string,
  _minutes = 5,
  putCallRatio?: number,
  impliedVol?: number
): Promise<{
  sweepCount: number;
  blockCount: number;
  averageConfidence: number;
  putCallRatio: number;
  flowScore: number;
}> {
  const flow = await getUnusualFlow(symbol, putCallRatio, impliedVol);
  const confidence = flow.source === "api" ? 0.8 : flow.source === "proxy" ? 0.5 : 0.2;
  const flowScore = Math.min(
    100,
    (flow.sweepCount * 10 + (flow.unusualVolume ? 15 : 0) + confidence * 30)
  );
  return {
    sweepCount: flow.sweepCount,
    blockCount: 0,
    averageConfidence: confidence,
    putCallRatio: flow.putCallRatio,
    flowScore,
  };
}

/** Detect unusual flow type and confidence for a symbol (for signal integration). */
export async function detectUnusualFlow(
  symbol: string,
  putCallRatio?: number,
  impliedVol?: number
): Promise<{
  type: "sweep" | "block" | "split" | "unusual" | "normal";
  confidence: number;
  putCallRatio: number;
  flowScore: number;
}> {
  const flow = await getUnusualFlow(symbol, putCallRatio, impliedVol);
  const flowScore = Math.min(
    100,
    (flow.sweepCount * 10 + (flow.unusualVolume ? 15 : 0) + (flow.source === "api" ? 20 : 10))
  );
  if (flowScore < 20)
    return {
      type: "normal",
      confidence: 0,
      putCallRatio: flow.putCallRatio,
      flowScore,
    };
  const type =
    flow.sweepCount > 0 ? "sweep" : flow.unusualVolume ? "unusual" : "normal";
  const confidence = Math.min(100, flowScore * 0.5 + (flow.source === "api" ? 30 : 15));
  return {
    type,
    confidence,
    putCallRatio: flow.putCallRatio,
    flowScore,
  };
}
