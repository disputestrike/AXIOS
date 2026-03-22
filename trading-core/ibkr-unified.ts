/**
 * AOIX-1 Unified IBKR Integration
 * 
 * Single source of truth for all IBKR Gateway connections.
 * - ONE connection manager
 * - ONE market data source
 * - ONE order execution engine
 * - ONE position tracking
 * 
 * IBKR Gateway only (via HTTP REST API on port 5000)
 */

import axios, { AxiosInstance } from 'axios';

// ============================================================================
// TYPES
// ============================================================================

export interface IBKRGatewayConfig {
  host: string;
  port: number;
  accountId: string;
  enableLiveTrading: boolean;
}

export interface OptionChainData {
  symbol: string;
  spot: number;
  expirations: string[];
  strikes: Map<string, OptionStrike[]>;
  lastUpdate: number;
}

export interface OptionStrike {
  strike: number;
  expiry: string;
  call: OptionPrice;
  put: OptionPrice;
}

export interface OptionPrice {
  bid: number;
  ask: number;
  last: number;
  volume: number;
  openInterest: number;
  impliedVol: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

export interface Position {
  symbol: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
}

export interface Order {
  orderId: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  orderType: 'MKT' | 'LMT';
  quantity: number;
  price?: number;
  status: 'PENDING' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  filledPrice?: number;
  filledQuantity?: number;
  filledTime?: Date;
  error?: string;
}

export interface Account {
  accountId: string;
  netLiquidation: number;
  totalCashValue: number;
  buyingPower: number;
  currency: string;
}

// ============================================================================
// IBKR UNIFIED CONNECTION MANAGER
// ============================================================================

export class IBKRConnection {
  private config: IBKRGatewayConfig;
  private client: AxiosInstance;
  private isConnected = false;
  private sessionToken?: string;
  private optionChainCache = new Map<string, OptionChainData>();
  private positionsCache: Position[] = [];
  private accountCache?: Account;
  private lastCacheUpdate = 0;
  private readonly CACHE_DURATION_MS = 5000; // 5 second cache

  constructor(config: Partial<IBKRGatewayConfig> = {}) {
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 5000,
      accountId: config.accountId || '',
      enableLiveTrading: config.enableLiveTrading ?? false,
    };

    this.client = axios.create({
      baseURL: `https://${this.config.host}:${this.config.port}`,
      timeout: 10000,
      httpsAgent: {
        rejectUnauthorized: false, // Local Gateway only
      },
    });
  }

  // ============================================================================
  // CONNECTION MANAGEMENT
  // ============================================================================

  public async connect(sessionToken: string): Promise<boolean> {
    try {
      console.log('[IBKR] Attempting connection to Gateway...');
      
      // Validate session by making a test call
      const response = await this.client.get('/api/v1/portal/iserver/account', {
        headers: { 'Authorization': `Bearer ${sessionToken}` },
      });

      if (response.status === 200 && response.data?.accounts?.length > 0) {
        this.sessionToken = sessionToken;
        this.isConnected = true;
        this.config.accountId = response.data.accounts[0];
        console.log(`[IBKR] Connected. Account: ${this.config.accountId}`);
        return true;
      }
    } catch (error) {
      console.error('[IBKR] Connection failed:', error instanceof Error ? error.message : error);
    }

    return false;
  }

  public disconnect(): void {
    this.isConnected = false;
    this.sessionToken = undefined;
    this.optionChainCache.clear();
    console.log('[IBKR] Disconnected');
  }

  public isAlive(): boolean {
    return this.isConnected && !!this.sessionToken;
  }

  // ============================================================================
  // MARKET DATA
  // ============================================================================

  /**
   * Get REAL option chain from IBKR Gateway.
   * VALIDATES: All strikes must exist in IBKR's data.
   * Returns cached data if < 5 seconds old.
   */
  public async getOptionChain(symbol: string, forceRefresh = false): Promise<OptionChainData | null> {
    if (!this.isAlive()) {
      throw new Error('IBKR not connected');
    }

    // Return cached if fresh
    const cached = this.optionChainCache.get(symbol);
    if (cached && !forceRefresh && Date.now() - cached.lastUpdate < this.CACHE_DURATION_MS) {
      return cached;
    }

    try {
      // Get stock data first
      const stockRes = await this.client.get(`/api/v1/portal/iserver/marketdata/${symbol}`, {
        headers: { 'Authorization': `Bearer ${this.sessionToken}` },
      });

      const spot = stockRes.data?.last ?? stockRes.data?.bid ?? 0;
      if (!spot) {
        throw new Error(`No price data for ${symbol}`);
      }

      // Get option chains (expirations)
      const chainRes = await this.client.get(`/api/v1/portal/iserver/marketdata/${symbol}/chains`, {
        headers: { 'Authorization': `Bearer ${this.sessionToken}` },
      });

      const expirations = chainRes.data?.expirations ?? [];
      const strikes = new Map<string, OptionStrike[]>();

      // Get details for each expiration
      for (const expiry of expirations) {
        try {
          const optRes = await this.client.get(
            `/api/v1/portal/iserver/marketdata/${symbol}/chains?exp=${expiry}`,
            { headers: { 'Authorization': `Bearer ${this.sessionToken}` } }
          );

          const expiryStrikes: OptionStrike[] = [];
          
          // Parse option data from IBKR
          if (optRes.data?.options) {
            for (const opt of optRes.data.options) {
              const strike = opt.strike;
              const existing = expiryStrikes.find(s => s.strike === strike);

              const optionData = {
                bid: opt.bid ?? 0,
                ask: opt.ask ?? 0,
                last: opt.last ?? 0,
                volume: opt.volume ?? 0,
                openInterest: opt.openInterest ?? 0,
                impliedVol: opt.impliedVol ?? 0,
                delta: opt.delta ?? 0,
                gamma: opt.gamma ?? 0,
                theta: opt.theta ?? 0,
                vega: opt.vega ?? 0,
              };

              if (opt.right === 'C' || opt.right === 'CALL') {
                if (existing) {
                  existing.call = optionData;
                } else {
                  expiryStrikes.push({
                    strike,
                    expiry,
                    call: optionData,
                    put: { bid: 0, ask: 0, last: 0, volume: 0, openInterest: 0, impliedVol: 0, delta: 0, gamma: 0, theta: 0, vega: 0 },
                  });
                }
              } else if (opt.right === 'P' || opt.right === 'PUT') {
                if (existing) {
                  existing.put = optionData;
                } else {
                  expiryStrikes.push({
                    strike,
                    expiry,
                    call: { bid: 0, ask: 0, last: 0, volume: 0, openInterest: 0, impliedVol: 0, delta: 0, gamma: 0, theta: 0, vega: 0 },
                    put: optionData,
                  });
                }
              }
            }
          }

          strikes.set(expiry, expiryStrikes);
        } catch (e) {
          console.warn(`[IBKR] Failed to get options for ${symbol} ${expiry}:`, e instanceof Error ? e.message : e);
        }
      }

      const chain: OptionChainData = {
        symbol,
        spot,
        expirations,
        strikes,
        lastUpdate: Date.now(),
      };

      this.optionChainCache.set(symbol, chain);
      return chain;
    } catch (error) {
      console.error('[IBKR] Failed to get option chain:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * Validate strike exists in IBKR data.
   * REQUIRED before ANY trade execution.
   */
  public async validateStrike(symbol: string, expiry: string, strike: number, optionType: 'C' | 'P'): Promise<boolean> {
    const chain = await this.getOptionChain(symbol);
    if (!chain) return false;

    const expiryStrikes = chain.strikes.get(expiry);
    if (!expiryStrikes) return false;

    const strikeData = expiryStrikes.find(s => s.strike === strike);
    if (!strikeData) return false;

    // Verify option side exists and has price
    if (optionType === 'C') {
      return strikeData.call.bid > 0 || strikeData.call.ask > 0;
    } else {
      return strikeData.put.bid > 0 || strikeData.put.ask > 0;
    }
  }

  /**
   * Get account info.
   */
  public async getAccount(): Promise<Account | null> {
    if (!this.isAlive()) {
      throw new Error('IBKR not connected');
    }

    try {
      const response = await this.client.get(`/api/v1/portal/accounts/${this.config.accountId}/summary`, {
        headers: { 'Authorization': `Bearer ${this.sessionToken}` },
      });

      const data = response.data;
      const account: Account = {
        accountId: this.config.accountId,
        netLiquidation: data.netliquidationvalue ?? 0,
        totalCashValue: data.totalcashvalue ?? 0,
        buyingPower: data.buyingpower ?? 0,
        currency: 'USD',
      };

      this.accountCache = account;
      return account;
    } catch (error) {
      console.error('[IBKR] Failed to get account:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * Get current positions.
   */
  public async getPositions(): Promise<Position[]> {
    if (!this.isAlive()) {
      throw new Error('IBKR not connected');
    }

    try {
      const response = await this.client.get(`/api/v1/portal/accounts/${this.config.accountId}/positions`, {
        headers: { 'Authorization': `Bearer ${this.sessionToken}` },
      });

      const positions: Position[] = (response.data ?? []).map((pos: any) => ({
        symbol: pos.symbol,
        quantity: pos.quantity,
        avgCost: pos.avgcost,
        currentPrice: pos.price,
        marketValue: pos.marketvalue,
        unrealizedPnL: pos.unrealizedPnL,
        unrealizedPnLPercent: pos.unrealizedPnLpct,
      }));

      this.positionsCache = positions;
      return positions;
    } catch (error) {
      console.error('[IBKR] Failed to get positions:', error instanceof Error ? error.message : error);
      return [];
    }
  }

  // ============================================================================
  // ORDER EXECUTION
  // ============================================================================

  /**
   * Place order for option.
   * VALIDATES strike before execution.
   */
  public async placeOrder(
    symbol: string,
    expiry: string,
    strike: number,
    optionType: 'C' | 'P',
    action: 'BUY' | 'SELL',
    quantity: number,
    limitPrice?: number
  ): Promise<Order> {
    if (!this.isAlive()) {
      throw new Error('IBKR not connected');
    }

    // VALIDATE STRIKE EXISTS
    const valid = await this.validateStrike(symbol, expiry, strike, optionType);
    if (!valid) {
      throw new Error(`Invalid strike: ${symbol} ${expiry} ${strike} ${optionType} not found in IBKR data`);
    }

    try {
      // Get option price for limit order if not provided
      if (!limitPrice) {
        const chain = await this.getOptionChain(symbol);
        if (chain) {
          const strikeData = chain.strikes.get(expiry)?.find(s => s.strike === strike);
          if (strikeData) {
            const priceData = optionType === 'C' ? strikeData.call : strikeData.put;
            limitPrice = (priceData.bid + priceData.ask) / 2;
          }
        }
      }

      // Build contract specification
      const contract = {
        conid: `${symbol}_${expiry}_${strike}_${optionType}`,
        symbol,
        type: 'OPT',
        expiry,
        strike,
        right: optionType === 'C' ? 'CALL' : 'PUT',
        currency: 'USD',
        multiplier: 100,
      };

      // Create order
      const orderData = {
        orderType: limitPrice ? 'LMT' : 'MKT',
        action,
        quantity,
        price: limitPrice,
        tif: 'DAY',
      };

      const response = await this.client.post(
        `/api/v1/portal/iserver/accounts/${this.config.accountId}/orders`,
        { contract, order: orderData },
        { headers: { 'Authorization': `Bearer ${this.sessionToken}` } }
      );

      const orderId = response.data?.orderId ?? String(Date.now());

      const order: Order = {
        orderId,
        symbol: `${symbol}_${expiry}_${strike}_${optionType}`,
        action,
        orderType: limitPrice ? 'LMT' : 'MKT',
        quantity,
        price: limitPrice,
        status: response.data?.status === 'Submitted' ? 'PENDING' : 'FILLED',
        filledPrice: limitPrice,
        filledQuantity: quantity,
        filledTime: new Date(),
      };

      return order;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Order execution failed: ${errorMsg}`);
    }
  }

  /**
   * Get execution reports.
   */
  public async getExecutions(): Promise<any[]> {
    if (!this.isAlive()) {
      throw new Error('IBKR not connected');
    }

    try {
      const response = await this.client.get(
        `/api/v1/portal/iserver/accounts/${this.config.accountId}/executions`,
        { headers: { 'Authorization': `Bearer ${this.sessionToken}` } }
      );

      return response.data ?? [];
    } catch (error) {
      console.error('[IBKR] Failed to get executions:', error instanceof Error ? error.message : error);
      return [];
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance: IBKRConnection | null = null;

export function getIBKRConnection(config?: Partial<IBKRGatewayConfig>): IBKRConnection {
  if (!instance) {
    instance = new IBKRConnection(config);
  }
  return instance;
}

export function resetIBKRConnection(): void {
  if (instance) {
    instance.disconnect();
  }
  instance = null;
}
