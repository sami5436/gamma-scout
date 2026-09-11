# Gamma

Pick a ticker and say what you can spend. Gamma reads dealer positioning, implied
vol and liquidity, then ranks the debit spreads and long options that actually fit
the budget.

Live: https://gamma-scout.vercel.app

Plain English explainer: https://gamma-scout.vercel.app/learn

## What it does

1. Pulls the full option chain for a ticker, including greeks and open interest.
2. Builds a dealer gamma exposure profile: per strike net GEX, the call wall, the
   put wall, and the spot level where net gamma flips sign.
3. Generates every vertical debit spread and single long option inside the budget
   and time frame. A structure filter narrows this to calls only, puts only or
   spreads only. Asking for calls or puts also sets the direction, since buying a
   call is itself a directional statement, and the interface says so when that
   choice runs against the gamma read.
4. Scores each one on seven weighted factors and shows the reasoning per trade.

## How gamma drives the picks

Gamma exposure is a proxy for how option dealers must hedge.

* **Positive gamma.** Dealer hedging leans against the move, which dampens vol and
  pins price to strikes with heavy open interest. Capped structures that sell into
  the call wall are favored, and long options that need to break through that wall
  are penalized.
* **Negative gamma.** Hedging goes with the move and amplifies it, so moves extend
  further than implied vol suggests. Uncapped long premium scores better and the
  walls become less reliable as targets.

The gamma flip is where that behavior changes sign, so it also sets the default
directional lean when no view is given.

## Scoring factors

| Factor | Weight | What it measures |
| --- | --- | --- |
| Gamma fit | 1.50 | Regime match for the structure, and where the short leg sits versus the wall |
| Payoff | 1.30 | Expected value per dollar risked, from reward to risk and the odds |
| Breakeven reach | 1.25 | How far breakeven sits in units of the expected move |
| Liquidity | 1.15 | Quoted spread width, open interest and volume on the thinnest leg |
| Vol cost | 0.70 to 1.20 | Contract IV against at the money IV, weighted less for spreads |
| Time decay | 0.90 | Daily theta as a share of the debit |
| Budget fit | 0.55 | Whether the debit lets you size more than one contract |

An uncapped long option is scored on what it would be worth at the gamma derived
target, not on an imaginary infinite payoff.

## Data

Chains come from the Cboe public delayed quote feed, which supplies greeks, open
interest and two sided markets with no API key. Quotes are 15 minutes delayed, so
confirm pricing in a broker before trading.

The provider sits behind a `ChainProvider` interface in `src/lib/providers`, so a
keyed source can be added later and selected with the `CHAIN_PROVIDER` env var
without touching the engines.

## Local development

```bash
npm install
npm run dev

# check the engines against live data from the terminal
npm run smoke -- AAPL
npm run scan -- SPY 600
npm run scan -- SPY 600 calls   # any | calls | puts | spreads
```

## Layout

```
src/lib/blackScholes.ts   gamma, delta, price, lognormal probability
src/lib/gamma.ts          GEX profile, walls, flip level, expected move
src/lib/strategy.ts       candidate generation and factor scoring
src/lib/providers/        pluggable chain sources
src/app/api/scan/         scan endpoint
src/app/learn/            plain English explainer page
src/components/           mobile first interface
```

## Disclaimer

This is a research tool, not financial advice. Gamma exposure assumes dealers are
long calls and short puts against customer flow, which is a positioning proxy
rather than a measured dealer book. Options can lose their entire value.
