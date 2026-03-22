/**
 * Scan Universe — Configurable 10k-ready symbol list.
 * Default: built-in ~200. Env: SCAN_UNIVERSE_URL (JSON array), SCAN_SYMBOLS (comma-separated), SCAN_UNIVERSE_MAX (cap).
 */

import { UNIQUE_SYMBOLS } from "./real-market-data";

const DEFAULT_MAX = 10_000;
const CACHE = new Map<string, { symbols: string[]; ts: number }>();
const CACHE_TTL_MS = 300_000; // 5 min for URL-based

/**
 * Get the scan universe: symbols to scan. Supports 10k+ via env.
 * - SCAN_UNIVERSE_URL: fetch JSON array of strings (or { symbols: string[] }).
 * - SCAN_SYMBOLS: comma-separated list (e.g. "AAPL,MSFT,GOOGL").
 * - SCAN_UNIVERSE_MAX: cap size (default 10000).
 * Else: built-in UNIQUE_SYMBOLS (~200).
 */
export async function getScanUniverse(): Promise<string[]> {
  const max = Math.min(50_000, Math.max(1, Number(process.env.SCAN_UNIVERSE_MAX) || DEFAULT_MAX));

  const url = process.env.SCAN_UNIVERSE_URL?.trim();
  if (url) {
    const cacheKey = `url_${url}`;
    const cached = CACHE.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.symbols.slice(0, max);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "User-Agent": "AOIX/1.0" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as string[] | { symbols?: string[] };
      const list = Array.isArray(data) ? data : (data.symbols ?? []);
      const symbols = list
        .filter((s): s is string => typeof s === "string" && /^[A-Za-z0-9.-]{1,10}$/.test(s.trim()))
        .map((s) => s.trim().toUpperCase())
        .slice(0, max);
      CACHE.set(cacheKey, { symbols, ts: Date.now() });
      return symbols;
    } catch (e) {
      console.warn("[ScanUniverse] URL fetch failed, using default:", (e as Error).message);
    }
  }

  const comma = process.env.SCAN_SYMBOLS?.trim();
  if (comma) {
    const symbols = comma
      .split(/[\s,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0 && /^[A-Za-z0-9.-]{1,10}$/.test(s));
    return Array.from(new Set(symbols)).slice(0, max);
  }

  return UNIQUE_SYMBOLS.slice(0, max);
}

/**
 * Sync version that returns cached or default. Use after one getScanUniverse() call to avoid repeated async.
 */
let lastUniverse: string[] | null = null;

export function getScanUniverseCached(): string[] {
  if (lastUniverse && lastUniverse.length > 0) return lastUniverse;
  return UNIQUE_SYMBOLS;
}

export function setScanUniverseCached(symbols: string[]): void {
  lastUniverse = symbols;
}

/**
 * Size of default built-in universe (for UI/logs).
 */
export function getDefaultUniverseSize(): number {
  return UNIQUE_SYMBOLS.length;
}
