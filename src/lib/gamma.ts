import { bsGamma } from "./blackScholes";
import type { Chain, Contract } from "./types";

const SHARES_PER_CONTRACT = 100;

export interface StrikeGamma {
  strike: number;
  callGex: number;
  putGex: number;
  netGex: number;
  callOi: number;
  putOi: number;
}

export interface ExpiryGamma {
  expiry: string;
  dte: number;
  /** Net dealer gamma booked to this expiry. */
  netGex: number;
  /** Gamma magnitude, which is what decides where the walls come from. */
  absGex: number;
  openInterest: number;
}

export interface GammaProfile {
  /** Net dealer gamma in $ per 1% move, summed across the filtered chain. */
  totalGex: number;
  perStrike: StrikeGamma[];
  /** Strike with the largest positive (call) gamma — acts as a magnet/ceiling. */
  callWall: number | null;
  /** Strike with the largest negative (put) gamma — acts as a support shelf. */
  putWall: number | null;
  /** Spot level where net dealer gamma flips sign. */
  gammaFlip: number | null;
  /** Sign of dealer positioning at the current spot. */
  regime: "positive" | "negative";
  /** Curve of net GEX vs hypothetical spot, for charting the flip. */
  curve: { spot: number; gex: number }[];
  /** Expiries included in this profile. */
  expiries: string[];
  /** Gamma booked to each expiry, so callers can see where the walls live. */
  perExpiry: ExpiryGamma[];
  /** 1-sigma move over the profile horizon, in dollars. */
  expectedMove: number;
  /** ATM implied vol used for the expected move. */
  atmIv: number;
  horizonDays: number;
}

/**
 * Dealer gamma exposure at a given spot, using the standard retail convention:
 * dealers are assumed long calls and short puts against customer flow, so call
 * gamma adds and put gamma subtracts. It is a positioning proxy, not a
 * measured dealer book.
 */
function gexAt(contracts: Contract[], spot: number, now: number): number {
  let total = 0;
  for (const c of contracts) {
    const t = c.dte / 365;
    if (t <= 0 || c.iv <= 0) continue;
    const g = bsGamma({ s: spot, k: c.strike, t, v: c.iv });
    const notional = g * c.openInterest * SHARES_PER_CONTRACT * spot * spot * 0.01;
    total += c.right === "C" ? notional : -notional;
  }
  void now;
  return total;
}

/**
 * Vol of the strike nearest spot in the expiry nearest `targetDte`. Anchoring
 * to the horizon matters: front-week vol spikes around events and would
 * badly overstate a 30-day expected move.
 */
function atmIv(contracts: Contract[], spot: number, targetDte: number): number {
  let best: Contract | null = null;
  let bestScore = Infinity;
  for (const c of contracts) {
    if (c.iv <= 0) continue;
    const strikeErr = Math.abs(c.strike - spot) / spot;
    const dteErr = Math.abs(c.dte - targetDte) / Math.max(targetDte, 1);
    const score = strikeErr * 3 + dteErr;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best?.iv ?? 0.25;
}

export interface GammaOptions {
  /** Only include expiries at or before this many days out. */
  maxDte?: number;
  /**
   * Drop expiries closer than this. Gamma goes to infinity as time to expiry
   * goes to zero, so contracts in their last hours carry more weight than the
   * entire rest of the chain even on thin open interest, and `daysToExpiry`
   * floors expired contracts at one hour rather than dropping them. Both put
   * dead strikes in charge of where the walls sit. Nothing here trades inside
   * three days, so half a day is a safe floor.
   */
  minDte?: number;
  /** Only include strikes within this fraction of spot. */
  strikeWindow?: number;
}

export function buildGammaProfile(chain: Chain, opts: GammaOptions = {}): GammaProfile {
  const spot = chain.underlying.price;
  const maxDte = opts.maxDte ?? 60;
  const minDte = opts.minDte ?? 0.5;
  const window = opts.strikeWindow ?? 0.25;
  const now = Date.now();

  const inScope = chain.contracts.filter(
    (c) =>
      c.dte <= maxDte &&
      c.dte >= minDte &&
      c.openInterest > 0 &&
      c.iv > 0 &&
      Math.abs(c.strike - spot) / spot <= window,
  );

  const byStrike = new Map<number, StrikeGamma>();
  const byExpiry = new Map<string, ExpiryGamma>();
  for (const c of inScope) {
    const t = c.dte / 365;
    const g = bsGamma({ s: spot, k: c.strike, t, v: c.iv });
    const notional = g * c.openInterest * SHARES_PER_CONTRACT * spot * spot * 0.01;

    const exp =
      byExpiry.get(c.expiry) ??
      { expiry: c.expiry, dte: c.dte, netGex: 0, absGex: 0, openInterest: 0 };
    exp.netGex += c.right === "C" ? notional : -notional;
    exp.absGex += notional;
    exp.openInterest += c.openInterest;
    exp.dte = Math.min(exp.dte, c.dte);
    byExpiry.set(c.expiry, exp);

    const row =
      byStrike.get(c.strike) ??
      { strike: c.strike, callGex: 0, putGex: 0, netGex: 0, callOi: 0, putOi: 0 };
    if (c.right === "C") {
      row.callGex += notional;
      row.callOi += c.openInterest;
    } else {
      row.putGex -= notional;
      row.putOi += c.openInterest;
    }
    row.netGex = row.callGex + row.putGex;
    byStrike.set(c.strike, row);
  }

  const perStrike = [...byStrike.values()].sort((a, b) => a.strike - b.strike);
  const totalGex = perStrike.reduce((s, r) => s + r.netGex, 0);

  const callWall =
    perStrike.reduce<StrikeGamma | null>(
      (best, r) => (r.callGex > (best?.callGex ?? 0) ? r : best),
      null,
    )?.strike ?? null;
  const putWall =
    perStrike.reduce<StrikeGamma | null>(
      (best, r) => (r.putGex < (best?.putGex ?? 0) ? r : best),
      null,
    )?.strike ?? null;

  // Walk spot across a band and find where net gamma changes sign.
  const curve: { spot: number; gex: number }[] = [];
  const lo = spot * (1 - window * 0.8);
  const hi = spot * (1 + window * 0.8);
  const steps = 41;
  for (let i = 0; i < steps; i++) {
    const s = lo + ((hi - lo) * i) / (steps - 1);
    curve.push({ spot: s, gex: gexAt(inScope, s, now) });
  }

  let gammaFlip: number | null = null;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (a.gex === 0) { gammaFlip = a.spot; break; }
    if (a.gex < 0 !== b.gex < 0) {
      // Linear interpolation of the zero crossing.
      const frac = Math.abs(a.gex) / (Math.abs(a.gex) + Math.abs(b.gex));
      gammaFlip = a.spot + (b.spot - a.spot) * frac;
      break;
    }
  }

  const horizonDays = Math.min(maxDte, 30);
  const iv = atmIv(inScope, spot, horizonDays);
  const expectedMove = spot * iv * Math.sqrt(horizonDays / 365);

  return {
    totalGex,
    perStrike,
    callWall,
    putWall,
    gammaFlip,
    regime: totalGex >= 0 ? "positive" : "negative",
    curve,
    expiries: [...new Set(inScope.map((c) => c.expiry))].sort(),
    perExpiry: [...byExpiry.values()].sort((a, b) => a.dte - b.dte),
    expectedMove,
    atmIv: iv,
    horizonDays,
  };
}
