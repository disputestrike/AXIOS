/**
 * Intra-month drawdown tracking and auto-stop
 * Tracks peak equity, current drawdown %; status ok / warning / critical.
 */

export interface DrawdownStatus {
  peakEquity: number;
  currentEquity: number;
  drawdownPercent: number;
  status: 'ok' | 'warning' | 'critical';
  timeToResetMs: number;
  monthStart: number;
  exceeded: boolean;
}

const DEFAULT_MAX_DRAWDOWN_PERCENT = 15;
const WARNING_THRESHOLD_PERCENT = 10;
const INITIAL_EQUITY = 100_000;

let peakEquity = 0;
let monthStartTs = 0;
let lastEquity = INITIAL_EQUITY;
let tradingStoppedDueToDrawdown = false;

function getMonthStart(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return start.getTime();
}

function getNextMonthStart(): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return next.getTime();
}

/**
 * Initialize or reset drawdown tracker (e.g. at month start).
 * Call with current equity to set peak if starting fresh.
 */
export function initDrawdownTracker(currentEquity: number): void {
  lastEquity = currentEquity;
  const monthStart = getMonthStart();
  if (monthStart !== monthStartTs) {
    monthStartTs = monthStart;
    peakEquity = currentEquity;
    tradingStoppedDueToDrawdown = false;
  }
  if (currentEquity > peakEquity) peakEquity = currentEquity;
}

/**
 * Update drawdown after a trade or equity change.
 * Call with current total equity (e.g. account value).
 */
export function updateDrawdown(currentEquity: number): void {
  lastEquity = currentEquity;
  const monthStart = getMonthStart();
  if (monthStart !== monthStartTs) {
    monthStartTs = monthStart;
    peakEquity = currentEquity;
    tradingStoppedDueToDrawdown = false;
  }
  if (currentEquity > peakEquity) peakEquity = currentEquity;
  const maxDd = Number(process.env.MAX_DRAWDOWN_PERCENT) || DEFAULT_MAX_DRAWDOWN_PERCENT;
  const ddPct = peakEquity > 0 ? ((peakEquity - currentEquity) / peakEquity) * 100 : 0;
  if (ddPct >= maxDd) tradingStoppedDueToDrawdown = true;
}

/**
 * Get current drawdown status for API and engine.
 * Pass currentEquity to use live value; omit to use last value from updateDrawdown().
 */
export function getDrawdownStatus(currentEquity?: number): DrawdownStatus {
  const equity = currentEquity ?? lastEquity;
  const monthStart = getMonthStart();
  if (monthStart !== monthStartTs || peakEquity === 0) {
    monthStartTs = monthStart;
    if (peakEquity === 0 || equity > peakEquity) peakEquity = equity;
  }
  const maxDd = Number(process.env.MAX_DRAWDOWN_PERCENT) || DEFAULT_MAX_DRAWDOWN_PERCENT;
  const drawdownPercent = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
  let status: 'ok' | 'warning' | 'critical' = 'ok';
  if (drawdownPercent >= maxDd) status = 'critical';
  else if (drawdownPercent >= WARNING_THRESHOLD_PERCENT) status = 'warning';
  const nextMonth = getNextMonthStart();
  const timeToResetMs = Math.max(0, nextMonth - Date.now());
  return {
    peakEquity,
    currentEquity: equity,
    drawdownPercent,
    status,
    timeToResetMs,
    monthStart: monthStartTs,
    exceeded: tradingStoppedDueToDrawdown,
  };
}

/**
 * Whether trading should be stopped due to drawdown (for engine gate).
 */
export function isTradingStoppedDueToDrawdown(): boolean {
  return tradingStoppedDueToDrawdown;
}

/**
 * Clear the stop flag (e.g. after manual override or month reset).
 */
export function clearDrawdownStop(): void {
  tradingStoppedDueToDrawdown = false;
}
