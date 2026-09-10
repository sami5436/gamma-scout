import type { Chain, ChainProvider } from "../types";
import { cboeProvider } from "./cboe";

/**
 * Providers are pluggable so a keyed source (Polygon, Tradier) can be added
 * later without touching the engines. Selection is env-driven.
 */
const PROVIDERS: Record<string, ChainProvider> = {
  [cboeProvider.name]: cboeProvider,
};

export function getProvider(): ChainProvider {
  const want = process.env.CHAIN_PROVIDER;
  return (want && PROVIDERS[want]) || cboeProvider;
}

/**
 * A full SPY chain is ~6 MB, which blows past Next's data-cache entry limit,
 * so we keep our own short-TTL memo. Fluid Compute reuses instances, so this
 * survives across requests and keeps repeat scans instant.
 */
const TTL_MS = 90_000;
const cache = new Map<string, { at: number; chain: Chain }>();
const inflight = new Map<string, Promise<Chain>>();

export async function loadChain(symbol: string): Promise<Chain> {
  const key = symbol.trim().toUpperCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.chain;

  // Collapse concurrent scans of the same ticker into one upstream fetch.
  const pending = inflight.get(key);
  if (pending) return pending;

  const p = getProvider()
    .fetchChain(key)
    .then((chain) => {
      cache.set(key, { at: Date.now(), chain });
      if (cache.size > 12) cache.delete(cache.keys().next().value as string);
      return chain;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}
