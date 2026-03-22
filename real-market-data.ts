/**
 * Real Market Data Service — IBKR ONLY.
 * All prices and options from IB Gateway (getIBMarketData / getIBOptionsChain).
 */

export interface RealMarketData {
  symbol: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  high: number;
  low: number;
  open: number;
  marketCap: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  timestamp: number;
}

export interface RealOptionsData {
  symbol: string;
  impliedVolatility: number;
  historicalVolatility: number;
  ivRank: number;
  putCallRatio: number;
  optionsVolume: number;
}

const priceCache = new Map<string, { data: RealMarketData; timestamp: number }>();
const optionsCache = new Map<string, { data: RealOptionsData; timestamp: number }>();
const optionPriceCache = new Map<string, { price: number; timestamp: number }>();
const CACHE_TTL = 60000;

export interface DataQualitySummary {
  primarySource: 'ib';
  cacheTtlMs: number;
  priceCacheCount: number;
  optionsCacheCount: number;
  optionPriceCacheCount: number;
  maxAgeMs: number;
  isStale: boolean;
}

export function getDataQuality(): DataQualitySummary {
  const now = Date.now();
  let maxTs = 0;
  for (const { timestamp } of Array.from(priceCache.values())) maxTs = Math.max(maxTs, timestamp);
  for (const { timestamp } of Array.from(optionsCache.values())) maxTs = Math.max(maxTs, timestamp);
  for (const { timestamp } of Array.from(optionPriceCache.values())) maxTs = Math.max(maxTs, timestamp);
  const maxAgeMs = maxTs > 0 ? now - maxTs : 0;
  return {
    primarySource: 'ib',
    cacheTtlMs: CACHE_TTL,
    priceCacheCount: priceCache.size,
    optionsCacheCount: optionsCache.size,
    optionPriceCacheCount: optionPriceCache.size,
    maxAgeMs,
    isStale: maxAgeMs > CACHE_TTL && (priceCache.size > 0 || optionsCache.size > 0),
  };
}

export function getCacheStats(): { price: number; options: number; optionPrice: number } {
  return {
    price: priceCache.size,
    options: optionsCache.size,
    optionPrice: optionPriceCache.size,
  };
}

/** IB only. Use getIBMarketData for prices. */
export async function getRealStockPrice(_symbol: string): Promise<RealMarketData | null> {
  return null;
}

/** IB only. Use getIBOptionsChain for option prices. */
export async function getRealOptionPrice(
  _symbol: string,
  _expiry: string,
  _strike: number,
  _optionType: 'C' | 'P'
): Promise<number | null> {
  return null;
}

/** IB only. Use getIBOptionsChain and derive IV/putCallRatio from it. */
export async function getRealOptionsData(_symbol: string): Promise<RealOptionsData | null> {
  return null;
}

/** IB only. Use IB historical data if needed; otherwise 0. */
export async function getRealTrend(_symbol: string, _days: number = 20): Promise<number> {
  return 0;
}

export const REAL_STOCK_SYMBOLS = [
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'NVDA', 'TSLA',
  'AMD', 'INTC', 'CRM', 'ORCL', 'ADBE', 'NFLX', 'PYPL', 'AVGO', 'CSCO', 'ACN', 'IBM', 'QCOM', 'TXN', 'AMAT', 'MU', 'LRCX', 'KLAC', 'SNPS', 'CDNS', 'ADSK', 'INTU', 'NOW', 'PANW', 'CRWD', 'SNOW', 'DDOG', 'NET', 'MDB', 'PLTR', 'ARM', 'SMCI',
  'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'V', 'MA', 'AXP', 'BLK', 'SCHW', 'BX', 'KKR', 'APO',
  'JNJ', 'UNH', 'PFE', 'MRK', 'ABBV', 'LLY', 'BMY', 'AMGN', 'GILD', 'VRTX', 'REGN', 'MRNA', 'BNTX', 'ILMN', 'DXCM', 'HZNP',
  'WMT', 'HD', 'MCD', 'NKE', 'SBUX', 'TGT', 'COST', 'LOW', 'PG', 'KO', 'PEP', 'PM', 'MO', 'CL', 'EL',
  'CAT', 'BA', 'GE', 'MMM', 'HON', 'UPS', 'RTX', 'LMT', 'DE', 'UNP', 'FDX', 'EMR', 'ITW', 'ETN',
  'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'PSX', 'VLO', 'OXY', 'PXD',
  'DIS', 'CMCSA', 'VZ', 'T', 'TMUS', 'NFLX', 'CHTR',
  'SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'XLE', 'XLK', 'XLV', 'XLI', 'XLP', 'XLY', 'XLB', 'XLU',
  'COIN', 'MARA', 'RIOT', 'SQ', 'SHOP', 'ROKU', 'SNAP', 'UBER', 'LYFT', 'ABNB', 'DASH', 'RBLX', 'U', 'DKNG', 'HOOD', 'SOFI', 'AFRM', 'UPST',
  'MRNA', 'BNTX', 'REGN', 'VRTX', 'GILD', 'BIIB', 'ALNY', 'BMRN',
  'F', 'GM', 'RIVN', 'LCID', 'NIO', 'XPEV', 'LI',
  'ETSY', 'EBAY', 'W', 'BBY', 'DG', 'ROST',
  'UAL', 'DAL', 'AAL', 'LUV', 'MAR', 'HLT', 'BKNG', 'EXPE', 'CCL', 'RCL',
  'AMT', 'PLD', 'CCI', 'EQIX', 'PSA', 'O', 'WELL',
  'LIN', 'APD', 'ECL', 'NEM', 'FCX', 'NUE', 'STLD', 'VMC',
];

export const UNIQUE_SYMBOLS = Array.from(new Set(REAL_STOCK_SYMBOLS));
export { UNIQUE_SYMBOLS as default };
