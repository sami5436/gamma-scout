/** Manual sanity check against live Cboe data: npm run smoke -- AAPL */
import { loadChain } from "../src/lib/providers";
import { buildGammaProfile } from "../src/lib/gamma";

const sym = process.argv[2] ?? "SPY";

const money = (n: number) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n / 1e9).toFixed(2)}B`;

async function main() {
  const t0 = Date.now();
  const chain = await loadChain(sym);
  console.log(`${chain.underlying.symbol}  $${chain.underlying.price.toFixed(2)}  iv30=${(chain.underlying.iv30 * 100).toFixed(1)}%`);
  console.log(`contracts=${chain.contracts.length} expiries=${chain.expiries.length} fetch=${Date.now() - t0}ms`);

  const g = buildGammaProfile(chain, { maxDte: 45 });
  console.log(`\ntotal GEX  ${money(g.totalGex)}  regime=${g.regime}`);
  console.log(`call wall  ${g.callWall}`);
  console.log(`put wall   ${g.putWall}`);
  console.log(`flip       ${g.gammaFlip?.toFixed(2) ?? "none in band"}`);
  console.log(`exp move   ±$${g.expectedMove.toFixed(2)} over ${g.horizonDays}d @ ${(g.atmIv * 100).toFixed(1)}% IV`);
  console.log(`\ntop strikes by |net gex|:`);
  [...g.perStrike]
    .sort((a, b) => Math.abs(b.netGex) - Math.abs(a.netGex))
    .slice(0, 8)
    .forEach((r) =>
      console.log(`  ${String(r.strike).padStart(8)}  net=${money(r.netGex).padStart(10)}  cOI=${r.callOi} pOI=${r.putOi}`),
    );
}
main().catch((e) => { console.error(e); process.exit(1); });
