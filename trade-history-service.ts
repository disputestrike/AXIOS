function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface TradeRecord {
  id: string;
  symbol: string;
  assetType: string;
  entryPrice: number;
  entryTime: number;
  exitPrice?: number;
  exitTime?: number;
  quantity: number;
  direction: string;
  structureType: string;
  entrySignalClass?: string;
  entrySignalConfidence?: number;
  entryRegime?: string;
  exitReason?: string;
  pnl?: number;
  pnlPercent?: number;
  maxProfit?: number;
  maxLoss?: number;
  durationSeconds?: number;
  status: 'open' | 'closed';
  createdAt: number;
  updatedAt: number;
}

export interface PerformanceMetrics {
  id: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  totalPnL: number;
  dailyPnL: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  createdAt: number;
  updatedAt: number;
}

export interface SystemHealthStatus {
  id: string;
  component: string;
  status: 'healthy' | 'warning' | 'error';
  lastCheck: number;
  errorMessage?: string;
  responseTimeMs?: number;
  createdAt: number;
  updatedAt: number;
}

export class TradeHistoryService {
  private tradeRecords: Map<string, TradeRecord> = new Map();
  private performanceMetrics: PerformanceMetrics | null = null;
  private systemHealth: Map<string, SystemHealthStatus> = new Map();

  /**
   * Record a new trade entry
   */
  recordTradeEntry(trade: Omit<TradeRecord, 'id' | 'createdAt' | 'updatedAt'>): TradeRecord {
    const now = Date.now();
    const record: TradeRecord = {
      ...trade,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };

    this.tradeRecords.set(record.id, record);
    this.updatePerformanceMetrics();
    import('./db-trade-service').then(({ dbTradeService }) => dbTradeService.saveTradeRecord(record, 1)).catch((err) => {
      console.warn('[TradeHistoryService] Failed to persist trade entry (non-fatal):', err);
    });
    return record;
  }

  /**
   * Close a trade with exit details
   */
  closeTradeRecord(
    tradeId: string,
    exitPrice: number,
    exitReason: string,
    pnl: number,
    pnlPercent: number,
    maxProfit: number,
    maxLoss: number
  ): TradeRecord | null {
    const trade = this.tradeRecords.get(tradeId);
    if (!trade) return null;

    const now = Date.now();
    const durationSeconds = (now - trade.entryTime) / 1000;

    const updatedTrade: TradeRecord = {
      ...trade,
      exitPrice,
      exitTime: now,
      exitReason,
      pnl,
      pnlPercent,
      maxProfit,
      maxLoss,
      durationSeconds: Math.round(durationSeconds),
      status: 'closed',
      updatedAt: now,
    };

    this.tradeRecords.set(tradeId, updatedTrade);
    this.updatePerformanceMetrics();
    import('./db-trade-service').then(({ dbTradeService }) => dbTradeService.updateTradeRecord(updatedTrade)).catch((err) => {
      console.warn('[TradeHistoryService] Failed to persist trade close (non-fatal):', err);
    });
    return updatedTrade;
  }

  /**
   * Get trade record by ID
   */
  getTradeRecord(tradeId: string): TradeRecord | null {
    return this.tradeRecords.get(tradeId) || null;
  }

  /**
   * Get all trade records
   */
  getAllTradeRecords(): TradeRecord[] {
    return Array.from(this.tradeRecords.values());
  }

  /**
   * Get closed trades only
   */
  getClosedTrades(): TradeRecord[] {
    return Array.from(this.tradeRecords.values()).filter((t) => t.status === 'closed');
  }

  /**
   * Get open trades only
   */
  getOpenTrades(): TradeRecord[] {
    return Array.from(this.tradeRecords.values()).filter((t) => t.status === 'open');
  }

  /**
   * Get trades by symbol
   */
  getTradesBySymbol(symbol: string): TradeRecord[] {
    return Array.from(this.tradeRecords.values()).filter((t) => t.symbol === symbol);
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(): void {
    const closedTrades = this.getClosedTrades();
    const winningTrades = closedTrades.filter((t) => (t.pnl || 0) > 0);
    const losingTrades = closedTrades.filter((t) => (t.pnl || 0) < 0);

    const totalPnL = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const avgWin = winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? losingTrades.reduce((sum, t) => sum + Math.abs(t.pnl || 0), 0) / losingTrades.length : 0;

    const profitFactor = avgLoss > 0 ? (avgWin * winningTrades.length) / (avgLoss * losingTrades.length) : 0;
    const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0;

    // Calculate Sharpe ratio (simplified)
    const returns = closedTrades.map((t) => (t.pnlPercent || 0) / 100);
    const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const variance = returns.length > 1 ? returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1) : 0;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? meanReturn / stdDev : 0;

    // Calculate max drawdown
    let maxDrawdown = 0;
    let peak = 0;
    let runningPnL = 0;
    for (const trade of closedTrades) {
      runningPnL += trade.pnl || 0;
      if (runningPnL > peak) {
        peak = runningPnL;
      }
      const drawdown = peak - runningPnL;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    const now = Date.now();
    this.performanceMetrics = {
      id: 'perf-main',
      totalTrades: closedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      profitFactor,
      sharpeRatio,
      maxDrawdown,
      avgWin,
      avgLoss,
      largestWin: winningTrades.length > 0 ? Math.max(...winningTrades.map((t) => t.pnl || 0)) : 0,
      largestLoss: losingTrades.length > 0 ? Math.max(...losingTrades.map((t) => Math.abs(t.pnl || 0))) : 0,
      totalPnL,
      dailyPnL: 0, // Would be calculated from today's trades
      consecutiveWins: this.calculateConsecutiveWins(closedTrades),
      consecutiveLosses: this.calculateConsecutiveLosses(closedTrades),
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics | null {
    return this.performanceMetrics;
  }

  /**
   * Record system health status
   */
  recordSystemHealth(component: string, status: 'healthy' | 'warning' | 'error', errorMessage?: string, responseTimeMs?: number): void {
    const now = Date.now();
    const healthStatus: SystemHealthStatus = {
      id: `health-${component}`,
      component,
      status,
      lastCheck: now,
      errorMessage,
      responseTimeMs,
      createdAt: now,
      updatedAt: now,
    };

    this.systemHealth.set(component, healthStatus);
  }

  /**
   * Get system health status
   */
  getSystemHealth(component?: string): SystemHealthStatus[] {
    if (component) {
      const status = this.systemHealth.get(component);
      return status ? [status] : [];
    }
    return Array.from(this.systemHealth.values());
  }

  /**
   * Get overall system health
   */
  getOverallHealth(): 'healthy' | 'warning' | 'error' {
    const statuses = Array.from(this.systemHealth.values());
    if (statuses.some((s) => s.status === 'error')) return 'error';
    if (statuses.some((s) => s.status === 'warning')) return 'warning';
    return 'healthy';
  }

  /**
   * Clear old records (older than specified days)
   */
  clearOldRecords(daysOld: number = 30): number {
    const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;
    let count = 0;

    const idsToDelete: string[] = [];
    this.tradeRecords.forEach((trade, id) => {
      if (trade.updatedAt < cutoffTime) {
        idsToDelete.push(id);
      }
    });

    idsToDelete.forEach((id) => {
      this.tradeRecords.delete(id);
      count++;
    });

    return count;
  }

  /**
   * Calculate consecutive wins
   */
  private calculateConsecutiveWins(trades: TradeRecord[]): number {
    let count = 0;
    for (let i = trades.length - 1; i >= 0; i--) {
      if ((trades[i].pnl || 0) > 0) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  /**
   * Calculate consecutive losses
   */
  private calculateConsecutiveLosses(trades: TradeRecord[]): number {
    let count = 0;
    for (let i = trades.length - 1; i >= 0; i--) {
      if ((trades[i].pnl || 0) < 0) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }
}

// Singleton instance
export const tradeHistoryService = new TradeHistoryService();
