import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  json,
  index,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Market Data: Real-time price, volatility, and microstructure data
 */
export const marketData = mysqlTable(
  "market_data",
  {
    id: int("id").autoincrement().primaryKey(),
    underlying: varchar("underlying", { length: 20 }).notNull(), // e.g., "SPX", "QQQ"
    timestamp: timestamp("timestamp").notNull(),
    spotPrice: decimal("spot_price", { precision: 12, scale: 2 }).notNull(),
    realizedVolatility1d: decimal("rv_1d", { precision: 8, scale: 4 }),
    realizedVolatility5d: decimal("rv_5d", { precision: 8, scale: 4 }),
    realizedVolatility30d: decimal("rv_30d", { precision: 8, scale: 4 }),
    impliedVolatility: decimal("iv", { precision: 8, scale: 4 }),
    ivRank: decimal("iv_rank", { precision: 5, scale: 2 }), // 0-100
    ivPercentile: decimal("iv_percentile", { precision: 5, scale: 2 }), // 0-100
    volatilityOfVolatility: decimal("vov", { precision: 8, scale: 4 }),
    dealerGammaExposure: decimal("gex", { precision: 15, scale: 2 }),
    dealerVegaExposure: decimal("vex", { precision: 15, scale: 2 }),
    openInterest: decimal("open_interest", { precision: 15, scale: 0 }),
    volume: decimal("volume", { precision: 15, scale: 0 }),
    bidAskSpread: decimal("bid_ask_spread", { precision: 8, scale: 4 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    underlyingTimestampIdx: index("underlying_timestamp_idx").on(
      table.underlying,
      table.timestamp
    ),
  })
);

export type MarketData = typeof marketData.$inferSelect;
export type InsertMarketData = typeof marketData.$inferInsert;

/**
 * Regime State: Classification of market regime (Bull/Bear × Vol-Compression/Expansion)
 */
export const regimeStates = mysqlTable(
  "regime_states",
  {
    id: int("id").autoincrement().primaryKey(),
    underlying: varchar("underlying", { length: 20 }).notNull(),
    timestamp: timestamp("timestamp").notNull(),
    regime: mysqlEnum("regime", [
      "bull_vol_compression",
      "bull_vol_expansion",
      "bear_vol_compression",
      "bear_vol_expansion",
      "mean_reverting",
      "chaotic",
    ]).notNull(),
    transitionProbability: decimal("transition_probability", {
      precision: 5,
      scale: 4,
    }), // 0-1
    liquidityStressIndex: decimal("lsi", { precision: 8, scale: 4 }),
    confidenceScore: decimal("confidence_score", { precision: 5, scale: 4 }), // 0-1
    metadata: json("metadata"), // Additional regime-specific data
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    underlyingTimestampIdx: index("regime_underlying_timestamp_idx").on(
      table.underlying,
      table.timestamp
    ),
  })
);

export type RegimeState = typeof regimeStates.$inferSelect;
export type InsertRegimeState = typeof regimeStates.$inferInsert;

/**
 * Signals: Class A-D signals with confidence and decay tracking
 */
export const signals = mysqlTable(
  "signals",
  {
    id: int("id").autoincrement().primaryKey(),
    underlying: varchar("underlying", { length: 20 }).notNull(),
    signalClass: mysqlEnum("signal_class", ["A", "B", "C", "D"]).notNull(),
    signalType: varchar("signal_type", { length: 50 }).notNull(), // e.g., "dealer_gamma", "sweep_activity"
    timestamp: timestamp("timestamp").notNull(),
    confidenceScore: decimal("confidence_score", { precision: 5, scale: 4 }).notNull(), // 0-1
    confidenceDecayRate: decimal("confidence_decay_rate", {
      precision: 5,
      scale: 4,
    }), // decay per hour
    expectedMoveRange: json("expected_move_range"), // { lower: -2%, upper: +3% }
    volatilityExpansionProbability: decimal("vol_expansion_prob", {
      precision: 5,
      scale: 4,
    }),
    asymmetryScore: decimal("asymmetry_score", { precision: 5, scale: 4 }), // upside/downside ratio
    failureMode: text("failure_mode"), // Description of when signal fails
    metadata: json("metadata"), // Signal-specific data
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    underlyingTimestampIdx: index("signal_underlying_timestamp_idx").on(
      table.underlying,
      table.timestamp
    ),
    classIdx: index("signal_class_idx").on(table.signalClass),
  })
);

export type Signal = typeof signals.$inferSelect;
export type InsertSignal = typeof signals.$inferInsert;

/**
 * Options Structures: Recommended structures with Greek analysis
 */
export const optionsStructures = mysqlTable(
  "options_structures",
  {
    id: int("id").autoincrement().primaryKey(),
    underlying: varchar("underlying", { length: 20 }).notNull(),
    timestamp: timestamp("timestamp").notNull(),
    structureType: mysqlEnum("structure_type", [
      "vertical_call_spread",
      "vertical_put_spread",
      "iron_condor",
      "calendar_spread",
      "diagonal_spread",
      "straddle",
      "strangle",
      "butterfly",
    ]).notNull(),
    direction: mysqlEnum("direction", ["bullish", "bearish", "neutral"]).notNull(),
    expectedValue: decimal("expected_value", { precision: 12, scale: 4 }),
    cvar: decimal("cvar", { precision: 12, scale: 4 }), // Conditional Value at Risk
    deltaExposure: decimal("delta_exposure", { precision: 8, scale: 4 }),
    gammaExposure: decimal("gamma_exposure", { precision: 8, scale: 4 }),
    thetaExposure: decimal("theta_exposure", { precision: 8, scale: 4 }),
    vegaExposure: decimal("vega_exposure", { precision: 8, scale: 4 }),
    maxProfit: decimal("max_profit", { precision: 12, scale: 2 }),
    maxLoss: decimal("max_loss", { precision: 12, scale: 2 }),
    breakeven: json("breakeven"), // Array of breakeven prices
    liquidity: mysqlEnum("liquidity", ["high", "medium", "low"]),
    justification: text("justification"), // Why this structure is optimal
    metadata: json("metadata"), // Legs, strikes, expiries
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    underlyingTimestampIdx: index("structure_underlying_timestamp_idx").on(
      table.underlying,
      table.timestamp
    ),
  })
);

export type OptionsStructure = typeof optionsStructures.$inferSelect;
export type InsertOptionsStructure = typeof optionsStructures.$inferInsert;

/**
 * Risk Metrics: Portfolio-level risk calculations
 */
export const riskMetrics = mysqlTable(
  "risk_metrics",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull(),
    timestamp: timestamp("timestamp").notNull(),
    portfolioDelta: decimal("portfolio_delta", { precision: 12, scale: 4 }),
    portfolioGamma: decimal("portfolio_gamma", { precision: 12, scale: 4 }),
    portfolioTheta: decimal("portfolio_theta", { precision: 12, scale: 4 }),
    portfolioVega: decimal("portfolio_vega", { precision: 12, scale: 4 }),
    grossNotional: decimal("gross_notional", { precision: 15, scale: 2 }),
    netNotional: decimal("net_notional", { precision: 15, scale: 2 }),
    maxDrawdown: decimal("max_drawdown", { precision: 8, scale: 4 }),
    dailyLossLimit: decimal("daily_loss_limit", { precision: 12, scale: 2 }),
    drawdownLimit: decimal("drawdown_limit", { precision: 8, scale: 4 }),
    capitalPreservationActive: boolean("capital_preservation_active").default(false),
    correlationExposure: json("correlation_exposure"), // Sector correlations
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userTimestampIdx: index("risk_user_timestamp_idx").on(
      table.userId,
      table.timestamp
    ),
  })
);

export type RiskMetric = typeof riskMetrics.$inferSelect;
export type InsertRiskMetric = typeof riskMetrics.$inferInsert;

/**
 * Trades: Executed trades with entry/exit details
 */
export const trades = mysqlTable(
  "trades",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull(),
    underlying: varchar("underlying", { length: 20 }).notNull(),
    tradeType: mysqlEnum("trade_type", [
      "vertical_call_spread",
      "vertical_put_spread",
      "iron_condor",
      "calendar_spread",
      "diagonal_spread",
      "straddle",
      "strangle",
      "butterfly",
    ]).notNull(),
    direction: mysqlEnum("direction", ["bullish", "bearish", "neutral"]).notNull(),
    entryTimestamp: timestamp("entry_timestamp").notNull(),
    exitTimestamp: timestamp("exit_timestamp"),
    entryPrice: decimal("entry_price", { precision: 12, scale: 4 }).notNull(),
    exitPrice: decimal("exit_price", { precision: 12, scale: 4 }),
    quantity: decimal("quantity", { precision: 12, scale: 0 }).notNull(),
    pnl: decimal("pnl", { precision: 12, scale: 2 }),
    slippage: decimal("slippage", { precision: 8, scale: 4 }),
    status: mysqlEnum("status", ["open", "closed", "cancelled"]).default("open"),
    metadata: json("metadata"), // Entry gates confirmation, Greeks at entry
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userUnderlyingIdx: index("trade_user_underlying_idx").on(
      table.userId,
      table.underlying
    ),
  })
);

export type Trade = typeof trades.$inferSelect;
export type InsertTrade = typeof trades.$inferInsert;

/**
 * Meta-Intelligence: System self-awareness metrics
 */
export const metaIntelligence = mysqlTable(
  "meta_intelligence",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull(),
    timestamp: timestamp("timestamp").notNull(),
    edgeHalfLife: decimal("edge_half_life", { precision: 8, scale: 2 }), // days
    regimePerformanceLedger: json("regime_performance_ledger"), // Performance by regime
    selfDoubtCoefficient: decimal("self_doubt_coefficient", {
      precision: 5,
      scale: 4,
    }), // 0-1
    overconfidenceKillSwitch: boolean("overconfidence_kill_switch").default(false),
    signalConfidenceScore: decimal("signal_confidence_score", {
      precision: 5,
      scale: 4,
    }), // 0-1
    recentLossCount: int("recent_loss_count").default(0),
    isSystemBlind: boolean("is_system_blind").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userTimestampIdx: index("meta_user_timestamp_idx").on(
      table.userId,
      table.timestamp
    ),
  })
);

export type MetaIntelligence = typeof metaIntelligence.$inferSelect;
export type InsertMetaIntelligence = typeof metaIntelligence.$inferInsert;

/**
 * Failure Taxonomy: Classification of every loss
 */
export const failureTaxonomy = mysqlTable(
  "failure_taxonomy",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull(),
    tradeId: int("trade_id"),
    failureType: mysqlEnum("failure_type", [
      "thesis_wrong",
      "timing_wrong",
      "structure_wrong",
      "size_wrong",
      "execution_slip",
      "regime_mismatch",
      "black_swan",
      "systemic_failure",
      "model_entropy",
    ]).notNull(),
    lossAmount: decimal("loss_amount", { precision: 12, scale: 2 }).notNull(),
    attribution: json("attribution"), // Breakdown of contributing factors
    signalWeightAdjustment: decimal("signal_weight_adjustment", {
      precision: 5,
      scale: 4,
    }), // Adjustment applied
    timestamp: timestamp("timestamp").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userTimestampIdx: index("failure_user_timestamp_idx").on(
      table.userId,
      table.timestamp
    ),
  })
);

export type FailureTaxonomy = typeof failureTaxonomy.$inferSelect;
export type InsertFailureTaxonomy = typeof failureTaxonomy.$inferInsert;

/**
 * Shadow System: Monte Carlo ruin simulations and existential threats
 */
export const shadowSystem = mysqlTable(
  "shadow_system",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id").notNull(),
    timestamp: timestamp("timestamp").notNull(),
    simulationId: varchar("simulation_id", { length: 64 }).notNull(),
    scenarioDescription: text("scenario_description"), // e.g., "3-day 10% drop + 50% IV spike"
    maxPortfolioDrawdown: decimal("max_portfolio_drawdown", {
      precision: 8,
      scale: 4,
    }),
    probabilityOfRuin: decimal("probability_of_ruin", { precision: 5, scale: 4 }), // 0-1
    weakestPoint: text("weakest_point"), // Description of the weakest exposure
    threatLevel: mysqlEnum("threat_level", ["low", "medium", "high", "critical"]),
    mitigationActions: json("mitigation_actions"), // Array of recommended actions
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userTimestampIdx: index("shadow_user_timestamp_idx").on(
      table.userId,
      table.timestamp
    ),
  })
);

export type ShadowSystem = typeof shadowSystem.$inferSelect;
export type InsertShadowSystem = typeof shadowSystem.$inferInsert;

/**
 * Cross-Asset Correlations: Real-time correlation tracking
 */
export const crossAssetCorrelations = mysqlTable(
  "cross_asset_correlations",
  {
    id: int("id").autoincrement().primaryKey(),
    timestamp: timestamp("timestamp").notNull(),
    spxTltCorrelation: decimal("spx_tlt_correlation", { precision: 5, scale: 4 }),
    vixGoldCorrelation: decimal("vix_gold_correlation", { precision: 5, scale: 4 }),
    hySpreadVixCorrelation: decimal("hy_spread_vix_correlation", {
      precision: 5,
      scale: 4,
    }),
    correlationBreakDetected: boolean("correlation_break_detected").default(false),
    systemicTransitionAlert: boolean("systemic_transition_alert").default(false),
    metadata: json("metadata"), // Additional correlation data
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    timestampIdx: index("correlation_timestamp_idx").on(table.timestamp),
  })
);

export type CrossAssetCorrelation = typeof crossAssetCorrelations.$inferSelect;
export type InsertCrossAssetCorrelation =
  typeof crossAssetCorrelations.$inferInsert;
