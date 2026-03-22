import { eq, desc, and, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  marketData,
  regimeStates,
  signals,
  optionsStructures,
  riskMetrics,
  trades,
  metaIntelligence,
  failureTaxonomy,
  shadowSystem,
  crossAssetCorrelations,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
/** After a connection error, stop using DB for this process to avoid log spam. */
let _dbConnectionFailed = false;

function isConnectionError(error: unknown): boolean {
  const err = error as { code?: string; cause?: { code?: string }; message?: string };
  return (
    err?.code === "ECONNREFUSED" ||
    err?.cause?.code === "ECONNREFUSED" ||
    (typeof err?.message === "string" && err.message.includes("ECONNREFUSED"))
  );
}

function markDbFailed(error: unknown): void {
  if (!isConnectionError(error)) return;
  _db = null;
  if (!_dbConnectionFailed) {
    _dbConnectionFailed = true;
    console.warn(
      "[Database] MySQL not reachable (ECONNREFUSED). App will run without DB. Start MySQL or remove DATABASE_URL to silence."
    );
  }
}

export async function getDb() {
  if (_dbConnectionFailed) return null;
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      markDbFailed(error);
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available (non-critical)");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    markDbFailed(error);
    // Don't throw - allow system to work without database
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  try {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.openId, openId))
      .limit(1);

    return result.length > 0 ? result[0] : undefined;
  } catch (error) {
    markDbFailed(error);
    return undefined;
  }
}

// Market Data Queries
export async function getLatestMarketData(underlying: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(marketData)
    .where(eq(marketData.underlying, underlying))
    .orderBy(desc(marketData.timestamp))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getMarketDataHistory(
  underlying: string,
  limit: number = 100
) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(marketData)
    .where(eq(marketData.underlying, underlying))
    .orderBy(desc(marketData.timestamp))
    .limit(limit);
}

// Regime State Queries
export async function getLatestRegimeState(underlying: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(regimeStates)
    .where(eq(regimeStates.underlying, underlying))
    .orderBy(desc(regimeStates.timestamp))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Signal Queries
export async function getActiveSignals(underlying: string) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(signals)
    .where(
      and(
        eq(signals.underlying, underlying),
        eq(signals.isActive, true)
      )
    )
    .orderBy(desc(signals.confidenceScore));
}

export async function getSignalsByClass(underlying: string, signalClass: string) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(signals)
    .where(
      and(
        eq(signals.underlying, underlying),
        eq(signals.signalClass, signalClass as any)
      )
    )
    .orderBy(desc(signals.timestamp));
}

// Options Structure Queries
export async function getLatestStructureRecommendation(underlying: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(optionsStructures)
    .where(eq(optionsStructures.underlying, underlying))
    .orderBy(desc(optionsStructures.timestamp))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Risk Metrics Queries
export async function getLatestRiskMetrics(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(riskMetrics)
    .where(eq(riskMetrics.userId, userId))
    .orderBy(desc(riskMetrics.timestamp))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Trade Queries
export async function getUserOpenTrades(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(trades)
    .where(
      and(
        eq(trades.userId, userId),
        eq(trades.status, "open")
      )
    )
    .orderBy(desc(trades.entryTimestamp));
}

export async function getUserTradeHistory(userId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(trades)
    .where(eq(trades.userId, userId))
    .orderBy(desc(trades.createdAt))
    .limit(limit);
}

// Meta-Intelligence Queries
export async function getLatestMetaIntelligence(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(metaIntelligence)
    .where(eq(metaIntelligence.userId, userId))
    .orderBy(desc(metaIntelligence.timestamp))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Failure Taxonomy Queries
export async function getUserFailures(userId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(failureTaxonomy)
    .where(eq(failureTaxonomy.userId, userId))
    .orderBy(desc(failureTaxonomy.timestamp))
    .limit(limit);
}

export async function getFailuresByType(userId: number, failureType: string) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(failureTaxonomy)
    .where(
      and(
        eq(failureTaxonomy.userId, userId),
        eq(failureTaxonomy.failureType, failureType as any)
      )
    )
    .orderBy(desc(failureTaxonomy.timestamp));
}

// Shadow System Queries
export async function getLatestShadowSystemReport(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(shadowSystem)
    .where(eq(shadowSystem.userId, userId))
    .orderBy(desc(shadowSystem.timestamp))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getShadowSystemReports(userId: number, limit: number = 20) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(shadowSystem)
    .where(eq(shadowSystem.userId, userId))
    .orderBy(desc(shadowSystem.timestamp))
    .limit(limit);
}

// Cross-Asset Correlation Queries
export async function getLatestCrossAssetCorrelations() {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(crossAssetCorrelations)
    .orderBy(desc(crossAssetCorrelations.timestamp))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getCrossAssetCorrelationHistory(limit: number = 100) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(crossAssetCorrelations)
    .orderBy(desc(crossAssetCorrelations.timestamp))
    .limit(limit);
}
