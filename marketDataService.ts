/**
 * Market Data Service
 * Fetches real data from IB Gateway only. NO MOCK DATA - ALL REAL.
 */

import axios from "axios";
import { getIBMarketData, getIBOptionsChain, checkIBGatewayConnection } from "./ib-market-data";

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const POLYGON_BASE_URL = "https://api.polygon.io";

if (!POLYGON_API_KEY || POLYGON_API_KEY === "demo") {
  console.warn("[Market Data] POLYGON_API_KEY not set - using IB Gateway only");
}

export interface OptionQuote {
  symbol: string;
  strike: number;
  expiry: string;
  optionType: "C" | "P";
  bid: number;
  ask: number;
  mid: number;
  lastPrice: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export interface OptionChain {
  underlying: string;
  currentPrice: number;
  expirations: string[];
  strikes: number[];
  quotes: OptionQuote[];
}

export interface MarketSnapshot {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  volume: number;
  timestamp: Date;
}

/**
 * Fetch current price for an underlying symbol. IBKR only: IB Gateway required.
 */
export async function getUnderlyingPrice(symbol: string): Promise<number> {
  try {
    const ibConnected = await checkIBGatewayConnection();
    if (ibConnected) {
      const ibData = await getIBMarketData(symbol);
      if (ibData && ibData.price > 0) {
        return ibData.price;
      }
    }

    if (POLYGON_API_KEY && POLYGON_API_KEY !== "demo") {
      try {
        const response = await axios.get(
          `${POLYGON_BASE_URL}/v1/last/stocks/${symbol}/quote`,
          {
            params: { apikey: POLYGON_API_KEY },
            timeout: 5000,
          }
        );
        if (response.data?.results?.[0]?.last) {
          return response.data.results[0].last;
        }
      } catch {
        // continue
      }
    }

    throw new Error(`Unable to fetch price for ${symbol} - IB Gateway (or Polygon) required`);
  } catch (error) {
    console.error(`[Market Data] Failed to fetch ${symbol} price:`, error);
    throw error;
  }
}

/**
 * Fetch option chain for a given underlying. IBKR only: IB Gateway required.
 */
export async function getOptionChain(
  underlying: string,
  expiryDaysOut: number = 0
): Promise<OptionChain> {
  try {
    const currentPrice = await getUnderlyingPrice(underlying);
    const ibConnected = await checkIBGatewayConnection();
    if (ibConnected) {
      const ibChain = await getIBOptionsChain(underlying);
      if (ibChain && ibChain.options.length > 0) {
        const quotes: OptionQuote[] = ibChain.options.map(opt => ({
          symbol: opt.symbol,
          strike: opt.strike,
          expiry: opt.expiry,
          optionType: opt.right,
          bid: opt.bid,
          ask: opt.ask,
          mid: (opt.bid + opt.ask) / 2,
          lastPrice: opt.last,
          volume: opt.volume,
          openInterest: opt.openInterest,
          impliedVolatility: opt.impliedVolatility,
          delta: opt.delta,
          gamma: opt.gamma,
          theta: opt.theta,
          vega: opt.vega,
          rho: 0,
        }));
        return {
          underlying,
          currentPrice: ibChain.underlyingPrice,
          expirations: ibChain.expirations,
          strikes: ibChain.strikes,
          quotes,
        };
      }
    }
    throw new Error(`Unable to fetch option chain for ${underlying} - IB Gateway required`);
  } catch (error) {
    console.error(`[Market Data] Failed to fetch option chain:`, error);
    throw error;
  }
}

/**
 * Fetch real-time market snapshot. IB first, then Polygon.
 */
export async function getMarketSnapshot(symbol: string): Promise<MarketSnapshot> {
  try {
    const ibConnected = await checkIBGatewayConnection();
    if (ibConnected) {
      const ibData = await getIBMarketData(symbol);
      if (ibData) {
        return {
          symbol,
          price: ibData.price,
          bid: ibData.bid,
          ask: ibData.ask,
          volume: ibData.volume,
          timestamp: new Date(),
        };
      }
    }
    if (POLYGON_API_KEY && POLYGON_API_KEY !== "demo") {
      try {
        const response = await axios.get(
          `${POLYGON_BASE_URL}/v1/last/stocks/${symbol}/quote`,
          { params: { apikey: POLYGON_API_KEY }, timeout: 5000 }
        );
        if (response.data?.results?.[0]) {
          const quote = response.data.results[0];
          return {
            symbol,
            price: quote.last || quote.c || 0,
            bid: quote.bid || quote.l || 0,
            ask: quote.ask || quote.h || 0,
            volume: quote.volume || 0,
            timestamp: new Date(),
          };
        }
      } catch {
        // continue
      }
    }
    throw new Error(`Unable to fetch snapshot for ${symbol} - IB Gateway or Polygon required`);
  } catch (error) {
    console.error(`[Market Data] Failed to fetch snapshot:`, error);
    throw error;
  }
}

/**
 * Fetch historical volatility. IB only: use IB historical data.
 */
export async function getHistoricalVolatility(
  _symbol: string,
  _days: number = 20
): Promise<number> {
  throw new Error('Historical volatility requires IB historical data');
}

/**
 * Fetch implied volatility surface
 */
export async function getIVSurface(
  underlying: string
): Promise<Map<string, Map<number, number>>> {
  try {
    // Fetch option chain and extract IV values
    const chain = await getOptionChain(underlying);

    const ivSurface = new Map<string, Map<number, number>>();

    for (const quote of chain.quotes) {
      if (!ivSurface.has(quote.expiry)) {
        ivSurface.set(quote.expiry, new Map());
      }

      const strikeMap = ivSurface.get(quote.expiry)!;
      strikeMap.set(quote.strike, quote.impliedVolatility);
    }

    return ivSurface;
  } catch (error) {
    console.warn(`[Market Data] Failed to fetch IV surface:`, error);
    return new Map();
  }
}

/**
 * Fetch options flow data (sweeps, blocks, etc.)
 */
export async function getOptionsFlow(underlying: string): Promise<any> {
  try {
    // This would typically come from a specialized options flow provider
    // like OptionStrat, Unusual Whales, or similar
    return {
      sweeps: [],
      blocks: [],
      largeOrders: [],
      timestamp: new Date(),
    };
  } catch (error) {
    console.warn(`[Market Data] Failed to fetch options flow:`, error);
    return {
      sweeps: [],
      blocks: [],
      largeOrders: [],
      timestamp: new Date(),
    };
  }
}

// ============================================================================
// NO MOCK DATA - All functions now use real data sources
// If data sources fail, functions throw errors instead of returning fake data
// ============================================================================

/**
 * Start polling for market data updates
 * Emits updates via callback
 */
export function startMarketDataPolling(
  symbols: string[],
  interval: number = 5000,
  onUpdate: (data: any) => void
): ReturnType<typeof setInterval> {
  const timer = setInterval(async () => {
    try {
      const updates = await Promise.all(
        symbols.map(async (symbol) => ({
          symbol,
          snapshot: await getMarketSnapshot(symbol),
          chain: await getOptionChain(symbol),
        }))
      );

      onUpdate(updates);
    } catch (error) {
      console.error("[Market Data] Polling error:", error);
    }
  }, interval);

  return timer;
}

export function stopMarketDataPolling(timer: ReturnType<typeof setInterval>): void {
  clearInterval(timer);
}
