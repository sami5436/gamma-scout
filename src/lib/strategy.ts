import { bsPrice, probAbove } from "./blackScholes";
import type { GammaProfile } from "./gamma";
import { bell, clamp01, ramp, weightedScore, type Factor } from "./scoring";
import type { Chain, Contract } from "./types";

export type Bias = "auto" | "bullish" | "bearish";
/**
 * Which structures to build. `calls` and `puts` mean a single long leg on its
 * own, which also pins the direction, since you cannot buy a call and be
 * positioned short.
 */
export type Structure = "any" | "calls" | "puts" | "spreads";
export type TradeKind = "long_call" | "long_put" | "bull_call_spread" | "bear_put_spread";

export interface Leg {
  action: "buy" | "sell";
  right: "C" | "P";
  strike: number;
  expiry: string;
  symbol: string;
  price: number;
  iv: number;
  delta: number;
  openInterest: number;
  volume: number;
  bid: number;
  ask: number;
}

export interface TradeIdea {
  id: string;
  kind: TradeKind;
  label: string;
  direction: "bullish" | "bearish";
  expiry: string;
  dte: number;
  legs: Leg[];
  /** Total cash out the door, in dollars, for one spread/contract. */
  debit: number;
  maxProfit: number | null;
  maxLoss: number;
  breakeven: number;
  /** Percent move in the underlying needed to break even. */
  breakevenMovePct: number;
  rewardRisk: number | null;
  probProfit: number;
  netDelta: number;
  thetaPerDay: number;
  /** Theta as a percentage of debit, per day. */
  thetaBurnPct: number;
  netIv: number;
  /** Contracts you can buy with the stated budget. */
  contracts: number;
  totalCost: number;
  /** Widest bid/ask across legs, as a fraction of the trade's mid price. */
  slippagePct: number;
  score: number;
  factors: Factor[];
  tags: string[];
  /** Price level the trade is aiming at. */
  target: number;
}

export interface ScanInput {
  chain: Chain;
  gamma: GammaProfile;
  budget: number;
  minDte: number;
  maxDte: number;
  bias: Bias;
  structure?: Structure;
  limit?: number;
}

const MULT = 100;

function toLeg(c: Contract, action: "buy" | "sell"): Leg {
  return {
    action,
    right: c.right,
    strike: c.strike,
    expiry: c.expiry,
    symbol: c.symbol,
    price: action === "buy" ? c.ask : c.bid,
    iv: c.iv,
    delta: c.delta,
    openInterest: c.openInterest,
    volume: c.volume,
    bid: c.bid,
    ask: c.ask,
  };
}

/** Spread width as a fraction of mid, averaged across legs — the real cost of getting in and out. */
function slippage(cs: Contract[]): number {
  const vals = cs.map((c) => (c.mid > 0 ? (c.ask - c.bid) / c.mid : 1));
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Resolve `auto` bias from dealer positioning and where spot sits versus the walls. */
export function resolveBias(chain: Chain, g: GammaProfile, bias: Bias): "bullish" | "bearish" {
  if (bias !== "auto") return bias;
  const spot = chain.underlying.price;
  let score = 0;
  // Below the flip, dealer hedging amplifies downside; above it, drift is upward-biased.
  if (g.gammaFlip != null) score += spot > g.gammaFlip ? 1 : -1;
  // A put wall well below spot is a support shelf; a call wall right on top is a ceiling.
  if (g.putWall != null && g.callWall != null) {
    const up = (g.callWall - spot) / spot;
    const down = (spot - g.putWall) / spot;
    score += up > down ? 0.5 : -0.5;
  }
  score += chain.underlying.changePercent > 0 ? 0.25 : -0.25;
  return score >= 0 ? "bullish" : "bearish";
}

interface Ctx {
  spot: number;
  g: GammaProfile;
  chain: Chain;
  budget: number;
  dir: "bullish" | "bearish";
  /** Price the trade is aiming for, derived from gamma walls and expected move. */
  target: number;
  /** Distance to target as a multiple of the expected move. */
  targetSigma: number;
}

function buildTarget(spot: number, g: GammaProfile, dir: "bullish" | "bearish"): { target: number; targetSigma: number } {
  const em = g.expectedMove || spot * 0.05;
  let target: number;
  if (dir === "bullish") {
    // In positive gamma the call wall pins price, so it is the realistic
    // ceiling. In negative gamma moves extend, so lean on the expected move.
    const wall = g.callWall;
    target = g.regime === "positive" && wall != null && wall > spot
      ? Math.min(wall, spot + em)
      : spot + em;
  } else {
    const wall = g.putWall;
    target = g.regime === "positive" && wall != null && wall < spot
      ? Math.max(wall, spot - em)
      : spot - em;
  }
  if (target === spot) target = dir === "bullish" ? spot + em : spot - em;
  return { target, targetSigma: Math.abs(target - spot) / em };
}

/* ------------------------------ factors ------------------------------- */

function liquidityFactor(cs: Contract[], slip: number): Factor {
  const minOi = Math.min(...cs.map((c) => c.openInterest));
  const minVol = Math.min(...cs.map((c) => c.volume));
  const oiScore = ramp(Math.log10(minOi + 1), 0.7, 3); // 5 -> 1000 contracts
  const volScore = ramp(Math.log10(minVol + 1), 0.3, 2.5);
  const slipScore = 1 - ramp(slip, 0.04, 0.4); // 4% wide is great, 40% is unusable
  const s = clamp01(slipScore * 0.55 + oiScore * 0.3 + volScore * 0.15) * 100;
  return {
    key: "liquidity",
    label: "Liquidity",
    score: s,
    weight: 1.15,
    note: `${(slip * 100).toFixed(0)}% wide market, ${minOi.toLocaleString()} OI on the thinnest leg`,
  };
}

function gammaFactor(kind: TradeKind, strikes: number[], ctx: Ctx): Factor {
  const { g, spot, dir } = ctx;
  const wall = dir === "bullish" ? g.callWall : g.putWall;
  const isSpread = kind === "bull_call_spread" || kind === "bear_put_spread";

  // Dealers in positive gamma dampen moves and pin price to big strikes, which
  // rewards capped trades sold into the wall. Negative gamma amplifies moves,
  // which rewards uncapped long premium.
  let regimeFit = g.regime === "positive" ? (isSpread ? 0.85 : 0.4) : isSpread ? 0.55 : 0.9;

  // Above the flip a bullish trade has dealer support under it; below it, air.
  if (g.gammaFlip != null) {
    const above = spot > g.gammaFlip;
    if (dir === "bullish") regimeFit += above ? 0.1 : -0.15;
    else regimeFit += above ? -0.15 : 0.1;
  }

  let wallFit = 0.5;
  let note: string;
  if (wall != null) {
    if (isSpread) {
      // The short strike is where you want the pin: sell into the wall.
      const shortStrike = dir === "bullish" ? Math.max(...strikes) : Math.min(...strikes);
      wallFit = bell(shortStrike, wall, Math.max(spot * 0.06, 1));
      note = `short leg ${(((shortStrike - wall) / wall) * 100).toFixed(1)}% from the ${dir === "bullish" ? "call" : "put"} wall at ${wall}`;
    } else {
      // A long call that needs to punch through the call wall is fighting the pin.
      const k = strikes[0];
      const beyond = dir === "bullish" ? k > wall : k < wall;
      wallFit = beyond ? 0.25 : clamp01(1 - Math.abs(k - spot) / Math.max(Math.abs(wall - spot), spot * 0.02) * 0.5);
      note = beyond
        ? `strike sits past the ${dir === "bullish" ? "call" : "put"} wall at ${wall}`
        : `strike inside the ${dir === "bullish" ? "call" : "put"} wall at ${wall}`;
    }
  } else {
    note = "no dominant gamma wall in range";
  }

  return {
    key: "gamma",
    label: "Gamma fit",
    score: clamp01(regimeFit * 0.55 + wallFit * 0.45) * 100,
    weight: 1.5,
    note: `${g.regime} dealer gamma; ${note}`,
  };
}

function volFactor(netIv: number, ctx: Ctx, isSpread: boolean): Factor {
  const ref = ctx.g.atmIv || ctx.chain.underlying.iv30 || 0.3;
  const rel = netIv / ref;
  // Long premium wants cheap vol. A spread partly finances itself, so it is
  // far less sensitive to paying up.
  const raw = 1 - ramp(rel, 0.85, 1.6);
  const s = isSpread ? 0.35 + raw * 0.65 : raw;
  return {
    key: "vol",
    label: "Vol cost",
    score: clamp01(s) * 100,
    weight: isSpread ? 0.7 : 1.2,
    note: `${(netIv * 100).toFixed(0)}% IV vs ${(ref * 100).toFixed(0)}% at-the-money (${rel < 1 ? "discount" : "premium"})`,
  };
}

function payoffFactor(rr: number | null, prob: number, isSpread: boolean): Factor {
  // Expected value per dollar risked, which is what actually compounds.
  const capped = rr == null ? 3 : rr;
  const ev = prob * capped - (1 - prob);
  const s = clamp01(ramp(ev, -0.55, 0.55));
  return {
    key: "payoff",
    label: "Payoff",
    score: s * 100,
    weight: 1.3,
    note: `${rr == null ? "uncapped" : `${rr.toFixed(2)}:1`} reward:risk at ${(prob * 100).toFixed(0)}% odds${isSpread ? "" : " (target-based)"}`,
  };
}

function reachFactor(breakeven: number, ctx: Ctx): Factor {
  const { spot, g, dir } = ctx;
  const em = g.expectedMove || spot * 0.05;
  const need = dir === "bullish" ? breakeven - spot : spot - breakeven;
  const sigma = need / em;
  // Breakeven inside ~0.6 sigma is comfortable; past 1.3 sigma is a lottery ticket.
  const s = 1 - ramp(sigma, 0.35, 1.4);
  return {
    key: "reach",
    label: "Breakeven reach",
    score: clamp01(s) * 100,
    weight: 1.25,
    note: `needs ${(Math.abs(need / spot) * 100).toFixed(1)}% (${sigma.toFixed(2)}σ of the ±$${em.toFixed(2)} expected move)`,
  };
}

function decayFactor(thetaBurnPct: number, dte: number): Factor {
  // Daily bleed as a share of the debit. Under ~1%/day is manageable.
  const s = 1 - ramp(thetaBurnPct, 0.008, 0.05);
  return {
    key: "decay",
    label: "Time decay",
    score: clamp01(s) * 100,
    weight: 0.9,
    note: `${(thetaBurnPct * 100).toFixed(2)}%/day of the debit, ${Math.round(dte)}d to expiry`,
  };
}

function budgetFactor(debit: number, budget: number): Factor {
  const use = debit / budget;
  // Reward trades that let you size more than one contract without wasting the
  // account on a single lotto ticket.
  const s = use <= 1 ? bell(use, 0.42, 0.62) : 0;
  return {
    key: "budget",
    label: "Budget fit",
    score: clamp01(s) * 100,
    weight: 0.55,
    note: `$${debit.toFixed(0)} per contract, ${Math.floor(budget / debit)}x fits your $${budget.toFixed(0)}`,
  };
}

/* ---------------------------- construction ---------------------------- */

function assemble(
  kind: TradeKind,
  longC: Contract,
  shortC: Contract | null,
  ctx: Ctx,
): TradeIdea | null {
  const cs = shortC ? [longC, shortC] : [longC];
  const isSpread = shortC != null;
  const debitPerShare = longC.ask - (shortC?.bid ?? 0);
  if (debitPerShare <= 0.01) return null;

  const debit = debitPerShare * MULT;
  if (debit > ctx.budget) return null;

  const dir = ctx.dir;
  const t = longC.dte / 365;
  const width = shortC ? Math.abs(shortC.strike - longC.strike) : 0;

  const breakeven = dir === "bullish" ? longC.strike + debitPerShare : longC.strike - debitPerShare;
  const maxLoss = debit;
  const maxProfit = isSpread ? width * MULT - debit : null;
  if (isSpread && (maxProfit as number) <= 0) return null;
  const rewardRisk = maxProfit == null ? null : maxProfit / maxLoss;

  const probBe =
    dir === "bullish"
      ? probAbove({ s: ctx.spot, k: breakeven, t, v: longC.iv })
      : 1 - probAbove({ s: ctx.spot, k: breakeven, t, v: longC.iv });

  // For an uncapped long option, "reward" is what the position is worth if the
  // gamma-derived target is reached, not an imaginary infinity.
  let effectiveRr = rewardRisk;
  if (!isSpread) {
    const valueAtTarget = bsPrice({ s: ctx.target, k: longC.strike, t: Math.max(t / 2, 1 / 365), v: longC.iv }, longC.right) * MULT;
    effectiveRr = Math.max((valueAtTarget - debit) / debit, 0);
  }

  const netTheta = (longC.theta - (shortC?.theta ?? 0)) * MULT;
  const thetaBurnPct = Math.abs(netTheta) / debit;
  const netIv = shortC
    ? (longC.iv * longC.ask - shortC.iv * shortC.bid) / Math.max(debitPerShare, 0.01)
    : longC.iv;
  const slip = slippage(cs);

  const factors: Factor[] = [
    gammaFactor(kind, cs.map((c) => c.strike), ctx),
    liquidityFactor(cs, slip),
    payoffFactor(effectiveRr, probBe, isSpread),
    reachFactor(breakeven, ctx),
    volFactor(Math.max(netIv, 0.01), ctx, isSpread),
    decayFactor(thetaBurnPct, longC.dte),
    budgetFactor(debit, ctx.budget),
  ];

  const tags: string[] = [];
  if (ctx.g.regime === "positive" && isSpread) tags.push("Sells into the pin");
  if (ctx.g.regime === "negative" && !isSpread) tags.push("Momentum regime");
  if (slip <= 0.08) tags.push("Tight market");
  if (probBe >= 0.5) tags.push("Better than coinflip");
  if (rewardRisk != null && rewardRisk >= 2) tags.push(`${rewardRisk.toFixed(1)}:1`);
  if (thetaBurnPct <= 0.01) tags.push("Slow bleed");

  const strikeLabel = isSpread
    ? `${longC.strike}/${shortC!.strike}`
    : `${longC.strike}`;
  const kindLabel =
    kind === "bull_call_spread" ? "Bull call spread"
    : kind === "bear_put_spread" ? "Bear put spread"
    : kind === "long_call" ? "Long call"
    : "Long put";

  return {
    id: `${kind}:${longC.symbol}:${shortC?.symbol ?? ""}`,
    kind,
    label: `${kindLabel} ${strikeLabel}`,
    direction: dir,
    expiry: longC.expiry,
    dte: longC.dte,
    legs: shortC ? [toLeg(longC, "buy"), toLeg(shortC, "sell")] : [toLeg(longC, "buy")],
    debit,
    maxProfit,
    maxLoss,
    breakeven,
    breakevenMovePct: ((breakeven - ctx.spot) / ctx.spot) * 100,
    rewardRisk,
    probProfit: probBe,
    netDelta: longC.delta - (shortC?.delta ?? 0),
    thetaPerDay: netTheta,
    thetaBurnPct,
    netIv,
    contracts: Math.max(1, Math.floor(ctx.budget / debit)),
    totalCost: Math.max(1, Math.floor(ctx.budget / debit)) * debit,
    slippagePct: slip,
    score: weightedScore(factors),
    factors,
    tags,
    target: ctx.target,
  };
}

/* -------------------------------- scan -------------------------------- */

export interface ScanOutput {
  ideas: TradeIdea[];
  bias: "bullish" | "bearish";
  /** Direction the gamma read points to on its own, ignoring any override. */
  naturalBias: "bullish" | "bearish";
  /** True when the requested structure or view fights the gamma read. */
  conflict: boolean;
  structure: Structure;
  target: number;
  considered: number;
}

export function scan(input: ScanInput): ScanOutput {
  const { chain, gamma: g, budget, minDte, maxDte } = input;
  const spot = chain.underlying.price;
  const structure = input.structure ?? "any";
  const naturalBias = resolveBias(chain, g, "auto");

  // Asking for calls is itself a directional statement, so it overrides the
  // view rather than producing an empty list.
  let dir = resolveBias(chain, g, input.bias);
  if (structure === "calls") dir = "bullish";
  else if (structure === "puts") dir = "bearish";
  const { target, targetSigma } = buildTarget(spot, g, dir);
  const ctx: Ctx = { spot, g, chain, budget, dir, target, targetSigma };

  const right: "C" | "P" = dir === "bullish" ? "C" : "P";
  const pool = chain.contracts.filter(
    (c) =>
      c.right === right &&
      c.dte >= minDte &&
      c.dte <= maxDte &&
      c.iv > 0 &&
      c.openInterest >= 5 &&
      c.ask > 0.02 &&
      Math.abs(c.strike - spot) / spot <= 0.3 &&
      (c.ask - c.bid) / Math.max(c.mid, 0.01) < 0.85,
  );

  const byExpiry = new Map<string, Contract[]>();
  for (const c of pool) {
    const arr = byExpiry.get(c.expiry) ?? [];
    arr.push(c);
    byExpiry.set(c.expiry, arr);
  }

  const wantSingles = structure !== "spreads";
  const wantSpreads = structure === "any" || structure === "spreads";

  const ideas: TradeIdea[] = [];
  let considered = 0;

  for (const [, raw] of byExpiry) {
    const strikes = raw.sort((a, b) => a.strike - b.strike);

    for (let i = 0; i < strikes.length; i++) {
      const long = strikes[i];
      // Deep ITM long legs tie up capital for little convexity; far OTM ones
      // are lottery tickets. Keep the useful band.
      const moneyness = (long.strike - spot) / spot;
      const inBand = dir === "bullish" ? moneyness > -0.12 && moneyness < 0.15 : moneyness < 0.12 && moneyness > -0.15;
      if (!inBand) continue;

      if (wantSingles) {
        considered++;
        const solo = assemble(dir === "bullish" ? "long_call" : "long_put", long, null, ctx);
        if (solo) ideas.push(solo);
      }

      if (!wantSpreads) continue;

      // Pair with up to 6 further-out strikes for the short leg.
      const dirStep = dir === "bullish" ? 1 : -1;
      for (let n = 1; n <= 6; n++) {
        const j = i + dirStep * n;
        if (j < 0 || j >= strikes.length) break;
        const short = strikes[j];
        if (short.expiry !== long.expiry) continue;
        considered++;
        const sp = assemble(
          dir === "bullish" ? "bull_call_spread" : "bear_put_spread",
          long,
          short,
          ctx,
        );
        if (sp) ideas.push(sp);
      }
    }
  }

  ideas.sort((a, b) => b.score - a.score);

  // Near-identical trades cluster hard: the same strikes score almost the same
  // across every expiry. Cap repeats of a structure and of an expiry so the
  // list shows genuinely different choices rather than one trade six times.
  const perStructure = new Map<string, number>();
  const perExpiry = new Map<string, number>();
  const diversified: TradeIdea[] = [];
  for (const idea of ideas) {
    const structure = `${idea.kind}:${idea.legs.map((l) => l.strike).join("/")}`;
    if ((perStructure.get(structure) ?? 0) >= 1) continue;
    if ((perExpiry.get(idea.expiry) ?? 0) >= 2) continue;
    perStructure.set(structure, 1);
    perExpiry.set(idea.expiry, (perExpiry.get(idea.expiry) ?? 0) + 1);
    diversified.push(idea);
    if (diversified.length >= (input.limit ?? 12)) break;
  }

  return {
    ideas: diversified,
    bias: dir,
    naturalBias,
    conflict: dir !== naturalBias,
    structure,
    target,
    considered,
  };
}
