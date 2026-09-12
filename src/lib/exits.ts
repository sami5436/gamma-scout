import { bsPrice } from "./blackScholes";
import { expiryLabel } from "./format";
import type { GammaProfile } from "./gamma";

const MULT = 100;

export interface ExitLeg {
  action: "buy" | "sell";
  right: "C" | "P";
  strike: number;
  iv: number;
}

export interface ExitPlan {
  /** Position value per contract that closes the trade for a win. */
  takeProfitValue: number;
  /** Gain on the debit at that value, as a percentage. */
  takeProfitGainPct: number;
  /** Roughly where the underlying has to be to get there. */
  takeProfitSpot: number | null;
  /** Where the number came from, in plain words. */
  takeProfitBasis: string;
  /** Position value per contract that closes the trade for a loss. */
  stopValue: number;
  /** Loss on the debit at that value, as a positive percentage. */
  stopLossPct: number;
  /** Close on or before this many days to expiry, win or lose. */
  timeExitDte: number;
  /** Calendar date of that time exit. */
  timeExitDate: string;
  /** Underlying level that breaks the gamma read the trade was built on. */
  invalidationSpot: number | null;
  invalidationNote: string;
  /** The plan as display ready sentences, in the order you would act on them. */
  lines: string[];
}

/** Position value per contract at a hypothetical spot and time to expiry. */
function valueAt(legs: ExitLeg[], spot: number, t: number): number {
  let v = 0;
  for (const l of legs) {
    const px = bsPrice({ s: spot, k: l.strike, t: Math.max(t, 1 / 365), v: l.iv }, l.right);
    v += (l.action === "buy" ? 1 : -1) * px;
  }
  return v * MULT;
}

/**
 * Spot that makes the position worth `want`. Value is monotonic in spot for
 * every structure here, rising for bullish trades and falling for bearish ones,
 * so a plain bisection is enough.
 */
function solveSpot(
  legs: ExitLeg[],
  want: number,
  spot: number,
  t: number,
  dir: "bullish" | "bearish",
): number | null {
  let lo = spot * 0.55;
  let hi = spot * 1.45;
  const f = (s: number) => valueAt(legs, s, t) - want;
  // Orient so f is increasing along lo to hi.
  if (dir === "bearish") [lo, hi] = [hi, lo];
  if (f(lo) > 0 || f(hi) < 0) return null;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Manage before decay accelerates. A 45 day trade gets closed around 16 days
 * out, a weekly around 2, and nothing is held into the last session where
 * gamma makes the position behave like a coin flip.
 */
export function timeExitFor(dte: number): number {
  return Math.min(21, Math.max(1, Math.round(dte * 0.35)));
}

function dateMinusDays(expiry: string, days: number): string {
  const [y, m, d] = expiry.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

export interface ExitInput {
  legs: ExitLeg[];
  spot: number;
  dte: number;
  debit: number;
  maxProfit: number | null;
  expiry: string;
  dir: "bullish" | "bearish";
  /** Price level the gamma read is aiming at. */
  target: number;
  gamma: GammaProfile;
  /** Expiry of an event priced into the chain, if one sits inside the trade. */
  eventExpiry?: string | null;
}

export function buildExitPlan(input: ExitInput): ExitPlan {
  const { legs, spot, dte, debit, maxProfit, expiry, dir, target, gamma } = input;
  const isSpread = legs.length > 1;
  const t = dte / 365;
  // Value the exit halfway through the trade's life. Waiting for the last day
  // is how a winner turns back into a loser.
  const tExit = Math.max(t / 2, 1 / 365);

  let takeProfitValue: number;
  let takeProfitSpot: number | null;
  let takeProfitBasis: string;

  if (isSpread && maxProfit != null) {
    // The last slice of a spread's max profit only arrives at expiry, and
    // collecting it means sitting through pin risk on the short strike.
    takeProfitValue = debit + maxProfit * 0.7;
    takeProfitSpot = solveSpot(legs, takeProfitValue, spot, tExit, dir);
    takeProfitBasis = "70% of max profit, which is where the spread stops paying you to wait";
  } else {
    const atTarget = valueAt(legs, target, tExit);
    if (atTarget >= debit * 1.15) {
      takeProfitValue = atTarget;
      takeProfitSpot = target;
      takeProfitBasis = "what the option is worth at the gamma target";
    } else {
      // The gamma read does not reach far enough to pay for the premium, so
      // fall back to a flat gain and say where that actually lands.
      takeProfitValue = debit * 1.6;
      takeProfitSpot = solveSpot(legs, takeProfitValue, spot, tExit, dir);
      takeProfitBasis = "a flat 60% gain, because the gamma target alone does not cover the premium";
    }
  }

  const stopLossPct = isSpread ? 60 : 50;
  const stopValue = debit * (1 - stopLossPct / 100);
  const timeExitDte = timeExitFor(dte);

  let invalidationSpot: number | null = null;
  let invalidationNote: string;
  const { gammaFlip, callWall, putWall } = gamma;
  const flipIsBehind =
    gammaFlip != null && (dir === "bullish" ? spot > gammaFlip : spot < gammaFlip);

  if (flipIsBehind && gammaFlip != null) {
    invalidationSpot = gammaFlip;
    invalidationNote =
      dir === "bullish"
        ? "below the flip dealer hedging starts selling into weakness, which is the opposite of what this trade needs"
        : "above the flip dealer hedging starts buying into strength and the downside thesis is gone";
  } else if (dir === "bullish" && putWall != null && putWall < spot) {
    invalidationSpot = putWall;
    invalidationNote = "the put wall was the support this trade was leaning on";
  } else if (dir === "bearish" && callWall != null && callWall > spot) {
    invalidationSpot = callWall;
    invalidationNote = "the call wall was the ceiling this trade was leaning on";
  } else {
    invalidationNote = "no clean gamma level to invalidate on, so the loss stop is doing all the work";
  }

  const money = (n: number) => `$${n.toFixed(0)}`;
  const px = (n: number) => `$${n.toFixed(2)}`;

  const lines: string[] = [];
  lines.push(
    takeProfitSpot != null
      ? `Take profit at ${money(takeProfitValue)} per contract, roughly ${px(takeProfitSpot)} on the underlying. That is ${takeProfitBasis}.`
      : `Take profit at ${money(takeProfitValue)} per contract. That is ${takeProfitBasis}.`,
  );
  lines.push(
    `Cut at ${money(stopValue)} per contract, a ${stopLossPct}% loss on the ${money(debit)} you paid.`,
  );
  if (invalidationSpot != null) {
    lines.push(
      `Close early if the underlying ${dir === "bullish" ? "closes below" : "closes above"} ${px(invalidationSpot)}, because ${invalidationNote}.`,
    );
  }
  lines.push(
    `Be out by ${expiryLabel(dateMinusDays(expiry, timeExitDte))}, ${timeExitDte} days before expiry, whatever the position is worth.`,
  );
  if (input.eventExpiry) {
    lines.push(
      `The chain prices an event before this expires. Decide in advance whether you are holding through it or closing first, because the vol you paid for deflates the moment it passes.`,
    );
  }

  return {
    takeProfitValue,
    takeProfitGainPct: ((takeProfitValue - debit) / debit) * 100,
    takeProfitSpot,
    takeProfitBasis,
    stopValue,
    stopLossPct,
    timeExitDte,
    timeExitDate: dateMinusDays(expiry, timeExitDte),
    invalidationSpot,
    invalidationNote,
    lines,
  };
}
