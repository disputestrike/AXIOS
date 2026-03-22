/**
 * A+++ Pillar 6: Volatility regime & IV term structure.
 * IV rank percentile (regime-specific), term structure premium (contango/backwardation), skew proxy.
 * Fitted IV surface (polynomial per expiry), term structure, predictIVAtStrike.
 */

export interface IVSurfacePoint {
  strike: number;
  ivCall: number;
  ivPut: number;
  moneyness: number;
  daysToExpiry: number;
}

export interface FittedIVSurface {
  expiry: string;
  spotPrice: number;
  callPolyCoeffs: number[];
  putPolyCoeffs: number[];
  skewIntercept: number;
  fitQuality: number;
  predictedATMSkew: number;
}

/** Least-squares polynomial fit: coeffs[0] + coeffs[1]*x + ... */
function polyfit(x: number[], y: number[], degree: number): number[] {
  const n = x.length;
  if (n <= degree) return Array(degree + 1).fill(0);
  const A: number[][] = x.map((xi) => Array.from({ length: degree + 1 }, (_, j) => Math.pow(xi, j)));
  const AtA: number[][] = Array(degree + 1)
    .fill(0)
    .map(() => Array(degree + 1).fill(0));
  const Aty: number[] = Array(degree + 1).fill(0);
  for (let i = 0; i <= degree; i++) {
    for (let j = 0; j <= degree; j++) {
      for (let k = 0; k < n; k++) AtA[i][j] += A[k][i] * A[k][j];
    }
    for (let k = 0; k < n; k++) Aty[i] += A[k][i] * y[k];
  }
  // Solve AtA * c = Aty (Gaussian elimination)
  const aug = AtA.map((row, i) => [...row, Aty[i]]);
  for (let col = 0; col <= degree; col++) {
    let pivot = col;
    for (let row = col + 1; row <= degree; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) pivot = row;
    }
    [aug[col], aug[pivot]] = [aug[pivot], aug[col]];
    const div = aug[col][col];
    if (Math.abs(div) < 1e-10) continue;
    for (let j = 0; j <= degree + 1; j++) aug[col][j] /= div;
    for (let row = 0; row <= degree; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j <= degree + 1; j++) aug[row][j] -= factor * aug[col][j];
    }
  }
  return aug.map((row) => row[degree + 1]);
}

function polyval(coeffs: number[], x: number): number {
  return coeffs.reduce((sum, c, i) => sum + c * Math.pow(x, i), 0);
}

/** Fit IV surface per expiry (degree-3 polynomial in moneyness). */
export function fitIVSurface(
  points: IVSurfacePoint[],
  expiry: string,
  spotPrice: number
): FittedIVSurface {
  const callPoints = points.filter((p) => p.ivCall > 0);
  const putPoints = points.filter((p) => p.ivPut > 0);
  const degree = 3;
  const callPolyCoeffs =
    callPoints.length > degree
      ? polyfit(
          callPoints.map((p) => p.moneyness),
          callPoints.map((p) => p.ivCall),
          degree
        )
      : [0.25, 0, 0, 0];
  const putPolyCoeffs =
    putPoints.length > degree
      ? polyfit(
          putPoints.map((p) => p.moneyness),
          putPoints.map((p) => p.ivPut),
          degree
        )
      : [0.25, 0, 0, 0];
  const atmMoneyness = 1.0;
  const callATM = polyval(callPolyCoeffs, atmMoneyness);
  const putATM = polyval(putPolyCoeffs, atmMoneyness);
  const skewIntercept = putATM - callATM;
  let fitQuality = 0.5;
  if (callPoints.length > degree) {
    const predicted = callPoints.map((p) => polyval(callPolyCoeffs, p.moneyness));
    const ssRes = callPoints.reduce((s, p, i) => s + Math.pow(p.ivCall - predicted[i], 2), 0);
    const mean = callPoints.reduce((s, p) => s + p.ivCall, 0) / callPoints.length;
    const ssTot = callPoints.reduce((s, p) => s + Math.pow(p.ivCall - mean, 2), 0);
    fitQuality = ssTot > 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 0.5;
  }
  return {
    expiry,
    spotPrice,
    callPolyCoeffs,
    putPolyCoeffs,
    skewIntercept,
    fitQuality,
    predictedATMSkew: skewIntercept,
  };
}

/** Predict IV at strike for a fitted surface. */
export function predictIVAtStrike(
  surface: FittedIVSurface,
  strike: number,
  side: "call" | "put"
): number {
  const moneyness = strike / surface.spotPrice;
  const coeffs = side === "call" ? surface.callPolyCoeffs : surface.putPolyCoeffs;
  return Math.max(0.01, polyval(coeffs, moneyness));
}

/** Term structure from multiple fitted surfaces. */
export function getTermStructure(surfaces: FittedIVSurface[]): {
  expiryDates: string[];
  atmIV: number[];
  skew: number[];
  fitQuality: number[];
} {
  const sorted = [...surfaces].sort(
    (a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime()
  );
  return {
    expiryDates: sorted.map((s) => s.expiry),
    atmIV: sorted.map((s) => (polyval(s.callPolyCoeffs, 1) + polyval(s.putPolyCoeffs, 1)) / 2),
    skew: sorted.map((s) => s.predictedATMSkew),
    fitQuality: sorted.map((s) => s.fitQuality),
  };
}

/**
 * IV term structure premium: contango (far > near) positive for sellers, backwardation negative.
 * Returns multiplier ~0.9–1.15 from nearIV and farIV (e.g. 30d vs 60d).
 */
export function ivTermStructurePremium(nearIV: number, farIV: number, regime: string): number {
  if (!nearIV || nearIV <= 0) return 1.0;
  const ratio = farIV / nearIV;
  const r = (regime || '').toLowerCase();
  const premiumSelling = r.includes('bull_vol_compression') || r === 'mean_reverting' || r.includes('trending_bull');
  if (premiumSelling) {
    if (ratio > 1.05) return 1.1;   // contango: sell near, good
    if (ratio < 0.95) return 0.92; // backwardation: sell near, worse
  } else {
    if (ratio < 0.95) return 1.08;  // backwardation: long vol, good
    if (ratio > 1.05) return 0.95;  // contango: long vol, worse
  }
  return 1.0;
}

/**
 * Vol surface skew: mean-revert bonus if trade exploits skew (e.g. put skew in vol expansion).
 */
export function volSkewAlignment(regime: string, structureType: string, putSkewPercent: number): number {
  const r = (regime || '').toLowerCase();
  const s = (structureType || '').toLowerCase();
  if (r.includes('bear_vol_expansion') && (s.includes('put') || s.includes('vertical_put'))) {
    return 1 + Math.min(0.1, putSkewPercent / 500);
  }
  if (r.includes('bull_vol_expansion') && (s.includes('straddle') || s.includes('strangle'))) {
    return 1.02;
  }
  return 1.0;
}

/**
 * Regime vol alignment: extremes vs midrange preference by regime.
 * Returns 0.95–1.15.
 */
export function regimeVolAlignment(regime: string, ivRank: number): number {
  const r = (regime || '').toLowerCase();
  if (r.includes('bull_vol_compression') || r === 'mean_reverting') {
    if (ivRank >= 20 && ivRank <= 40) return 1.15;
    if (ivRank > 70) return 0.95;
  }
  if (r.includes('bull_vol_expansion')) {
    if (ivRank > 70) return 1.2;
    if (ivRank < 30) return 0.9;
  }
  if (r === 'crisis' || r === 'chaotic') {
    if (ivRank > 80) return 1.1;
  }
  return 1.0;
}

/** Health: last calibration time, avg R², status (for /api/health/iv-surface) */
let lastCalibrationTs = 0;
let lastAvgRsquared = 0;

export function setIVSurfaceLastCalibration(avgRsquared: number): void {
  lastCalibrationTs = Date.now();
  lastAvgRsquared = avgRsquared;
}

export function getIVSurfaceHealth(): {
  lastCalibration: number;
  avgRsquared: number;
  status: string;
} {
  const ageMs = Date.now() - lastCalibrationTs;
  const stale = ageMs > 60_000; // 1 min
  return {
    lastCalibration: lastCalibrationTs,
    avgRsquared: lastAvgRsquared,
    status: lastCalibrationTs === 0 ? "never" : stale ? "stale" : "ok",
  };
}
