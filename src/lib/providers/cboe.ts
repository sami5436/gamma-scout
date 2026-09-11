import type { Chain, ChainProvider, Contract } from "../types";
import { daysToExpiry, parseOccSymbol } from "../occ";

const BASE = "https://cdn.cboe.com/api/global/delayed_quotes/options";

/** Cash-settled indices are published under an underscore-prefixed file. */
const INDEX_SYMBOLS = new Set([
  "SPX", "SPXW", "NDX", "RUT", "VIX", "XSP", "DJX", "OEX", "XEO", "MRUT", "XND",
]);

interface CboeOption {
  option: string;
  bid: number; ask: number; iv: number;
  open_interest: number; volume: number;
  delta: number; gamma: number; vega: number; theta: number;
  theo: number; last_trade_price: number;
}

interface CboeResponse {
  timestamp: string;
  symbol: string;
  data: {
    symbol: string;
    security_type: string;
    current_price: number;
    price_change: number;
    price_change_percent: number;
    prev_day_close: number;
    iv30: number;
    iv30_change_percent: number;
    options: CboeOption[];
  };
}

function candidatePaths(symbol: string): string[] {
  const s = symbol.trim().toUpperCase().replace(/^\^/, "");
  const paths = [`${BASE}/${s}.json`];
  if (INDEX_SYMBOLS.has(s)) paths.unshift(`${BASE}/_${s}.json`);
  else paths.push(`${BASE}/_${s}.json`);
  return paths;
}

async function fetchRaw(symbol: string): Promise<CboeResponse> {
  let lastStatus = 0;
  for (const url of candidatePaths(symbol)) {
    const res = await fetch(url, {
      headers: { "User-Agent": "gamma-scout/1.0 (+https://github.com/sami5436/gamma-scout)" },
      cache: "no-store",
    });
    if (res.ok) return (await res.json()) as CboeResponse;
    lastStatus = res.status;
  }
  // Cboe answers 403 rather than 404 for a symbol it does not publish, so both
  // statuses mean the same thing to someone who mistyped a ticker.
  if (lastStatus === 403 || lastStatus === 404) {
    throw new Error(`No listed options found for "${symbol}". Check the ticker.`);
  }
  throw new Error(`Quote provider returned HTTP ${lastStatus} for "${symbol}".`);
}

export const cboeProvider: ChainProvider = {
  name: "cboe-delayed",
  async fetchChain(symbol: string): Promise<Chain> {
    const raw = await fetchRaw(symbol);
    const d = raw.data;
    const now = new Date();
    const expiries = new Set<string>();
    const contracts: Contract[] = [];

    for (const o of d.options) {
      const parsed = parseOccSymbol(o.option);
      if (!parsed) continue;
      const bid = o.bid ?? 0;
      const ask = o.ask ?? 0;
      // No two-sided market means no knowable fill price, so the contract is
      // useless for building a spread.
      if (bid <= 0 || ask <= 0) continue;

      const dte = daysToExpiry(parsed.expiry, now);
      expiries.add(parsed.expiry);
      contracts.push({
        symbol: o.option,
        right: parsed.right,
        strike: parsed.strike,
        expiry: parsed.expiry,
        dte,
        bid, ask,
        mid: (bid + ask) / 2,
        last: o.last_trade_price ?? 0,
        volume: o.volume ?? 0,
        openInterest: o.open_interest ?? 0,
        iv: o.iv ?? 0,
        delta: o.delta ?? 0,
        gamma: o.gamma ?? 0,
        theta: o.theta ?? 0,
        vega: o.vega ?? 0,
        theo: o.theo ?? 0,
      });
    }

    if (!contracts.length) throw new Error(`No tradable contracts returned for "${symbol}".`);

    return {
      source: "Cboe (15-min delayed)",
      underlying: {
        symbol: (d.symbol || symbol).replace(/^\^/, "").toUpperCase(),
        price: d.current_price,
        change: d.price_change,
        changePercent: d.price_change_percent,
        iv30: (d.iv30 ?? 0) / 100,
        iv30ChangePercent: d.iv30_change_percent ?? 0,
        securityType: d.security_type,
        prevClose: d.prev_day_close,
        asOf: raw.timestamp,
      },
      contracts,
      expiries: [...expiries].sort(),
    };
  },
};
