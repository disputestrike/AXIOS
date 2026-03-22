/**
 * IB Gateway Adapter
 * 
 * Connects the autonomous trading engine to Interactive Brokers Gateway
 * for live order execution. Provides fallback to paper trading if Gateway
 * is unavailable.
 */

import { AutoTradingEngine, type Position, type Trade } from './auto-trading-engine';

// ============================================================================
// TYPES
// ============================================================================

export interface GatewayConfig {
  host: string;
  port: number;
  clientId: number;
  accountId: string;
  enabled: boolean;
}

export interface GatewayConnectionStatus {
  isConnected: boolean;
  lastConnectAttempt: number | null;
  lastSuccessfulConnection: number | null;
  connectionError: string | null;
  mode: 'paper' | 'live';
}

export interface ExecutionResult {
  success: boolean;
  orderId?: string;
  error?: string;
  executedPrice?: number;
  executedQuantity?: number;
}

// ============================================================================
// GATEWAY ADAPTER CLASS
// ============================================================================

export class GatewayAdapter {
  private config: GatewayConfig;
  private connectionStatus: GatewayConnectionStatus;
  private engine: AutoTradingEngine;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelayMs = 5000;
  private connectionCheckInterval: NodeJS.Timeout | null = null;

  constructor(engine: AutoTradingEngine, config: Partial<GatewayConfig> = {}) {
    this.engine = engine;
    this.config = {
      host: config.host || 'localhost',
      port: config.port ?? parseInt(process.env.TWS_PORT || '5000', 10),
      clientId: config.clientId || 1,
      accountId: config.accountId || '',
      enabled: config.enabled ?? false,
    };
    
    this.connectionStatus = {
      isConnected: false,
      lastConnectAttempt: null,
      lastSuccessfulConnection: null,
      connectionError: null,
      mode: 'paper',
    };
  }

  // ============================================================================
  // CONNECTION MANAGEMENT
  // ============================================================================

  public async connect(): Promise<boolean> {
    if (!this.config.enabled) {
      console.log('[GatewayAdapter] Gateway disabled - using paper trading mode');
      this.connectionStatus.mode = 'paper';
      return false;
    }

    console.log(`[GatewayAdapter] Attempting to connect to Gateway at ${this.config.host}:${this.config.port}`);
    this.connectionStatus.lastConnectAttempt = Date.now();

    try {
      const connected = await this.checkGatewayConnection();

      if (connected) {
        this.connectionStatus.isConnected = true;
        this.connectionStatus.lastSuccessfulConnection = Date.now();
        this.connectionStatus.connectionError = null;
        this.connectionStatus.mode = 'live';
        this.reconnectAttempts = 0;
        console.log('[GatewayAdapter] Successfully connected to Gateway - LIVE TRADING MODE');
        return true;
      } else {
        throw new Error('Gateway connection failed');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.connectionStatus.isConnected = false;
      this.connectionStatus.connectionError = errorMsg;
      this.connectionStatus.mode = 'paper';
      
      console.error(`[GatewayAdapter] Connection failed: ${errorMsg}`);
      
      // Attempt reconnect
      this.scheduleReconnect();
      return false;
    }
  }

  public disconnect(): void {
    console.log('[GatewayAdapter] Disconnecting from Gateway');
    this.connectionStatus.isConnected = false;
    this.connectionStatus.mode = 'paper';
    
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }
  }

  public getConnectionStatus(): GatewayConnectionStatus {
    return { ...this.connectionStatus };
  }

  public isLiveMode(): boolean {
    return this.connectionStatus.isConnected && this.connectionStatus.mode === 'live';
  }

  public isPaperMode(): boolean {
    return !this.connectionStatus.isConnected || this.connectionStatus.mode === 'paper';
  }

  // ============================================================================
  // ORDER EXECUTION
  // ============================================================================

  public async executePosition(position: Position): Promise<ExecutionResult> {
    if (this.isPaperMode()) {
      // Paper trading - position already managed by engine
      return {
        success: true,
        executedPrice: position.entryPrice,
        executedQuantity: position.quantity,
      };
    }

    try {
      // Live trading through Gateway
      const result = await this.executeOrderThroughGateway(position);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[GatewayAdapter] Order execution failed: ${errorMsg}`);
      
      // Fallback to paper trading
      this.connectionStatus.isConnected = false;
      this.connectionStatus.mode = 'paper';
      
      return {
        success: false,
        error: `Live execution failed: ${errorMsg}. Falling back to paper trading.`,
      };
    }
  }

  public async closePosition(position: Position, exitPrice: number): Promise<ExecutionResult> {
    if (this.isPaperMode()) {
      // Paper trading - position already closed by engine
      return {
        success: true,
        executedPrice: exitPrice,
        executedQuantity: position.quantity,
      };
    }

    try {
      // Live trading through Gateway
      const result = await this.closeOrderThroughGateway(position, exitPrice);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[GatewayAdapter] Close execution failed: ${errorMsg}`);
      
      // Fallback to paper trading
      this.connectionStatus.isConnected = false;
      this.connectionStatus.mode = 'paper';
      
      return {
        success: false,
        error: `Live close failed: ${errorMsg}. Falling back to paper trading.`,
      };
    }
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  public setConfig(config: Partial<GatewayConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[GatewayAdapter] Configuration updated:', this.config);
  }

  public getConfig(): GatewayConfig {
    return { ...this.config };
  }

  public enableGateway(): void {
    this.config.enabled = true;
    console.log('[GatewayAdapter] Gateway enabled');
  }

  public disableGateway(): void {
    this.config.enabled = false;
    this.disconnect();
    console.log('[GatewayAdapter] Gateway disabled - using paper trading');
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async checkGatewayConnection(): Promise<boolean> {
    try {
      const { checkIBGatewayConnection } = await import('./ib-orders');
      return await checkIBGatewayConnection();
    } catch {
      return false;
    }
  }

  private async executeOrderThroughGateway(position: Position): Promise<ExecutionResult> {
    try {
      const { getIBAccountId, placeIBOptionOrder } = await import('./ib-orders');
      const accountId = await getIBAccountId();
      if (!accountId) {
        return { success: false, error: 'No IB account id' };
      }
      const optionType = position.optionType === 'call' ? 'C' : 'P';
      const result = await placeIBOptionOrder({
        accountId,
        symbol: position.symbol,
        expiry: position.expiry,
        strike: position.strike,
        optionType,
        side: 'BUY',
        quantity: position.quantity,
        orderType: 'MKT',
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        orderId: result.orderId,
        executedPrice: position.entryPrice,
        executedQuantity: position.quantity,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  }

  private async closeOrderThroughGateway(position: Position, exitPrice: number): Promise<ExecutionResult> {
    try {
      const { getIBAccountId, placeIBOptionOrder } = await import('./ib-orders');
      const accountId = await getIBAccountId();
      if (!accountId) {
        return { success: false, error: 'No IB account id' };
      }
      const optionType = position.optionType === 'call' ? 'C' : 'P';
      const result = await placeIBOptionOrder({
        accountId,
        symbol: position.symbol,
        expiry: position.expiry,
        strike: position.strike,
        optionType,
        side: 'SELL',
        quantity: position.quantity,
        orderType: 'MKT',
        limitPrice: exitPrice,
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        orderId: result.orderId,
        executedPrice: exitPrice,
        executedQuantity: position.quantity,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[GatewayAdapter] Max reconnect attempts reached - staying in paper trading mode');
      return;
    }

    this.reconnectAttempts++;
    const delaySeconds = Math.floor(this.reconnectDelayMs / 1000);
    console.log(`[GatewayAdapter] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delaySeconds}s`);

    setTimeout(() => {
      this.connect();
    }, this.reconnectDelayMs);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let adapterInstance: GatewayAdapter | null = null;

export function getGatewayAdapter(engine: AutoTradingEngine): GatewayAdapter {
  if (!adapterInstance) {
    adapterInstance = new GatewayAdapter(engine);
  }
  return adapterInstance;
}

export function resetGatewayAdapter(): void {
  if (adapterInstance) {
    adapterInstance.disconnect();
    adapterInstance = null;
  }
}
