/**
 * Named strategies: Wheel, Short-term, Iron Condors
 * Biases structure selection and entry/exit rules for income and defined-risk styles.
 */

export type StrategyType = 'wheel' | 'short_term' | 'iron_condor' | 'adaptive';

export interface StrategyConfig {
  type: StrategyType;
  /** Preferred structure types (order of preference) */
  preferredStructures: string[];
  /** Max hold days (0 = use regime default) */
  maxHoldDays: number;
  /** Min win probability to enter */
  minWinProbability: number;
  /** Take profit % (e.g. 0.30 = 30%) */
  takeProfitPercent: number;
  /** Stop loss % */
  stopLossPercent: number;
  /** Allow more positions when strategy is income-focused */
  maxPositionsBonus: number;
  description: string;
}

export const STRATEGY_CONFIGS: Record<StrategyType, StrategyConfig> = {
  wheel: {
    type: 'wheel',
    preferredStructures: ['cash_secured_put', 'covered_call', 'vertical_put_spread', 'vertical_call_spread'],
    maxHoldDays: 45,
    minWinProbability: 0.70,
    takeProfitPercent: 0.50, // 50% of credit received
    stopLossPercent: 1.0,    // Interpret as wide; in practice use 50% of max risk or close at 2× credit received. CSP max loss = strike×100 − premium.
    maxPositionsBonus: 1,
    description: 'Sell premium (puts/calls), roll or assign; income-focused, higher win rate.',
  },
  short_term: {
    type: 'short_term',
    preferredStructures: ['vertical_call_spread', 'vertical_put_spread', 'straddle', 'iron_condor'],
    maxHoldDays: 7,
    minWinProbability: 0.60,
    takeProfitPercent: 0.25,
    stopLossPercent: 0.25,
    maxPositionsBonus: 0,
    description: 'Quick in/out; tighter stops, smaller profit targets.',
  },
  iron_condor: {
    type: 'iron_condor',
    preferredStructures: ['iron_condor', 'iron_butterfly', 'calendar_spread', 'vertical_call_spread', 'vertical_put_spread'],
    maxHoldDays: 30,
    minWinProbability: 0.65,
    takeProfitPercent: 0.50,
    stopLossPercent: 1.0,
    maxPositionsBonus: 1,
    description: 'Sell premium both sides; theta decay, defined risk.',
  },
  adaptive: {
    type: 'adaptive',
    preferredStructures: ['vertical_call_spread', 'iron_condor', 'straddle', 'calendar_spread'],
    maxHoldDays: 0, // Use regime default
    minWinProbability: 0.60,
    takeProfitPercent: 0.30,
    stopLossPercent: 0.20,
    maxPositionsBonus: 0,
    description: 'Regime-based structure selection (default engine behavior).',
  },
};

/**
 * Map regime + strategy to preferred structure type for entry.
 * Engine can use this to bias selectOptimalStructure or filter opportunities.
 */
export function getPreferredStructureForRegime(
  strategy: StrategyType,
  regime: string
): string | null {
  const config = STRATEGY_CONFIGS[strategy];
  if (strategy === 'adaptive') return null; // Use services.selectOptimalStructure as-is

  // Regime hints
  if (regime.includes('bull')) {
    const idx = config.preferredStructures.findIndex(s =>
      s.includes('call') || s.includes('call_spread') || s === 'covered_call'
    );
    return idx >= 0 ? config.preferredStructures[idx] : config.preferredStructures[0];
  }
  if (regime.includes('bear')) {
    const idx = config.preferredStructures.findIndex(s =>
      s.includes('put') || s.includes('iron_condor') || s === 'iron_butterfly'
    );
    return idx >= 0 ? config.preferredStructures[idx] : config.preferredStructures[0];
  }
  // Neutral / mean revert
  const idx = config.preferredStructures.findIndex(s =>
    s.includes('iron_condor') || s.includes('calendar') || s.includes('straddle')
  );
  return idx >= 0 ? config.preferredStructures[idx] : config.preferredStructures[0];
}

/**
 * Get take profit / stop loss multipliers for strategy (for dynamic-exits or engine).
 */
export function getExitParams(strategy: StrategyType): { takeProfitPercent: number; stopLossPercent: number } {
  const c = STRATEGY_CONFIGS[strategy];
  return { takeProfitPercent: c.takeProfitPercent, stopLossPercent: c.stopLossPercent };
}

/**
 * Whether this regime is favorable for the strategy (optimize trade selection).
 * Engine uses this to prefer opportunities that match strategy–regime fit.
 */
export function isRegimeFavorableForStrategy(strategy: StrategyType, regime: string): boolean {
  if (strategy === 'adaptive') return true;
  if (regime === 'mean_reverting' || regime === 'chaotic' || regime === 'crisis' || regime === 'liquidity_drought' || regime === 'sector_rotation') {
    return strategy === 'iron_condor' || strategy === 'short_term'; // IC and short-term in chop / stress / rotation
  }
  if (regime.includes('bull')) return strategy === 'wheel' || strategy === 'short_term';
  if (regime.includes('bear')) return strategy === 'iron_condor' || strategy === 'short_term';
  return true;
}

/**
 * Whether the opportunity's structure type is preferred for this strategy.
 * Scanner returns structure.type; we require it to be in strategy's preferred list.
 */
export function isStructurePreferredForStrategy(strategy: StrategyType, structureType: string): boolean {
  if (strategy === 'adaptive') return true;
  const preferred = STRATEGY_CONFIGS[strategy].preferredStructures;
  const normalized = structureType?.toLowerCase().replace(/\s+/g, '_') ?? '';
  return preferred.some(p => normalized.includes(p) || p.includes(normalized));
}

/** Structure type with human-readable label and description (single source of truth). */
export interface StructureTypeInfo {
  id: string;
  label: string;
  description: string;
}

/** All structure types supported by scanner + execution (single source of truth for filters). */
export const ALL_STRUCTURE_TYPES: readonly StructureTypeInfo[] = [
  { id: 'any', label: 'Any strategy', description: 'Any supported options strategy.' },
  { id: 'iron_condor', label: 'Iron condor', description: 'A neutral strategy using four options with two strikes, aiming to profit from low volatility.' },
  { id: 'iron_butterfly', label: 'Iron butterfly', description: 'Similar to an iron condor but with three strike prices, also a neutral strategy.' },
  { id: 'vertical_call_spread', label: 'Vertical call spread', description: 'Involves buying and selling call options at different strikes, either bullish or bearish.' },
  { id: 'vertical_put_spread', label: 'Vertical put spread', description: 'Involves buying and selling put options at different strikes, also bullish or bearish.' },
  { id: 'calendar_spread', label: 'Calendar spread', description: 'Uses options with the same strike but different expiration dates.' },
  { id: 'diagonal_spread', label: 'Diagonal spread', description: 'Combines different strikes and expiration dates for more complex positioning.' },
  { id: 'straddle', label: 'Straddle', description: 'Buying both a call and a put at the same strike and expiration, betting on volatility.' },
  { id: 'strangle', label: 'Strangle', description: 'Similar to a straddle but with out-of-the-money options, also a volatility play.' },
  { id: 'butterfly', label: 'Butterfly', description: 'A three-legged strategy using options at three strikes, typically neutral.' },
  { id: 'cash_secured_put', label: 'Cash secured put', description: 'Selling a put option while having enough cash to buy the stock if assigned.' },
  { id: 'covered_call', label: 'Covered call', description: 'Selling a call option against shares of stock already owned.' },
];

/** Get structure label and description by id (for UI). */
export function getStructureTypeInfo(structureId: string): StructureTypeInfo | null {
  const normalized = (structureId ?? '').toLowerCase().replace(/\s+/g, '_').trim();
  return ALL_STRUCTURE_TYPES.find((s) => s.id === normalized) ?? ALL_STRUCTURE_TYPES.find((s) => s.id !== 'any' && normalized.includes(s.id)) ?? null;
}

/** All regime labels for filter dropdown. */
export const ALL_REGIMES = [
  { id: 'any', label: 'Any regime' },
  { id: 'bull', label: 'Bull (vol expansion/compression)' },
  { id: 'bear', label: 'Bear (vol expansion/compression)' },
  { id: 'mean_reverting', label: 'Mean reverting' },
  { id: 'chaotic', label: 'Chaotic' },
  { id: 'crisis', label: 'Crisis' },
  { id: 'liquidity_drought', label: 'Liquidity drought' },
  { id: 'trending_bull', label: 'Trending bull (momentum)' },
  { id: 'trending_bear', label: 'Trending bear (momentum)' },
  { id: 'sector_rotation', label: 'Sector rotation' },
] as const;

/** Strategy types (wheel, short_term, iron_condor, adaptive) for engine/display. */
export const STRATEGY_TYPE_LABELS: { id: StrategyType; label: string }[] = [
  { id: 'adaptive', label: 'Adaptive (regime-based)' },
  { id: 'wheel', label: 'Wheel (income)' },
  { id: 'short_term', label: 'Short-term' },
  { id: 'iron_condor', label: 'Iron condor' },
];
