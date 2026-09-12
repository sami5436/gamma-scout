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
5. Attaches a plan to get out of every trade, and flags the dated risks that
   break a position on the calendar rather than on price.

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
| Event risk | 1.10 | Only applied when a dated risk touches the trade, see below |

An uncapped long option is scored on what it would be worth at the gamma derived
target, not on an imaginary infinite payoff.

## Plan to get out

Every idea carries an exit, because most losses are exit failures rather than
entry failures. Four rules per trade:

* **Take profit.** For a spread, 70% of max profit, which is the point where the
  last of the payoff only arrives at expiry and only by sitting through pin risk
  on the short strike. For a long option, whatever the contract is worth at the
  gamma derived target, valued halfway through the trade's life.
* **Cut.** 50% of the premium on a long option, 60% on a spread, which moves
  slower and gets whipsawed by a tighter stop.
* **Invalidation.** The level where the gamma read behind the trade stops being
  true, usually the flip, otherwise the wall the trade was leaning on. This is a
  better stop than a price stop because it names what actually broke.
* **Time.** Out at 35% of the original days to expiry, capped at 21 days, so a
  six week trade closes around two weeks out and a weekly closes with two days
  left.

## Dated risk

Gamma is a snapshot of positioning. Two things on the calendar invalidate it,
and both are read out of the chain rather than an external feed, so neither
needs an API key.

* **Events.** Total variance accumulates across the term structure, so the
  variance added between two consecutive expiries, annualized, is the market's
  price of volatility for just that window. An earnings date shows up as one
  window priced far above the rest. A trade expiring on or after that window has
  paid for the event, and that premium disappears once the date passes whether
  or not the direction was right. Across a 20 name basket this finds the correct
  earnings window for 17, misses one, and fires on none of SPY, QQQ or DIA.
* **Wall rolloff.** Walls are built from open interest, and most open interest
  sits in one expiry, usually the monthly. A trade running past that date is
  aiming at a wall that has already expired.

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
npm run scan -- AAPL 600 any 20 50   # structure, then min and max days to expiry
```

## Layout

```
src/lib/blackScholes.ts   gamma, delta, price, lognormal probability
src/lib/gamma.ts          GEX profile, walls, flip level, expected move
src/lib/events.ts         event detection from the term structure, wall rolloff
src/lib/exits.ts          take profit, stop, invalidation level, time exit
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
