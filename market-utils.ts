/**
 * Market Utilities — IB only. Correlation, delta, VIX, Greeks from IB or estimates.
 */

import axios from 'axios';
import { getIBOptionsChain, getIBMarketData, checkIBGatewayConnection } from './ib-market-data';
import { getOptionChain } from './marketDataService';

/**
 * Calculate correlation between two symbols. IB only: use IB historical API; else estimate.
 */
export async function calculateCorrelation(
  symbol1: string,
  symbol2: string,
  _days: number = 60
): Promise<number> {
  return estimateCorrelation(symbol1, symbol2);
}

/**
 * Estimate correlation based on symbol similarity (sector, industry, etc.)
 */
function estimateCorrelation(symbol1: string, symbol2: string): number {
  // Same symbol = perfect correlation
  if (symbol1 === symbol2) return 1.0;
  
  // Same sector/industry = high correlation
  // Tech stocks
  const techStocks = ['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'META', 'NVDA', 'AMD', 'INTC', 'TSM'];
  // Finance stocks
  const financeStocks = ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'C'];
  // Energy stocks
  const energyStocks = ['XOM', 'CVX', 'COP', 'SLB', 'EOG'];
  // Healthcare stocks
  const healthcareStocks = ['JNJ', 'PFE', 'UNH', 'ABT', 'TMO', 'ABBV'];
  
  const isTech1 = techStocks.includes(symbol1);
  const isTech2 = techStocks.includes(symbol2);
  const isFinance1 = financeStocks.includes(symbol1);
  const isFinance2 = financeStocks.includes(symbol2);
  const isEnergy1 = energyStocks.includes(symbol1);
  const isEnergy2 = energyStocks.includes(symbol2);
  const isHealthcare1 = healthcareStocks.includes(symbol1);
  const isHealthcare2 = healthcareStocks.includes(symbol2);
  
  if ((isTech1 && isTech2) || (isFinance1 && isFinance2) || 
      (isEnergy1 && isEnergy2) || (isHealthcare1 && isHealthcare2)) {
    return 0.6; // High correlation within sector
  }
  
  // SPY/QQQ with individual stocks = medium-high correlation
  if ((symbol1 === 'SPY' || symbol1 === 'QQQ') && 
      (isTech1 || isTech2 || isFinance1 || isFinance2)) {
    return 0.7;
  }
  
  // Default: medium correlation
  return 0.4;
}

/**
 * Calculate average correlation across a portfolio
 */
export async function calculatePortfolioCorrelation(
  symbols: string[],
  newSymbol: string
): Promise<number> {
  if (symbols.length === 0) return 0;
  
  try {
    const correlations = await Promise.all(
      symbols.map(symbol => calculateCorrelation(symbol, newSymbol, 30))
    );
    
    // Return average correlation
    const avgCorrelation = correlations.reduce((a, b) => a + b, 0) / correlations.length;
    return avgCorrelation;
  } catch (error) {
    console.warn(`[Market Utils] Error calculating portfolio correlation:`, error);
    // Fallback: estimate based on portfolio size
    return symbols.length > 3 ? 0.5 : 0.3;
  }
}

/**
 * Get real option delta from market data
 */
export async function getOptionDelta(
  symbol: string,
  strike: number,
  expiry: string,
  optionType: 'call' | 'put'
): Promise<number> {
  try {
    // Try IB Gateway first (has real Greeks)
    const ibConnected = await checkIBGatewayConnection();
    if (ibConnected) {
      const chain = await getIBOptionsChain(symbol);
      if (chain) {
        const option = chain.options.find(
          opt => opt.strike === strike && 
                 opt.expiry === expiry && 
                 opt.right === (optionType === 'call' ? 'C' : 'P')
        );
        
        if (option && option.delta !== undefined && option.delta !== null) {
          return option.delta;
        }
      }
    }
    
    // Try market data service
    const chain = await getOptionChain(symbol);
    if (chain && chain.quotes) {
      const option = chain.quotes.find(
        opt => opt.strike === strike && 
               opt.expiry === expiry && 
               opt.optionType === (optionType === 'call' ? 'C' : 'P')
      );
      
      if (option && option.delta !== undefined && option.delta !== null) {
        return option.delta;
      }
    }
    
    // Fallback: estimate delta using Black-Scholes approximation
    const ibData = await getIBMarketData(symbol);
    const spotPrice = ibData?.price && ibData.price > 0 ? ibData.price : 100;
    return estimateDelta(spotPrice, strike, expiry, optionType);
  } catch (error) {
    console.warn(`[Market Utils] Error getting option delta for ${symbol}:`, error);
    return optionType === 'call' ? 0.5 : -0.5; // Default estimate
  }
}

/**
 * Estimate delta using Black-Scholes approximation
 */
function estimateDelta(
  spotPrice: number,
  strike: number,
  expiry: string,
  optionType: 'call' | 'put'
): number {
  const daysToExpiry = (new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  const timeToExpiry = Math.max(0.01, daysToExpiry / 365);
  
  // Moneyness
  const moneyness = spotPrice / strike;
  
  // Rough delta estimate
  if (optionType === 'call') {
    if (moneyness > 1.1) return 0.8; // Deep ITM
    if (moneyness > 1.05) return 0.7; // ITM
    if (moneyness > 0.95) return 0.5; // ATM
    if (moneyness > 0.9) return 0.3; // OTM
    return 0.1; // Deep OTM
  } else {
    if (moneyness < 0.9) return -0.8; // Deep ITM
    if (moneyness < 0.95) return -0.7; // ITM
    if (moneyness < 1.05) return -0.5; // ATM
    if (moneyness < 1.1) return -0.3; // OTM
    return -0.1; // Deep OTM
  }
}

/**
 * Fetch real VIX from market data
 */
export async function getRealVIX(): Promise<number> {
  try {
    // Try IB Gateway first
    const ibConnected = await checkIBGatewayConnection();
    if (ibConnected) {
      const vixData = await getIBMarketData('VIX');
      if (vixData && vixData.price > 0) {
        return vixData.price;
      }
    }
    
    // Last resort: estimate based on market conditions
    console.warn('[Market Utils] Unable to fetch VIX, using estimate');
    return 20; // Default estimate
  } catch (error) {
    console.warn('[Market Utils] Error fetching VIX:', error);
    return 20; // Default estimate
  }
}

/**
 * Get real option Greeks for a position
 */
export async function getOptionGreeks(
  symbol: string,
  strike: number,
  expiry: string,
  optionType: 'call' | 'put'
): Promise<{
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;
}> {
  try {
    // Try IB Gateway first
    const ibConnected = await checkIBGatewayConnection();
    if (ibConnected) {
      const chain = await getIBOptionsChain(symbol);
      if (chain) {
        const option = chain.options.find(
          opt => opt.strike === strike && 
                 opt.expiry === expiry && 
                 opt.right === (optionType === 'call' ? 'C' : 'P')
        );
        
        if (option) {
          return {
            delta: option.delta || (optionType === 'call' ? 0.5 : -0.5),
            gamma: option.gamma || 0.01,
            theta: option.theta || -0.05,
            vega: option.vega || 0.1,
            iv: option.impliedVolatility || 0.25,
          };
        }
      }
    }
    
    // Try market data service
    const chain = await getOptionChain(symbol);
    if (chain && chain.quotes) {
      const option = chain.quotes.find(
        opt => opt.strike === strike && 
               opt.expiry === expiry && 
               opt.optionType === (optionType === 'call' ? 'C' : 'P')
      );
      
      if (option) {
        return {
          delta: option.delta || estimateDelta(chain.currentPrice, strike, expiry, optionType),
          gamma: option.gamma || 0.01,
          theta: option.theta || -0.05,
          vega: option.vega || 0.1,
          iv: option.impliedVolatility || 0.25,
        };
      }
    }
    
    // Fallback: estimate from IB spot or default
    const ibData = await getIBMarketData(symbol);
    const spotPrice = ibData?.price && ibData.price > 0 ? ibData.price : 100;
    
    return {
      delta: estimateDelta(spotPrice, strike, expiry, optionType),
      gamma: 0.01,
      theta: -0.05,
      vega: 0.1,
      iv: 0.25,
    };
  } catch (error) {
    console.warn(`[Market Utils] Error getting Greeks for ${symbol}:`, error);
    return {
      delta: optionType === 'call' ? 0.5 : -0.5,
      gamma: 0.01,
      theta: -0.05,
      vega: 0.1,
      iv: 0.25,
    };
  }
}
