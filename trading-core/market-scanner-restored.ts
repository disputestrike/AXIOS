/**
 * Market Scanner - Opportunity Generation with Strike Validation
 * 
 * Scans underlying universe for trading opportunities.
 * VALIDATES: All strike prices exist in IBKR data before ranking.
 */

import { getIBKRConnection } from './ibkr-unified';

// ============================================================================
// TYPES
// ============================================================================

export interface MarketOpportunity {
  id: string;
  symbol: string;
  strike: number;
  expiry: string;
  optionType: 'C' | 'P';
  score: number; // 0-100
  expectedPrice: number; // Entry price estimate
  expectedMove: number; // Expected price move %
  signal: string; // What triggered this (e.g., "gamma_flip", "vol_expansion")
  confidence: number; // 0-1
  regime: string;
  expirationDays: number;
  timestamp: number;
}

export interface ScanResult {
  timestamp: number;
  opportunities: MarketOpportunity[];
  scannedSymbols: number;
  validatedStrikes: number;
  rejectedStikes: number;
}

// ============================================================================
// SCANNER
// ============================================================================

class MarketScanner {
  private ibkr = getIBKRConnection();
  private scanCache = new Map<string, MarketOpportunity[]>();
  private lastScanTime = 0;
  private SCAN_CACHE_MS = 5000; // Cache for 5 seconds

  // Universe of underlyings to scan
  private UNIVERSE = [
    'SPY', 'QQQ', 'IWM', 'GLD', 'TLT', 'USO',
    'AAPL', 'MSFT', 'GOOGL', 'NVDA', 'AMD', 'TSLA',
    'XLF', 'XLV', 'XLU', 'XLK', 'XLI', 'XLRE',
  ];

  // Expiration preferences (days out)
  private PREFERRED_EXPIRATIONS = [7, 14, 21, 30, 45, 60];

  /**
   * Full universe scan - validates every strike before ranking
   */
  public async scan(forceRefresh = false): Promise<ScanResult> {
    const now = Date.now();

    // Return cached if fresh
    if (!forceRefresh && now - this.lastScanTime < this.SCAN_CACHE_MS) {
      return this.getCachedResult();
    }

    const allOpportunities: MarketOpportunity[] = [];
    let scannedSymbols = 0;
    let validatedStrikes = 0;
    let rejectedStrikes = 0;

    console.log('[Scanner] Starting universe scan...');

    for (const symbol of this.UNIVERSE) {
      try {
        scannedSymbols++;

        // Get option chain from IBKR
        const chain = await this.ibkr.getOptionChain(symbol);
        if (!chain) {
          console.warn(`[Scanner] No option chain for ${symbol}`);
          continue;
        }

        // Scan each expiration
        for (const expiry of chain.expirations) {
          const strikeData = chain.strikes.get(expiry);
          if (!strikeData) continue;

          // Get days to expiration
          const expirationDays = this.daysToExpiration(expiry);
          if (expirationDays < 0) continue; // Expired

          // Skip distant expirations (> 90 days)
          if (expirationDays > 90) continue;

          // Analyze each strike
          for (const strike of strikeData) {
            // VALIDATE: Strike must exist in IBKR (check if it has price data)
            const callHasPrice = strike.call.bid > 0 || strike.call.ask > 0;
            const putHasPrice = strike.put.bid > 0 || strike.put.ask > 0;

            if (!callHasPrice && !putHasPrice) {
              rejectedStrikes++;
              continue; // No quotes - invalid strike
            }

            // Generate score based on market conditions
            const callScore = callHasPrice ? this.scoreOption(strike.call, 'call', chain.spot, strike.strike, expirationDays) : 0;
            const putScore = putHasPrice ? this.scoreOption(strike.put, 'put', chain.spot, strike.strike, expirationDays) : 0;

            // Call opportunity
            if (callScore > 50 && callHasPrice) {
              validatedStrikes++;
              allOpportunities.push({
                id: `${symbol}_${expiry}_${strike.strike}_C`,
                symbol,
                strike: strike.strike,
                expiry,
                optionType: 'C',
                score: callScore,
                expectedPrice: (strike.call.bid + strike.call.ask) / 2,
                expectedMove: this.calculateExpectedMove(chain.spot, strike.strike, strike.call.impliedVol, expirationDays),
                signal: this.generateSignal(strike.call, chain.spot, strike.strike, 'call'),
                confidence: Math.min(1, (callScore / 100) * 0.9),
                regime: this.classifyRegime(chain.spot, strike.strike),
                expirationDays,
                timestamp: now,
              });
            }

            // Put opportunity
            if (putScore > 50 && putHasPrice) {
              validatedStrikes++;
              allOpportunities.push({
                id: `${symbol}_${expiry}_${strike.strike}_P`,
                symbol,
                strike: strike.strike,
                expiry,
                optionType: 'P',
                score: putScore,
                expectedPrice: (strike.put.bid + strike.put.ask) / 2,
                expectedMove: this.calculateExpectedMove(chain.spot, strike.strike, strike.put.impliedVol, expirationDays),
                signal: this.generateSignal(strike.put, chain.spot, strike.strike, 'put'),
                confidence: Math.min(1, (putScore / 100) * 0.9),
                regime: this.classifyRegime(chain.spot, strike.strike),
                expirationDays,
                timestamp: now,
              });
            }
          }
        }
      } catch (error) {
        console.warn(`[Scanner] Error scanning ${symbol}:`, error instanceof Error ? error.message : error);
      }
    }

    // Sort by score
    allOpportunities.sort((a, b) => b.score - a.score);

    // Keep top 50
    const topOpportunities = allOpportunities.slice(0, 50);

    const result: ScanResult = {
      timestamp: now,
      opportunities: topOpportunities,
      scannedSymbols,
      validatedStrikes,
      rejectedStikes: rejectedStrikes,
    };

    this.scanCache.set('last', topOpportunities);
    this.lastScanTime = now;

    console.log(`[Scanner] Scan complete: ${topOpportunities.length} opportunities found`);
    console.log(`[Scanner] Validated ${validatedStrikes} strikes, rejected ${rejectedStrikes}`);

    return result;
  }

  /**
   * Score an option based on market microstructure
   */
  private scoreOption(
    option: any,
    type: 'call' | 'put',
    spot: number,
    strike: number,
    daysToExp: number
  ): number {
    let score = 50; // Base score

    // Bid-ask spread scoring (tighter = better)
    const spread = option.ask - option.bid;
    const spreadPercent = (spread / ((option.bid + option.ask) / 2)) * 100;
    if (spreadPercent < 5) score += 15;
    else if (spreadPercent < 10) score += 10;
    else if (spreadPercent > 20) score -= 10;

    // Volume scoring (more liquidity = better)
    if (option.volume > 100) score += 15;
    else if (option.volume > 50) score += 10;
    else if (option.volume > 10) score += 5;
    else if (option.volume === 0) score -= 10;

    // Open interest scoring
    if (option.openInterest > 500) score += 10;
    else if (option.openInterest > 100) score += 5;

    // Implied volatility scoring (prefer normal ranges)
    if (option.impliedVol > 0.15 && option.impliedVol < 0.60) score += 10;
    else if (option.impliedVol > 0.60) score += 5; // High vol can be opportunity
    else if (option.impliedVol < 0.15) score -= 5; // Very low vol

    // Moneyness scoring
    const moneyness = type === 'call' ? spot / strike : strike / spot;
    if (moneyness > 0.95 && moneyness < 1.05) score += 5; // Near ATM
    else if (moneyness > 0.90 && moneyness < 1.10) score += 2; // Slightly OTM/ITM

    // Days to expiration scoring (prefer 7-30 DTE for decay)
    if (daysToExp >= 7 && daysToExp <= 30) score += 10;
    else if (daysToExp >= 30 && daysToExp <= 60) score += 5;
    else if (daysToExp < 7) score -= 10; // Too close to expiration

    // Delta scoring (prefer defined deltas)
    const delta = Math.abs(option.delta);
    if (delta > 0.20 && delta < 0.80) score += 5;

    // Gamma scoring (positive gamma)
    if (option.gamma > 0.001) score += 3;

    // Theta scoring (time decay in our favor)
    if (type === 'call' && option.theta < 0) score += 2;
    if (type === 'put' && option.theta < 0) score += 2;

    // Vega scoring (avoid high vega if expecting low vol)
    if (option.vega > 0 && option.vega < 0.5) score += 2;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate signal description
   */
  private generateSignal(option: any, spot: number, strike: number, type: string): string {
    const spread = option.ask - option.bid;
    const spreadPercent = (spread / ((option.bid + option.ask) / 2)) * 100;

    if (spreadPercent < 5 && option.volume > 100) {
      return `tight_spread_${type}`;
    }
    if (option.impliedVol > 0.50) {
      return 'high_volatility';
    }
    if (option.volume > 200) {
      return 'high_volume';
    }
    if (Math.abs(option.delta) > 0.60) {
      return `deep_itm_${type}`;
    }
    if (Math.abs(option.gamma) > 0.005) {
      return 'high_gamma';
    }

    return 'general_opportunity';
  }

  /**
   * Calculate expected price move
   */
  private calculateExpectedMove(spot: number, strike: number, iv: number, daysToExp: number): number {
    // Black-Scholes estimate of move
    const sqrtT = Math.sqrt(daysToExp / 365);
    const expectedMove = spot * iv * sqrtT;
    return (expectedMove / spot) * 100; // As percentage
  }

  /**
   * Classify market regime
   */
  private classifyRegime(spot: number, strike: number): string {
    const distance = (strike - spot) / spot;

    if (distance > 0.05) return 'bearish'; // Puts OTM
    if (distance < -0.05) return 'bullish'; // Calls OTM
    return 'neutral';
  }

  /**
   * Days until expiration
   */
  private daysToExpiration(expiryStr: string): number {
    if (!/^\d{8}$/.test(expiryStr)) return -1;

    const y = parseInt(expiryStr.slice(0, 4), 10);
    const m = parseInt(expiryStr.slice(4, 6), 10) - 1;
    const d = parseInt(expiryStr.slice(6, 8), 10);

    const expiryDate = new Date(y, m, d);
    const now = new Date();
    const diffMs = expiryDate.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

    return diffDays;
  }

  /**
   * Get cached result
   */
  private getCachedResult(): ScanResult {
    const cached = this.scanCache.get('last') || [];
    return {
      timestamp: this.lastScanTime,
      opportunities: cached,
      scannedSymbols: this.UNIVERSE.length,
      validatedStrikes: cached.length,
      rejectedStikes: 0,
    };
  }

  /**
   * Get top opportunities for a specific symbol
   */
  public async getSymbolOpportunities(symbol: string, limit = 10): Promise<MarketOpportunity[]> {
    const result = await this.scan();
    return result.opportunities
      .filter(opp => opp.symbol === symbol)
      .slice(0, limit);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let scannerInstance: MarketScanner | null = null;

export function getMarketScanner(): MarketScanner {
  if (!scannerInstance) {
    scannerInstance = new MarketScanner();
  }
  return scannerInstance;
}

export function resetMarketScanner(): void {
  scannerInstance = null;
}
