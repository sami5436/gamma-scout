import { NextResponse } from "next/server";
import { readEvents } from "@/lib/events";
import { buildGammaProfile } from "@/lib/gamma";
import { loadChain } from "@/lib/providers";
import { scan, type Bias, type Structure } from "@/lib/strategy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DTE_BUCKETS: Record<string, [number, number]> = {
  "0-7": [0, 7],
  "7-21": [5, 21],
  "21-45": [18, 45],
  "45-120": [40, 120],
  all: [3, 75],
};

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase();

  if (!symbol) return bad("Enter a ticker.");
  if (!/^[A-Z.^-]{1,10}$/.test(symbol)) return bad(`"${symbol}" is not a valid ticker.`);

  const budget = Number(url.searchParams.get("budget") ?? 500);
  if (!Number.isFinite(budget) || budget < 20 || budget > 1_000_000) {
    return bad("Budget must be between 20 and 1,000,000.");
  }

  const bucket = url.searchParams.get("dte") ?? "7-21";
  const [minDte, maxDte] = DTE_BUCKETS[bucket] ?? DTE_BUCKETS["7-21"];
  const bias = (url.searchParams.get("bias") ?? "auto") as Bias;

  const structureRaw = url.searchParams.get("structure") ?? "any";
  const STRUCTURES = ["any", "calls", "puts", "spreads"];
  if (!STRUCTURES.includes(structureRaw)) return bad(`Unknown structure "${structureRaw}".`);
  const structure = structureRaw as Structure;

  try {
    const chain = await loadChain(symbol);
    const gamma = buildGammaProfile(chain, { maxDte: Math.max(maxDte, 45) });
    const events = readEvents(chain, gamma, Math.max(maxDte, 120));
    const result = scan({ chain, gamma, budget, minDte, maxDte, bias, structure, events });

    return NextResponse.json({
      underlying: chain.underlying,
      source: chain.source,
      gamma: {
        totalGex: gamma.totalGex,
        regime: gamma.regime,
        callWall: gamma.callWall,
        putWall: gamma.putWall,
        gammaFlip: gamma.gammaFlip,
        expectedMove: gamma.expectedMove,
        atmIv: gamma.atmIv,
        horizonDays: gamma.horizonDays,
        perStrike: gamma.perStrike,
      },
      events,
      bias: result.bias,
      naturalBias: result.naturalBias,
      conflict: result.conflict,
      structure: result.structure,
      target: result.target,
      considered: result.considered,
      ideas: result.ideas,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed.";
    const notFound = /No listed options|no tradable contracts/i.test(message);
    return bad(message, notFound ? 404 : 502);
  }
}
