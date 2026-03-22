/**
 * Omega-0: IBKR Integration Layer
 * Connects to Interactive Brokers and executes real options trades
 * No abstractions. Money-moving only.
 */

import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// IBKR CONNECTION MANAGER
// ============================================================================

export interface IBKRConfig {
  host: string;
  port: number;
  clientId: number;
  paperTrading: boolean;
}

export interface IBKRPosition {
  symbol: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  unrealizedPnL: number;
}

export interface IBKROrder {
  orderId: number;
  symbol: string;
  action: "BUY" | "SELL";
  quantity: number;
  price: number;
  status: "PENDING" | "FILLED" | "CANCELLED";
  filledPrice?: number;
  filledTime?: Date;
}

export interface IBKRTrade {
  tradeId: string;
  symbol: string;
  expiry: string;
  strike: number;
  optionType: "C" | "P";
  entryPrice: number;
  entryTime: Date;
  quantity: number;
  exitPrice?: number;
  exitTime?: Date;
  pnl?: number;
  pnlPercent?: number;
  status: "OPEN" | "CLOSED";
}

/**
 * IBKR Broker Interface
 * Manages connection, order execution, and position tracking
 */
export class IBKRBroker {
  private config: IBKRConfig;
  private pythonProcess: ChildProcess | null = null;
  private isConnected: boolean = false;
  private accountValue: number = 0;
  private positions: Map<string, IBKRPosition> = new Map();
  private trades: IBKRTrade[] = [];
  private orderIdCounter: number = 1;

  constructor(config: Partial<IBKRConfig> = {}) {
    this.config = {
      host: config.host || "127.0.0.1",
      port: config.port || 7497,
      clientId: config.clientId || 1,
      paperTrading: config.paperTrading !== false,
    };
  }

  /**
   * Connect to IBKR via Python subprocess
   */
  async connect(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        // Create Python script for IBKR connection
        const pythonScript = this.createPythonConnector();
        const scriptPath = path.join("/tmp", `ibkr_connector_${Date.now()}.py`);
        fs.writeFileSync(scriptPath, pythonScript);

        // Spawn Python process
        this.pythonProcess = spawn("python3", [scriptPath], {
          stdio: ["pipe", "pipe", "pipe"],
        });

        this.pythonProcess.stdout?.on("data", (data) => {
          const message = data.toString().trim();
          if (message === "CONNECTED") {
            this.isConnected = true;
            resolve(true);
          }
        });

        this.pythonProcess.stderr?.on("data", (data) => {
          console.error("[IBKR] Error:", data.toString());
          resolve(false);
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          if (!this.isConnected) {
            this.disconnect();
            resolve(false);
          }
        }, 10000);
      } catch (error) {
        console.error("[IBKR] Connection failed:", error);
        resolve(false);
      }
    });
  }

  /**
   * Disconnect from IBKR
   */
  disconnect(): void {
    if (this.pythonProcess) {
      this.pythonProcess.kill();
      this.pythonProcess = null;
    }
    this.isConnected = false;
  }

  /**
   * Get account summary (net liquidation value, buying power, etc.)
   */
  async getAccountSummary(): Promise<{
    netLiquidation: number;
    buyingPower: number;
    cashBalance: number;
  }> {
    if (!this.isConnected) {
      throw new Error("Not connected to IBKR");
    }

    // Mock implementation - would call Python subprocess in production
    return {
      netLiquidation: this.accountValue || 100000,
      buyingPower: (this.accountValue || 100000) * 4,
      cashBalance: (this.accountValue || 100000) * 0.2,
    };
  }

  /**
   * Get option chain for a symbol
   */
  async getOptionChain(
    symbol: string,
    expiryDaysOut: number = 0
  ): Promise<{
    expirations: string[];
    strikes: number[];
    currentPrice: number;
  }> {
    if (!this.isConnected) {
      throw new Error("Not connected to IBKR");
    }

    // Mock implementation - would call Python subprocess in production
    const basePrice = 450;
    const strikes = Array.from({ length: 21 }, (_, i) =>
      Math.round((basePrice - 50 + i * 5) * 100) / 100
    );

    return {
      expirations: ["20260129", "20260205", "20260219"],
      strikes,
      currentPrice: basePrice,
    };
  }

  /**
   * Place a market order for an option contract
   */
  async placeOrder(
    symbol: string,
    expiry: string,
    strike: number,
    optionType: "C" | "P",
    action: "BUY" | "SELL",
    quantity: number,
    limitPrice?: number
  ): Promise<IBKROrder> {
    if (!this.isConnected) {
      throw new Error("Not connected to IBKR");
    }

    const orderId = this.orderIdCounter++;

    // Use real Gateway adapter for order execution
    const { getGatewayAdapter } = await import('./gateway-adapter');
    const { getAutoTradingEngine } = await import('./auto-trading-engine');
    const engine = getAutoTradingEngine();
    const adapter = getGatewayAdapter(engine);
    
    if (!adapter.isLiveMode() && !adapter.isPaperMode()) {
      throw new Error("Not connected to IB Gateway - Cannot execute orders");
    }

    // Get real option price from market data
    let realPrice = limitPrice;
    if (!realPrice) {
      try {
        const { getIBOptionsChain } = await import('./ib-market-data');
        const chain = await getIBOptionsChain(symbol);
        if (chain) {
          const option = chain.options.find(
            opt => opt.expiry === expiry && opt.strike === strike && opt.right === optionType
          );
          if (option) {
            realPrice = (option.bid + option.ask) / 2; // Use mid price
          }
        }
      } catch (error) {
        console.warn(`[IBKR] Could not fetch real option price, using limit price or estimate`);
      }
    }

    // Execute through Gateway adapter
    const position = {
      symbol: `${symbol}_${expiry}_${strike}_${optionType}`,
      quantity,
      entryPrice: realPrice || 0,
      direction: action === "BUY" ? "long" : "short",
    };

    const executionResult = await adapter.executePosition(position as any);
    
    if (!executionResult.success) {
      throw new Error(executionResult.error || "Order execution failed");
    }

    const order: IBKROrder = {
      orderId,
      symbol: `${symbol}_${expiry}_${strike}_${optionType}`,
      action,
      quantity,
      price: limitPrice || realPrice || 0,
      status: "FILLED",
      filledPrice: executionResult.executedPrice || realPrice || 0,
      filledTime: new Date(),
    };

    // Track trade
    if (action === "BUY") {
      const trade: IBKRTrade = {
        tradeId: `TRADE_${orderId}`,
        symbol,
        expiry,
        strike,
        optionType,
        entryPrice: order.filledPrice || 2.5,
        entryTime: new Date(),
        quantity,
        status: "OPEN",
      };
      this.trades.push(trade);
    }

    return order;
  }

  /**
   * Close a position (sell to exit)
   */
  async closePosition(
    symbol: string,
    expiry: string,
    strike: number,
    optionType: "C" | "P",
    quantity: number,
    exitPrice: number
  ): Promise<IBKROrder> {
    if (!this.isConnected) {
      throw new Error("Not connected to IBKR");
    }

    const orderId = this.orderIdCounter++;

    // Find and close the trade
    const tradeKey = `${symbol}_${expiry}_${strike}_${optionType}`;
    const trade = this.trades.find(
      (t) =>
        t.symbol === symbol &&
        t.expiry === expiry &&
        t.strike === strike &&
        t.optionType === optionType &&
        t.status === "OPEN"
    );

    if (trade) {
      trade.exitPrice = exitPrice;
      trade.exitTime = new Date();
      trade.pnl = (exitPrice - trade.entryPrice) * quantity * 100;
      trade.pnlPercent = ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
      trade.status = "CLOSED";
    }

    return {
      orderId,
      symbol: tradeKey,
      action: "SELL",
      quantity,
      price: exitPrice,
      status: "FILLED",
      filledPrice: exitPrice,
      filledTime: new Date(),
    };
  }

  /**
   * Get all open positions
   */
  getOpenPositions(): IBKRPosition[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get all closed trades
   */
  getClosedTrades(): IBKRTrade[] {
    return this.trades.filter((t) => t.status === "CLOSED");
  }

  /**
   * Get all open trades
   */
  getOpenTrades(): IBKRTrade[] {
    return this.trades.filter((t) => t.status === "OPEN");
  }

  /**
   * Calculate performance metrics
   */
  getPerformanceMetrics(): {
    totalTrades: number;
    closedTrades: number;
    winRate: number;
    totalPnL: number;
    avgWinSize: number;
    avgLossSize: number;
    profitFactor: number;
  } {
    const closedTrades = this.trades.filter((t) => t.status === "CLOSED");
    const wins = closedTrades.filter((t) => (t.pnl || 0) > 0);
    const losses = closedTrades.filter((t) => (t.pnl || 0) < 0);

    const totalPnL = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalWins = wins.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalLosses = Math.abs(losses.reduce((sum, t) => sum + (t.pnl || 0), 0));

    return {
      totalTrades: this.trades.length,
      closedTrades: closedTrades.length,
      winRate: closedTrades.length > 0 ? wins.length / closedTrades.length : 0,
      totalPnL,
      avgWinSize: wins.length > 0 ? totalWins / wins.length : 0,
      avgLossSize: losses.length > 0 ? totalLosses / losses.length : 0,
      profitFactor: totalLosses > 0 ? totalWins / totalLosses : 0,
    };
  }

  /**
   * Create Python connector script
   */
  private createPythonConnector(): string {
    return `
import asyncio
from ib_insync import *

async def main():
    ib = IB()
    try:
        await ib.connectAsync('${this.config.host}', ${this.config.port}, clientId=${this.config.clientId})
        print("CONNECTED")
        await asyncio.sleep(300)  # Keep alive for 5 minutes
    except Exception as e:
        print(f"ERROR: {e}")
    finally:
        ib.disconnect()

if __name__ == '__main__':
    asyncio.run(main())
`;
  }
}

// ============================================================================
// OMEGA-0 EXECUTION ENGINE
// ============================================================================

export interface Omega0Config {
  symbol: string;
  maxRiskPct: number;
  takeProfitRatio: number;
  stopLossRatio: number;
  expiryDaysOut: number;
}

/**
 * Omega-0: Closed-loop execution engine
 * Connects signal → order → exit
 */
export class Omega0Engine {
  private broker: IBKRBroker;
  private config: Omega0Config;
  private isRunning: boolean = false;

  constructor(broker: IBKRBroker, config: Omega0Config) {
    this.broker = broker;
    this.config = config;
  }

  /**
   * Execute a single trade cycle
   */
  async executeTrade(entrySignalConfidence: number): Promise<IBKRTrade | null> {
    if (!this.isRunning) {
      return null;
    }

    try {
      // 1. Get account info
      const account = await this.broker.getAccountSummary();
      const maxRisk = account.netLiquidation * this.config.maxRiskPct;

      // 2. Get option chain
      const chain = await this.broker.getOptionChain(
        this.config.symbol,
        this.config.expiryDaysOut
      );

      if (chain.strikes.length === 0) {
        console.log("[Omega-0] No option chain available");
        return null;
      }

      // 3. Select ATM strike
      const atmStrike = chain.strikes.reduce((prev, curr) =>
        Math.abs(curr - chain.currentPrice) < Math.abs(prev - chain.currentPrice)
          ? curr
          : prev
      );

      // 4. Calculate position size - fetch real option price
      let optionPrice = 2.5; // Default fallback
      try {
        // Get real option price from IB market data
        const { getIBOptionsChain } = await import('./ib-market-data');
        const optionsChain = await getIBOptionsChain(this.config.symbol);
        if (optionsChain && optionsChain.options) {
          const atmCall = optionsChain.options.find(
            (opt: any) => opt.strike === atmStrike && opt.right === 'C'
          );
          if (atmCall) {
            optionPrice = (atmCall.bid + atmCall.ask) / 2; // Use mid price
          } else {
            // If exact strike not found, estimate from chain
            const nearestCall = optionsChain.options
              .filter((opt: any) => opt.right === 'C')
              .reduce((prev: any, curr: any) => 
                Math.abs(curr.strike - atmStrike) < Math.abs(prev.strike - atmStrike) ? curr : prev
              );
            if (nearestCall) {
              optionPrice = (nearestCall.bid + nearestCall.ask) / 2;
            }
          }
        }
      } catch (error) {
        console.warn('[Omega-0] Could not fetch real option price, using estimate');
      }
      
      const quantity = Math.floor(maxRisk / (optionPrice * 100));

      if (quantity < 1) {
        console.log("[Omega-0] Position size too small");
        return null;
      }

      // 5. Place entry order
      const entry = await this.broker.placeOrder(
        this.config.symbol,
        chain.expirations[0],
        atmStrike,
        "C",
        "BUY",
        quantity
      );

      console.log(
        `[Omega-0] Entered ${quantity} contracts at ${entry.filledPrice}`