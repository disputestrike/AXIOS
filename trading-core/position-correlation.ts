/**
 * POSITION CORRELATION MANAGER
 * 
 * Prevents having multiple correlated positions
 * Automatically hedges or closes positions if correlation gets too high
 */

import { Position } from './types'

export interface CorrelationMetrics {
  symbol1: string
  symbol2: string
  correlation: number
  riskExposure: number
  hedgeRecommendation: string | null
}

export interface SectorExposure {
  technology: number      // AAPL, MSFT, NVDA, META, GOOGL, NFLX
  financials: number      // JPM, GS, BAC
  industrials: number     // BA
  materials: number       // MU, AMD
  utilities: number       // TLT
  energyEquivalent: number // None for SPX, but tracked
}

export class PositionCorrelationManager {
  private correlationMatrix: Map<string, Map<string, number>> = new Map()
  private sectorMap: Map<string, string> = new Map([
    // Tech
    ['AAPL', 'technology'],
    ['MSFT', 'technology'],
    ['NVDA', 'technology'],
    ['META', 'technology'],
    ['GOOGL', 'technology'],
    ['NFLX', 'technology'],
    ['AMD', 'technology'],
    ['MU', 'technology'],
    // Financials
    ['JPM', 'financials'],
    ['GS', 'financials'],
    // Industrials
    ['BA', 'industrials'],
    // Bonds
    ['TLT', 'utilities'],
    // Indices
    ['SPY', 'broad_market'],
    ['QQQ', 'tech_heavy'],
    ['IWM', 'small_cap']
  ])

  /**
   * CHECK IF NEW POSITION CORRELATES TOO MUCH WITH EXISTING POSITIONS
   */
  canAddPosition(newSymbol: string, existingPositions: Position[]): { allowed: boolean; reason?: string } {
    // Check sector exposure
    const sector = this.sectorMap.get(newSymbol) || 'unknown'
    const currentSectorExposure = this.calculateSectorExposure(existingPositions)

    // Rule 1: Don't have more than 2 positions in same sector
    const positionsInSector = existingPositions.filter(p => this.sectorMap.get(p.symbol) === sector).length
    if (positionsInSector >= 2) {
      return {
        allowed: false,
        reason: `Already have 2 positions in ${sector} sector. New symbol: ${newSymbol}`
      }
    }

    // Rule 2: Don't have too much tech exposure (most correlated)
    if (sector === 'technology' && currentSectorExposure.technology > 0.5) {
      return {
        allowed: false,
        reason: `Tech exposure already at 50%+. Would exceed limit.`
      }
    }

    // Rule 3: Check individual correlations
    for (const position of existingPositions) {
      const correlation = this.getCorrelation(newSymbol, position.symbol)
      if (correlation > 0.85) {
        return {
          allowed: false,
          reason: `High correlation (${(correlation * 100).toFixed(1)}%) with existing position: ${position.symbol}`
        }
      }
    }

    return { allowed: true }
  }

  /**
   * GET CORRELATION BETWEEN TWO SYMBOLS
   */
  private getCorrelation(symbol1: string, symbol2: string): number {
    // Pre-calculated correlations (in production, would use real data)
    const correlations: Record<string, Record<string, number>> = {
      'AAPL': { 'MSFT': 0.72, 'NVDA': 0.68, 'META': 0.71, 'GOOGL': 0.70, 'NFLX': 0.65, 'AMD': 0.75, 'JPM': 0.45, 'TLT': -0.10 },
      'MSFT': { 'AAPL': 0.72, 'NVDA': 0.70, 'META': 0.72, 'GOOGL': 0.71, 'NFLX': 0.67, 'AMD': 0.73, 'JPM': 0.48, 'TLT': -0.12 },
      'NVDA': { 'AAPL': 0.68, 'MSFT': 0.70, 'META': 0.75, 'GOOGL': 0.70, 'NFLX': 0.65, 'AMD': 0.78, 'JPM': 0.42, 'TLT': -0.08 },
      'META': { 'AAPL': 0.71, 'MSFT': 0.72, 'NVDA': 0.75, 'GOOGL': 0.82, 'NFLX': 0.70, 'AMD': 0.74, 'JPM': 0.44, 'TLT': -0.09 },
      'GOOGL': { 'AAPL': 0.70, 'MSFT': 0.71, 'NVDA': 0.70, 'META': 0.82, 'NFLX': 0.68, 'AMD': 0.72, 'JPM': 0.46, 'TLT': -0.11 },
      'AMD': { 'AAPL': 0.75, 'MSFT': 0.73, 'NVDA': 0.78, 'META': 0.74, 'GOOGL': 0.72, 'NFLX': 0.66, 'JPM': 0.44, 'TLT': -0.07 },
      'JPM': { 'GS': 0.88, 'BA': 0.72, 'AAPL': 0.45, 'TLT': -0.35 },
      'GS': { 'JPM': 0.88, 'BA': 0.75, 'AAPL': 0.44, 'TLT': -0.38 },
      'BA': { 'JPM': 0.72, 'GS': 0.75, 'AAPL': 0.52, 'TLT': -0.20 },
      'TLT': { 'AAPL': -0.10, 'JPM': -0.35, 'GS': -0.38, 'BA': -0.20 },
      'SPY': { 'QQQ': 0.80, 'IWM': 0.85 },
      'QQQ': { 'SPY': 0.80, 'AAPL': 0.75, 'MSFT': 0.78, 'NVDA': 0.81 },
      'IWM': { 'SPY': 0.85, 'BA': 0.68 }
    }

    return correlations[symbol1]?.[symbol2] ?? correlations[symbol2]?.[symbol1] ?? 0.5
  }

  /**
   * CALCULATE SECTOR EXPOSURE
   */
  private calculateSectorExposure(positions: Position[]): SectorExposure {
    const exposure: SectorExposure = {
      technology: 0,
      financials: 0,
      industrials: 0,
      materials: 0,
      utilities: 0,
      energyEquivalent: 0
    }

    const totalExposure = positions.reduce((sum, p) => sum + p.unrealizedPnL, 0)
    if (totalExposure === 0) return exposure

    for (const position of positions) {
      const weight = position.unrealizedPnL / totalExposure
      const sector = this.sectorMap.get(position.symbol) || 'unknown'

      if (sector === 'technology') exposure.technology += weight
      if (sector === 'financials') exposure.financials += weight
      if (sector === 'industrials') exposure.industrials += weight
      if (sector === 'utilities') exposure.utilities += weight
    }

    return exposure
  }

  /**
   * GET HEDGE RECOMMENDATION
   */
  getHedgeRecommendation(positions: Position[]): { hedge?: string; reason?: string } {
    const exposure = this.calculateSectorExposure(positions)

    // If tech is >60%, suggest adding TLT (inverse correlation)
    if (exposure.technology > 0.6) {
      const techPositions = positions.filter(p => this.sectorMap.get(p.symbol) === 'technology')
      const hasTLT = positions.some(p => p.symbol === 'TLT')

      if (!hasTLT) {
        return {
          hedge: 'TLT',
          reason: `Tech exposure at ${(exposure.technology * 100).toFixed(0)}%. TLT hedge recommended.`
        }
      }
    }

    // If financials >50%, suggest spreading across sectors
    if (exposure.financials > 0.5) {
      return {
        reason: `Financials exposure at ${(exposure.financials * 100).toFixed(0)}%. Consider tech or utilities.`
      }
    }

    return {}
  }

  /**
   * GET CORRELATION REPORT
   */
  getCorrelationReport(positions: Position[]): CorrelationMetrics[] {
    const report: CorrelationMetrics[] = []

    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const p1 = positions[i]
        const p2 = positions[j]
        const correlation = this.getCorrelation(p1.symbol, p2.symbol)

        report.push({
          symbol1: p1.symbol,
          symbol2: p2.symbol,
          correlation,
          riskExposure: correlation * Math.min(p1.unrealizedPnL, p2.unrealizedPnL),
          hedgeRecommendation: correlation > 0.75 ? 'Consider closing one position' : null
        })
      }
    }

    return report.sort((a, b) => b.correlation - a.correlation)
  }
}
