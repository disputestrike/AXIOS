/**
 * Alternative Data Hooks (Hedge Fund Style)
 * Sentiment (API or headline-derived) + news headlines + flow. Beyond basic: news RSS + keyword sentiment when no API.
 */

import { getNewsForSymbol, headlineSentimentScore } from "./alternative-data-news";

export interface SentimentSignal {
  score: number;    // -1 to 1 (bearish to bullish)
  strength: number; // 0–1
  source: string;
  timestamp: number;
}

export interface FlowSignal {
  putCallRatio: number;
  unusualVolume: boolean;
  impliedMovePercent: number;
  source: string;
}

const SENTIMENT_CACHE = new Map<string, { data: SentimentSignal; ts: number }>();
const SENTIMENT_TTL = 300_000; // 5 min

/**
 * Get sentiment for a symbol. 10/10: plug point via SENTIMENT_API_URL (GET ?symbol=XXX, JSON { score, strength }).
 * If unset, returns neutral stub. Cost: $0 (stub) or ~$100/mo for Twitter/Reddit APIs.
 */
export async function getSentimentForSymbol(symbol: string): Promise<SentimentSignal> {
  const cached = SENTIMENT_CACHE.get(symbol);
  if (cached && Date.now() - cached.ts < SENTIMENT_TTL) return cached.data;

  const apiUrl = process.env.SENTIMENT_API_URL?.trim();
  if (apiUrl) {
    try {
      const url = `${apiUrl}${apiUrl.includes('?') ? '&' : '?'}symbol=${encodeURIComponent(symbol)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        const score = Math.max(-1, Math.min(1, Number(data?.score ?? 0)));
        const strength = Math.max(0, Math.min(1, Number(data?.strength ?? 0)));
        const out: SentimentSignal = {
          score,
          strength,
          source: 'api',
          timestamp: Date.now(),
        };
        SENTIMENT_CACHE.set(symbol, { data: out, ts: Date.now() });
        return out;
      }
    } catch (e) {
      console.warn(`[AlternativeData] Sentiment API failed for ${symbol}:`, e);
    }
  }

  // Beyond basic: derive sentiment from news headlines when no API
  try {
    const news = await getNewsForSymbol(symbol);
    if (news.headlines.length > 0) {
      const score = headlineSentimentScore(news.headlines);
      const strength = Math.min(0.8, 0.2 + news.headlines.length * 0.05);
      const out: SentimentSignal = {
        score,
        strength,
        source: 'news_headlines',
        timestamp: Date.now(),
      };
      SENTIMENT_CACHE.set(symbol, { data: out, ts: Date.now() });
      return out;
    }
  } catch (e) {
    console.warn(`[AlternativeData] News fallback failed for ${symbol}:`, (e as Error).message);
  }

  const noData: SentimentSignal = {
    score: 0,
    strength: 0,
    source: 'none',
    timestamp: Date.now(),
  };
  SENTIMENT_CACHE.set(symbol, { data: noData, ts: Date.now() });
  return noData;
}

/**
 * Option flow proxy from existing options data (put/call ratio, IV).
 * Real funds use order flow; we use put/call + IV as a cheap proxy for "unusual" activity.
 */
export function getFlowProxyFromOptionsData(
  putCallRatio: number,
  impliedVolatility: number,
  avgIv?: number
): FlowSignal {
  const unusualVolume = putCallRatio > 1.5 || putCallRatio < 0.6; // extreme skew
  const impliedMovePercent = (impliedVolatility || 0.25) * 100 * 0.4; // rough 1-stdev move
  return {
    putCallRatio,
    unusualVolume,
    impliedMovePercent,
    source: 'options_data_proxy',
  };
}

/**
 * Combine sentiment + flow into a single "alternative data" score 0–1 for entry boost/penalty.
 * Use in scanner or engine: entryScore += altDataBoost * 0.1 (cap impact at 10%).
 */
export function getAlternativeDataBoost(sentiment: SentimentSignal, flow: FlowSignal): number {
  let boost = 0;
  if ((sentiment.source !== 'stub' && sentiment.source !== 'none') && sentiment.strength > 0.5) {
    boost += sentiment.score * sentiment.strength * 0.05; // ±5% from sentiment (real data only)
  }
  if (flow.unusualVolume) {
    boost += 0.02; // slight boost when flow is unusual (real or proxy data only)
  }
  return Math.max(-0.1, Math.min(0.1, boost));
}

export interface AlternativeDataSummary {
  sentiment: SentimentSignal;
  news: { headlines: string[]; count: number; source: string };
  flow: FlowSignal;
  /** Combined boost for scoring (-0.1 to 0.1). */
  boost: number;
  timestamp: number;
}

/**
 * One-call alternative data: sentiment (API or headline-derived) + news headlines + flow.
 * Beyond basic: news RSS + keyword sentiment when no sentiment API.
 */
export async function getAlternativeDataSummary(
  symbol: string,
  putCallRatio?: number,
  impliedVolatility?: number
): Promise<AlternativeDataSummary> {
  const [sentiment, news, flow] = await Promise.all([
    getSentimentForSymbol(symbol),
    getNewsForSymbol(symbol),
    Promise.resolve(getFlowProxyFromOptionsData(putCallRatio ?? 1, impliedVolatility ?? 0.25)),
  ]);
  const boost = getAlternativeDataBoost(sentiment, flow);
  return {
    sentiment,
    news: { headlines: news.headlines, count: news.count, source: news.source },
    flow,
    boost,
    timestamp: Date.now(),
  };
}
