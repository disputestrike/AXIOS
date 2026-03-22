
/**
 * TWS Market Data Service
 * Replaces Web API with TCP Socket Protocol for real market data
 */

interface IBMarketData {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  volume: number;
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

let client: any = null;
let connectionPromise: Promise<boolean> | null = null;
let reconnectInterval: NodeJS.Timeout | null = null;
let lastConnectionStatus: boolean = false;
/** Set when the browser successfully reached the gateway (same-origin cookie); server cannot send cookie. */
let browserConfirmedConnected: boolean = false;
const connectionStatusCallbacks: Array<(connected: boolean) => void> = [];

export function setBrowserConfirmedConnected(connected: boolean): void {
  browserConfirmedConnected = connected;
  notifyConnectionStatusChange(connected || lastConnectionStatus);
}

/**
 * Subscribe to connection status changes
 */
export function onConnectionStatusChange(callback: (connected: boolean) => void): void {
  connectionStatusCallbacks.push(callback);
}

/**
 * Notify all subscribers of connection status change
 */
function notifyConnectionStatusChange(connected: boolean): void {
  if (connected !== lastConnectionStatus) {
    lastConnectionStatus = connected;
    console.log(`[TWS] Connection status changed: ${connected ? 'CONNECTED' : 'DISCONNECTED'}`);
    connectionStatusCallbacks.forEach((cb) => cb(connected));
  }
}

/**
 * Start automatic reconnection attempts
 */
export function startAutoReconnect(): void {
  if (reconnectInterval) return;

  reconnectInterval = setInterval(async () => {
    const connected = await checkTWSConnection();
    notifyConnectionStatusChange(connected);
  }, 5000); // Check every 5 seconds
  console.log('[TWS] Auto-reconnect started');
}

/**
 * Stop automatic reconnection
 */
export function stopAutoReconnect(): void {
  if (reconnectInterval) {
    clearInterval(reconnectInterval);
    reconnectInterval = null;
    console.log('[TWS] Auto-reconnect stopped');
  }
}

/**
 * Initialize TWS connection
 * Connects to real IB Gateway for live market data
 */
export async function initializeTWSConnection(): Promise<boolean> {
  try {
    const { checkIBGatewayConnection, getIBMarketData } = await import('./ib-market-data');
    const connected = await checkIBGatewayConnection();
    
    if (connected) {
      console.log('[TWS] Connected to IB Gateway - Using REAL market data');
      notifyConnectionStatusChange(true);
      return true;
    } else {
      console.warn('[TWS] IB Gateway not available - Real market data unavailable');
      notifyConnectionStatusChange(false);
      return false;
    }
  } catch (error) {
    console.error('[TWS] Connection initialization failed:', error);
    notifyConnectionStatusChange(false);
    return false;
  }
}

/**
 * Get market data for a symbol
 * Uses real IB Gateway data
 */
export async function getTWSMarketData(symbol: string): Promise<IBMarketData | null> {
  try {
    const { getIBMarketData } = await import('./ib-market-data');
    const data = await getIBMarketData(symbol);
    
    if (data) {
      return {
        symbol: data.symbol,
        price: data.price,
        bid: data.bid,
        ask: data.ask,
        volume: data.volume,
        iv: data.iv,
        bidSize: data.bidSize,
        askSize: data.askSize,
        lastTradeTime: data.lastTradeTime,
      };
    }
    
    return null;
  } catch (error) {
    console.error(`[TWS] Error fetching market data for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get market data for multiple symbols
 */
export async function getTWSMarketDataBatch(symbols: string[]): Promise<Map<string, IBMarketData>> {
  const results = new Map<string, IBMarketData>();

  for (const symbol of symbols) {
    try {
      const data = await getTWSMarketData(symbol);
      if (data) {
        results.set(symbol, data);
      }
    } catch (error) {
      console.warn(`[TWS] Error fetching ${symbol}:`, error);
    }
  }

  return results;
}

/**
 * Get options chain for a symbol
 * Uses real IB Gateway data
 */
export async function getTWSOptionsChain(
  symbol: string,
  expiryFilter?: string[]
): Promise<IBOptionsChain | null> {
  try {
    const { getIBOptionsChain } = await import('./ib-market-data');
    const chain = await getIBOptionsChain(symbol, expiryFilter);
    
    if (chain && chain.options.length > 0) {
      return chain;
    }
    
    // IB Gateway is required for options chains
    console.warn(`[TWS] No options chain available for ${symbol} - IB Gateway connection required`);
    return null;
  } catch (error) {
    console.error(`[TWS] Error fetching options chain:`, error);
    return null;
  }
}

/**
 * Check if TWS is connected
 */
export async function checkTWSConnection(): Promise<boolean> {
  try {
    const { checkIBGatewayConnection } = await import('./ib-market-data');
    return await checkIBGatewayConnection();
  } catch (error) {
    console.error('[TWS] Connection check failed:', error);
    return false;
  }
}

/**
 * Get TWS client instance
 */
export function getTWSClientInstance(): any {
  return null;
}

/**
 * Disconnect from TWS
 */
export function disconnectTWS(): void {
  browserConfirmedConnected = false;
  if (client) {
    client = null;
    connectionPromise = null;
  }
  notifyConnectionStatusChange(false);
}

/**
 * Get current connection status (server check or browser-confirmed)
 */
export function getTWSConnectionStatus(): boolean {
  return lastConnectionStatus || browserConfirmedConnected;
}

/**
 * Place an order through TWS
 * Uses real IB Gateway for order execution
 */
export async function placeTWSOrder(
  symbol: string,
  action: 'BUY' | 'SELL',
  quantity: number,
  orderType: string,
  limitPrice?: number
): Promise<number> {
  try {
    const { getGatewayAdapter } = await import('./gateway-adapter');
    const { getAutoTradingEngine } = await import('./auto-trading-engine');
    const engine = getAutoTradingEngine();
    const adapter = getGatewayAdapter(engine);
    
    if (!adapter.isLiveMode()) {
      throw new Error('IB Gateway not connected - Cannot place real orders');
    }
    
    // Use GatewayAdapter for real order execution
    const position = {
      symbol,
      quantity,
      entryPrice: limitPrice || 0,
      direction: action === 'BUY' ? 'long' : 'short',
    };
    
    const result = await adapter.executePosition(position as any);
    
    if (!result.success) {
      throw new Error(result.error || 'Order execution failed');
    }
    
    // Return order ID: numeric from adapter when available, else server-side id for tracking
    if (result.orderId != null) {
      const n = typeof result.orderId === 'string' ? parseInt(result.orderId, 10) : result.orderId;
      return Number.isFinite(n) ? n : Date.now();
    }
    return Date.now();
  } catch (error) {
    console.error('[TWS] Order placement failed:', error);
    throw error;
  }
}

/**
 * Get historical data from TWS/IB. Returns empty array when not connected or when
 * historical data API is not available (no fake data).
 */
export async function getTWSHistoricalData(
  symbol: string,
  endDateTime: string,
  durationStr: string,
  barSizeSetting: string,
  whatToShow: string
): Promise<any[]> {
  // Real implementation would call IB historicalData API when Gateway is connected
  return [];
}

// Start auto-reconnect on module load
startAutoReconnect();
