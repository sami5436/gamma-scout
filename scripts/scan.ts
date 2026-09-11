/** Manual scan check: npm run scan -- AAPL 600 */
import { loadChain } from "../src/lib/providers";
import { buildGammaProfile } from "../src/lib/gamma";
import { scan } from "../src/lib/strategy";

const sym = process.argv[2] ?? "SPY";
const budget = Number(process.argv[3] ?? 600);
const structure = (process.argv[4] ?? "any") as "any" | "calls" | "puts" | "spreads";

async function main() {
  const chain = await loadChain(sym);
  const g = buildGammaProfile(chain, { maxDte: 60 });
  const r = scan({ chain, gamma: g, budget, minDte: 5, maxDte: 60, bias: "auto", structure });
  console.log(`${chain.underlying.symbol} $${chain.underlying.price.toFixed(2)}  structure=${r.structure} bias=${r.bias}${r.conflict ? " (against flow)" : ""} target=$${r.target.toFixed(2)} regime=${g.regime} considered=${r.considered}`);
  for (const i of r.ideas.slice(0, 6)) {
    console.log(`\n[${i.score.toFixed(0)}] ${i.label}  exp ${i.expiry} (${Math.round(i.dte)}d)`);
    console.log(`   debit $${i.debit.toFixed(0)}  max profit ${i.maxProfit == null ? "uncapped" : "$" + i.maxProfit.toFixed(0)}  be $${i.breakeven.toFixed(2)} (${i.breakevenMovePct.toFixed(1)}%)  pop ${(i.probProfit * 100).toFixed(0)}%  slip ${(i.slippagePct * 100).toFixed(0)}%`);
    console.log(`   ${i.factors.map((f) => `${f.label} ${f.score.toFixed(0)}`).join(" | ")}`);
    console.log(`   tags: ${i.tags.join(", ")}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
