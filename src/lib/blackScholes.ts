/** Standard normal PDF. */
export function npdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, ~1e-7 accuracy). */
export function ncdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}

export interface BsInputs {
  /** Spot price. */
  s: number;
  /** Strike. */
  k: number;
  /** Time to expiry in years. */
  t: number;
  /** Implied vol as a decimal. */
  v: number;
  /** Risk-free rate as a decimal. */
  r?: number;
}

function d1({ s, k, t, v, r = RISK_FREE }: BsInputs): number {
  return (Math.log(s / k) + (r + (v * v) / 2) * t) / (v * Math.sqrt(t));
}

/** Rough front-end rate. Gamma is nearly rate-insensitive, so precision here is not critical. */
export const RISK_FREE = 0.042;

/** dGamma: identical for calls and puts. */
export function bsGamma(i: BsInputs): number {
  if (i.t <= 0 || i.v <= 0 || i.s <= 0) return 0;
  return npdf(d1(i)) / (i.s * i.v * Math.sqrt(i.t));
}

export function bsDelta(i: BsInputs, right: "C" | "P"): number {
  if (i.t <= 0 || i.v <= 0 || i.s <= 0) return right === "C" ? (i.s > i.k ? 1 : 0) : i.s < i.k ? -1 : 0;
  const nd1 = ncdf(d1(i));
  return right === "C" ? nd1 : nd1 - 1;
}

export function bsPrice(i: BsInputs, right: "C" | "P"): number {
  const { s, k, t, v, r = RISK_FREE } = i;
  if (t <= 0 || v <= 0) {
    return Math.max(0, right === "C" ? s - k : k - s);
  }
  const a = d1(i);
  const b = a - v * Math.sqrt(t);
  const disc = Math.exp(-r * t);
  return right === "C"
    ? s * ncdf(a) - k * disc * ncdf(b)
    : k * disc * ncdf(-b) - s * ncdf(-a);
}

/**
 * Probability the underlying finishes beyond `k` under a lognormal walk.
 * Used as a plain-English "chance of touching / finishing" figure, not a
 * risk-neutral guarantee.
 */
export function probAbove(i: BsInputs): number {
  const { s, k, t, v } = i;
  if (t <= 0 || v <= 0) return s > k ? 1 : 0;
  const d2 = (Math.log(s / k) - (v * v) / 2 * t) / (v * Math.sqrt(t));
  return ncdf(d2);
}
