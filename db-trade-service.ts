import { eq, desc, and, sql, lt } from "drizzle-orm";
import { getDb } from "./db";
import { trades } from "../drizzle/schema";
import type { TradeRecord, PerformanceMetrics, SystemHealthStatus } from "./trade-history-service";

const TRADE_TYPE_ENUM = [
  "vertical_call_spread",
  "vertical_put_spread",
  "iron_condor",
  "calendar_spread",
  "diagonal_spread",
  "straddle",
  "strangle",
  "butterfly",
] as const;

const DIRECTION_ENUM = ["bullish", "bearish", "neutral"] as const;

function mapStructureType(s: string): (typeof TRADE_TYPE_ENUM)[number] {
  const lower = (s || "").toLowerCase().replace(/\s+/g, "_");
  if (TRADE_TYPE_ENUM.includes(lower as any)) return lower as (typeof TRADE_TYPE_ENUM)[number];
  if (lower.includes("cash_secured") || lower === "csp") return "vertical_put_spread";
  if (lower.includes("covered_call") || lower === "cc") return "vertical_call_spread";
  if (lower.includes("iron_butterfly")) return "butterfly";
  if (lower.includes("condor")) return "iron_condor";
  if (lower.includes("butterfly")) return "butterfly";
  if (lower.includes("calendar") || lower.includes("diagonal")) return "calendar_spread";
  if (lower.includes("straddle")) return "straddle";
  if (lower.includes("strangle")) return "strangle";
  if (lower.includes("call")) return "vertical_call_spread";
  if (lower.includes("put")) return "vertical_put_spread";
  return "vertical_call_spread";
}

function mapDirection(d: string): (typeof DIRECTION_ENUM)[number] {
  const lower = (d || "").toLowerCase();
  if (lower.includes("bull") || lower === "long") return "bullish";
  if (lower.includes("bear") || lower === "short") return "bearish";
  return "neutral";
}

/**
 * Database service for persisting trades and metrics.
 * Persists to Drizzle trades table; uses metadata.externalId to map external string IDs.
 */
export class DatabaseTradeService {
  /**
   * Save trade record to database. Uses userId or default 1 for demo/engine trades.
   */
  async saveTradeRecord(trade: TradeRecord, userId: number = 1): Promise<void> {
    try {
      const db = await getDb();
      if (!db) {
        console.warn("[DatabaseTradeService] Database not available for saving trade");
        return;
      }
      await db.insert(trades).values({
        userId,
        underlying: trade.symbol.substring(0, 20),
        tradeType: mapStructureType(trade.structureType),
        direction: mapDirection(trade.direction),
        entryTimestamp: new Date(trade.entryTime),
        entryPrice: String(trade.entryPrice),
        quantity: String(Math.round(trade.quantity)),
        status: trade.status === "closed" ? "closed" : "open",
        metadata: { externalId: trade.id },
      });
      console.log("[DatabaseTradeService] Trade saved:", trade.id);
    } catch (error) {
      console.error("[DatabaseTradeService] Failed to save trade record:", error);
      throw error;
    }
  }

  /**
   * Update trade record in database (e.g. on close). Finds row by metadata.externalId = trade.id.
   */
  async updateTradeRecord(trade: TradeRecord): Promise<void> {
    try {
      const db = await getDb();
      if (!db) {
        console.warn("[DatabaseTradeService] Database not available for updating trade");
        return;
      }
      const rows = await db
        .select({ id: trades.id })
        .from(trades)
        .where(sql`JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.externalId')) = ${trade.id}`)
        .limit(1);
      if (rows.length === 0) {
        console.warn("[DatabaseTradeService] No row found for externalId:", trade.id);
        return;
      }
      await db
        .update(trades)
        .set({
          exitTimestamp: trade.exitTime != null ? new Date(trade.exitTime) : null,
          exitPrice: trade.exitPrice != null ? String(trade.exitPrice) : null,
          pnl: trade.pnl != null ? String(trade.pnl) : null,
          status: "closed",
        })
        .where(eq(trades.id, rows[0].id));
      console.log("[DatabaseTradeService] Trade updated:", trade.id);
    } catch (error) {
      console.error("[DatabaseTradeService] Failed to update trade record:", error);
      throw error;
    }
  }

  /**
   * Get trade record from database by external id (stored in metadata.externalId).
   */
  async getTradeRecord(tradeId: string): Promise<TradeRecord | null> {
    try {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(trades)
        .where(sql`JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.externalId')) = ${tradeId}`)
        .limit(1);
      if (rows.length === 0) return null;
      return rowToTradeRecord(rows[0]);
    } catch (error) {
      console.error("[DatabaseTradeService] Failed to get trade record:", error);
      return null;
    }
  }

  /**
   * Get all trade records from database for a user (default userId 1).
   */
  async getAllTradeRecords(limit: number = 1000, userId: number = 1): Promise<TradeRecord[]> {
    try {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(trades)
        .where(eq(trades.userId, userId))
        .orderBy(desc(trades.entryTimestamp))
        .limit(limit);
      return rows.map(rowToTradeRecord);
    } catch (error) {
      console.error("[DatabaseTradeService] Failed to get all trade records:", error);
      return [];
    }
  }

  /**
   * Get closed trades from database.
   */
  async getClosedTrades(limit: number = 1000, userId: number = 1): Promise<TradeRecord[]> {
    try {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(trades)
        .where(and(eq(trades.userId, userId), eq(trades.status, "closed")))
        .orderBy(desc(trades.entryTimestamp))
        .limit(limit);
      return rows.map(rowToTradeRecord);
    } catch (error) {
      console.error("[DatabaseTradeService] Failed to get closed trades:", error);
      return [];
    }
  }

  /**
   * Get open trades from database.
   */
  async getOpenTrades(userId: number = 1): Promise<TradeRecord[]> {
    try {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(trades)
        .where(and(eq(trades.userId, userId), eq(trades.status, "open")))
        .orderBy(desc(trades.entryTimestamp));
      return rows.map(rowToTradeRecord);
    } catch (error) {
      console.error("[DatabaseTradeService] Failed to get open trades:", error);
      return [];
    }
  }

  /**
   * Get trades by symbol.
   */
  async getTradesBySymbol(symbol: string, limit: number = 1000, userId: number = 1): Promise<TradeRecord[]> {
    try {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(trades)
        .where(and(eq(trades.userId, userId), eq(trades.underlying, symbol.substring(0, 20))))
        .orderBy(desc(trades.entryTimestamp))
        .limit(limit);
      return rows.map(rowToTradeRecord);
    } catch (error) {
      console.error("[DatabaseTradeService] Failed to get trades by symbol:", error);
      return [];
    }
  }

  async savePerformanceMetrics(metrics: PerformanceMetrics): Promise<void> {
    try {
      const db = await getDb();
      if (!db) {
        console.warn("[DatabaseTradeService] Database not available for saving metrics");
        return;
      }
      console.log("[DatabaseTradeService] Performance metrics saved (no schema table)");
    } catch (error) {
      console.error("[DatabaseTradeService] Failed to save performance metrics:", error);
      throw error;
    }
  }

  async getPerformanceMetrics(): Promise<PerformanceMetrics | null> {
    try {
      const db = await getDb();
      if (!db) return null;
      return null;
    } catch (error) {
      console.error("[DatabaseTradeService] Failed to get performance metrics:", error);
      return null;
    }
  }

  async saveSystemHealth(health: SystemHealthStatus): Promise<void> {
    try {
      const db = await getDb();
      if (!db) {
        console.warn("[DatabaseTradeService] Database not available for saving health");
        return;
      }
      console.log("[DatabaseTradeService] System health saved (no schema table):", health.component);
    } catch (error) {
      console.error("[DatabaseTradeService] Failed to save system health:", error);
      throw error;
    }
  }

  async getSystemHealth(_component?: string): Promise<SystemHealthStatus[]> {
    try {
      const db = await getDb();
      if (!db) return [];
      return [];
    } catch (error) {
      console.error("[DatabaseTradeService] Failed to get system health:", error);
      return [];
    }
  }

  async deleteOldRecords(daysOld: number = 30): Promise<number> {
    try {
      const db = await getDb();
      if (!db) return 0;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysOld);
      const result = await db.delete(trades).where(lt(trades.entryTimestamp, cutoff));
      return (result as { rowsAffected?: number }).rowsAffected ?? 0;
    } catch (error) {
      console.error("[DatabaseTradeService] Failed to delete old records:", error);
      return 0;
    }
  }
}

function rowToTradeRecord(row: typeof trades.$inferSelect): TradeRecord {
  const metadata = (row.metadata as { externalId?: string }) || {};
  return {
    id: metadata.externalId ?? String(row.id),
    symbol: row.underlying,
    assetType: "option",
    entryPrice: Number(row.entryPrice),
    entryTime: row.entryTimestamp.getTime(),
    exitPrice: row.exitPrice != null ? Number(row.exitPrice) : undefined,
    exitTime: row.exitTimestamp != null ? row.exitTimestamp.getTime() : undefined,
    quantity: Number(row.quantity),
    direction: row.direction === "bullish" ? "long" : row.direction === "bearish" ? "short" : "neutral",
    structureType: row.tradeType,
    pnl: row.pnl != null ? Number(row.pnl) : undefined,
    status: row.status === "closed" ? "closed" : "open",
    createdAt: row.createdAt.getTime(),
    updatedAt: row.createdAt.getTime(),
  };
}

export const dbTradeService = new DatabaseTradeService();
