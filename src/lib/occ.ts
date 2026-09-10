import type { OptionRight } from "./types";

/**
 * Parse an OCC option symbol, e.g. `AAPL261016C00325000`
 * => root AAPL, expiry 2026-10-16, call, strike 325.
 */
export function parseOccSymbol(sym: string): {
  root: string;
  expiry: string;
  right: OptionRight;
  strike: number;
} | null {
  const m = /^([A-Z0-9.^_-]+?)(\d{6})([CP])(\d{8})$/.exec(sym.trim().toUpperCase());
  if (!m) return null;
  const [, root, ymd, right, strikeRaw] = m;
  const year = 2000 + Number(ymd.slice(0, 2));
  const month = ymd.slice(2, 4);
  const day = ymd.slice(4, 6);
  return {
    root,
    expiry: `${year}-${month}-${day}`,
    right: right as OptionRight,
    strike: Number(strikeRaw) / 1000,
  };
}

/** US options expire at 16:00 ET. Returns fractional days from now, floored at ~0. */
export function daysToExpiry(expiry: string, now = new Date()): number {
  // 20:00Z ≈ 16:00 ET during DST, 21:00Z during standard time. Close enough
  // for scoring; a few hours of drift does not move a 7-45 day trade.
  const settle = Date.parse(`${expiry}T20:00:00Z`);
  return Math.max((settle - now.getTime()) / 86_400_000, 1 / 24);
}
