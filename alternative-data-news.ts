/**
 * Alternative Data — News (headlines) for symbols.
 * IB only. Optional news API via env; otherwise no external news source.
 */

const NEWS_CACHE = new Map<string, { data: NewsResult; ts: number }>();
const NEWS_TTL_MS = 300_000; // 5 min

export interface NewsResult {
  symbol: string;
  headlines: string[];
  count: number;
  source: "rss" | "api" | "none";
  timestamp: number;
}

/**
 * Fetch recent news headlines for a symbol.
 * Returns empty when no news API is configured (IB-only project; no third-party news).
 */
export async function getNewsForSymbol(symbol: string): Promise<NewsResult> {
  const cacheKey = `news_${symbol}`;
  const cached = NEWS_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < NEWS_TTL_MS) return cached.data;

  const noData: NewsResult = { symbol, headlines: [], count: 0, source: "none", timestamp: Date.now() };
  NEWS_CACHE.set(cacheKey, { data: noData, ts: Date.now() });
  return noData;
}

/** Simple keyword-based sentiment from headlines (-1 to 1) when no sentiment API. */
export function headlineSentimentScore(headlines: string[]): number {
  if (headlines.length === 0) return 0;
  const text = headlines.join(" ").toLowerCase();
  const bullish = /\b(surge|soar|beat|jump|gain|rise|bull|buy|upgrade|strong|record|high)\b/g;
  const bearish = /\b(drop|fall|miss|cut|decline|bear|sell|downgrade|weak|low|loss)\b/g;
  const b = (text.match(bullish) ?? []).length;
  const r = (text.match(bearish) ?? []).length;
  const total = b + r || 1;
  return Math.max(-1, Math.min(1, (b - r) / total * 2));
}
