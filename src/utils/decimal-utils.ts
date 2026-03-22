/**
 * Decimal Utility Functions
 * Handles all financial calculations with proper precision
 */

export function calculatePnL(entryPrice: number, exitPrice: number, quantity: number): number {
  return (exitPrice - entryPrice) * quantity;
}

export function calculatePnLPercent(entryPrice: number, exitPrice: number): number {
  return ((exitPrice - entryPrice) / entryPrice) * 100;
}

export function roundToNearestCent(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatCurrency(value: number): string {
  return '$' + value.toFixed(2);
}

export default {
  calculatePnL,
  calculatePnLPercent,
  roundToNearestCent,
  formatCurrency
};
