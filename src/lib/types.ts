export type OptionRight = "C" | "P";

/** One option contract, normalized across providers. */
export interface Contract {
  symbol: string;
  right: OptionRight;
  strike: number;
  /** ISO date, YYYY-MM-DD */
  expiry: string;
  /** Calendar days to expiry (fractional, from now). */
  dte: number;
  bid: number;
  ask: number;
  mid: number;
  last: number;
  volume: number;
  openInterest: number;
  /** Implied vol as a decimal (0.25 = 25%). */
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  /** Provider's theoretical value. */
  theo: number;
}

export interface Underlying {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  /** 30-day implied vol as a decimal. */
  iv30: number;
  iv30ChangePercent: number;
  securityType: string;
  prevClose: number;
  /** Provider quote timestamp. */
  asOf: string;
}

export interface Chain {
  underlying: Underlying;
  contracts: Contract[];
  /** Sorted list of ISO expiry dates present in the chain. */
  expiries: string[];
  source: string;
}

export interface ChainProvider {
  name: string;
  fetchChain(symbol: string): Promise<Chain>;
}
