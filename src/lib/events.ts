import type { GammaProfile } from "./gamma";
import type { Chain, Contract } from "./types";

/**
 * A dated event priced into the chain. There is no free earnings calendar that
 * survives a rate limiter, so this reads the event straight out of the volatility
 * term structure instead: when one expiry carries far more forward variance than
 * its neighbours, the market is paying up for something that happens inside that
 * window.
 */
export interface EventWindow {
  /** First expiry whose price embeds the event. */
  expiry: string;
  /** Prior expiry. The event lands after this date and on or before `expiry`. */
  after: string | null;
  dte: number;
  /** Annualized forward vol across the window. */
  forwardIv: number;
  /** Median forward vol across the rest of the term structure. */
  baselineIv: number;
  /** forwardIv / baselineIv. 1.6 means the window is 60% richer than normal. */
  ratio: number;
}

/**
 * Where the gamma you are reading actually lives. Walls are built from open
 * interest, and most open interest sits in a single expiry, so a trade that runs
 * past that date is leaning on a wall that has already expired.
 */
export interface WallRolloff {
  expiry: string;
  /** Share of in scope gamma sitting in that expiry, 0 to 1. */
  share: number;
  /** True when it is a standard monthly expiry, the third Friday. */
  monthly: boolean;
  dte: number;
}

export interface EventRead {
  event: EventWindow | null;
  rolloff: WallRolloff | null;
}

/** Standard monthly expiry: the third Friday of the month. */
export function isMonthlyOpex(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCDay() === 5 && d >= 15 && d <= 21;
}

/** At the money vol for one expiry, blending the call and put nearest spot. */
function atmIvForExpiry(contracts: Contract[], spot: number): number | null {
  let best: number | null = null;
  const pick = (right: "C" | "P") => {
    let chosen: Contract | null = null;
    let err = Infinity;
    for (const c of contracts) {
      if (c.right !== right || c.iv <= 0 || c.openInterest <= 0) continue;
      const e = Math.abs(c.strike - spot);
      if (e < err) {
        err = e;
        chosen = c;
      }
    }
    return chosen;
  };
  const call = pick("C");
  const put = pick("P");
  const ivs = [call?.iv, put?.iv].filter((v): v is number => typeof v === "number" && v > 0);
  if (ivs.length) best = ivs.reduce((a, b) => a + b, 0) / ivs.length;
  return best;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Forward vol between consecutive expiries. Total variance (iv squared times
 * time) accumulates, so the variance added between two expiries, annualized, is
 * the market's price of vol for just that window. An earnings date shows up as
 * one window priced far above the rest.
 */
export function detectEvent(chain: Chain, maxDte = 120, minDte = 0.5): EventWindow | null {
  const spot = chain.underlying.price;

  const byExpiry = new Map<string, Contract[]>();
  for (const c of chain.contracts) {
    // Expiries in their last hours are excluded for the same reason the gamma
    // profile drops them: the quotes are stale or dead, and dividing the tiny
    // time to expiry into the forward variance turns that noise into a fake
    // event every time.
    if (c.dte < minDte || c.dte > maxDte) continue;
    const arr = byExpiry.get(c.expiry) ?? [];
    arr.push(c);
    byExpiry.set(c.expiry, arr);
  }

  const terms: { expiry: string; t: number; dte: number; iv: number }[] = [];
  for (const [expiry, cs] of byExpiry) {
    const iv = atmIvForExpiry(cs, spot);
    if (iv == null || iv <= 0) continue;
    const dte = Math.min(...cs.map((c) => c.dte));
    terms.push({ expiry, t: dte / 365, dte, iv });
  }
  terms.sort((a, b) => a.t - b.t);
  if (terms.length < 3) return null;

  const windows: { idx: number; fwdIv: number }[] = [];
  for (let i = 0; i < terms.length; i++) {
    const cur = terms[i];
    const prev = i > 0 ? terms[i - 1] : null;
    const totalVar = cur.iv * cur.iv * cur.t;
    const prevVar = prev ? prev.iv * prev.iv * prev.t : 0;
    const dt = cur.t - (prev?.t ?? 0);
    if (dt <= 0) continue;
    const fwdVar = (totalVar - prevVar) / dt;
    if (!Number.isFinite(fwdVar) || fwdVar <= 0) continue;
    windows.push({ idx: i, fwdIv: Math.sqrt(fwdVar) });
  }
  if (windows.length < 3) return null;

  let top = windows[0];
  for (const w of windows) if (w.fwdIv > top.fwdIv) top = w;

  // Measure the candidate against every other window, not against a median it
  // is itself pulling upward. One hot window in a short chain moves the median
  // enough to hide itself.
  const baseline = median(windows.filter((w) => w !== top).map((w) => w.fwdIv));
  if (baseline <= 0) return null;

  const ratio = top.fwdIv / baseline;
  // Both tests have to pass. The ratio alone fires on quiet names where a one
  // point vol wiggle is a large percentage, and the absolute gap alone fires on
  // names that are simply volatile everywhere.
  if (ratio < 1.25 || top.fwdIv - baseline < 0.05) return null;

  const cur = terms[top.idx];
  const prev = top.idx > 0 ? terms[top.idx - 1] : null;
  return {
    expiry: cur.expiry,
    after: prev?.expiry ?? null,
    dte: cur.dte,
    forwardIv: top.fwdIv,
    baselineIv: baseline,
    ratio,
  };
}

/** The expiry carrying the largest share of the gamma behind the walls. */
export function detectRolloff(gamma: GammaProfile): WallRolloff | null {
  if (!gamma.perExpiry.length) return null;
  const total = gamma.perExpiry.reduce((s, r) => s + r.absGex, 0);
  if (total <= 0) return null;
  let top = gamma.perExpiry[0];
  for (const r of gamma.perExpiry) if (r.absGex > top.absGex) top = r;
  return {
    expiry: top.expiry,
    share: top.absGex / total,
    monthly: isMonthlyOpex(top.expiry),
    dte: top.dte,
  };
}

export function readEvents(
  chain: Chain,
  gamma: GammaProfile,
  maxDte = 120,
  minDte = 0.5,
): EventRead {
  return { event: detectEvent(chain, maxDte, minDte), rolloff: detectRolloff(gamma) };
}
