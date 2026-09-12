/** Manual scan check: npm run scan -- AAPL 600 */
import { loadChain } from "../src/lib/providers";
import { readEvents } from "../src/lib/events";
import { buildGammaProfile } from "../src/lib/gamma";
import { scan } from "../src/lib/strategy";

const sym = process.argv[2] ?? "SPY";
const budget = Number(process.argv[3] ?? 600);
const minDte = Number(process.argv[5] ?? 5);
const maxDte = Number(process.argv[6] ?? 60);
const structure = (process.argv[4] ?? "any") as "any" | "calls" | "puts" | "spreads";

async function main() {
  const chain = await loadChain(sym);
  const g = buildGammaProfile(chain, { maxDte: Math.max(maxDte, 45) });
  const events = readEvents(chain, g, 120);
  const r = scan({ chain, gamma: g, budget, minDte, maxDte, bias: "auto", structure, events });
  if (events.event) {
    const e = events.event;
    console.log(`event priced in ${e.after ?? "now"} to ${e.expiry}: forward vol ${(e.forwardIv * 100).toFixed(0)}% vs baseline ${(e.baselineIv * 100).toFixed(0)}% (${e.ratio.toFixed(2)}x)`);
  } else {
    console.log("no event detected in the term structure");
  }
  if (events.rolloff) {
    const rr = events.rolloff;
    console.log(`walls live in ${rr.expiry} (${(rr.share * 100).toFixed(0)}% of gamma${rr.monthly ? ", monthly opex" : ""})`);
  }
  console.log(`${chain.underlying.symbol} $${chain.underlying.price.toFixed(2)}  structure=${r.structure} bias=${r.bias}${r.conflict ? " (against flow)" : ""} target=$${r.target.toFixed(2)} regime=${g.regime} considered=${r.considered}`);
  for (const i of r.ideas.slice(0, 6)) {
    console.log(`\n[${i.score.toFixed(0)}] ${i.label}  exp ${i.expiry} (${Math.round(i.dte)}d)`);
    console.log(`   debit $${i.debit.toFixed(0)}  max profit ${i.maxProfit == null ? "uncapped" : "$" + i.maxProfit.toFixed(0)}  be $${i.breakeven.toFixed(2)} (${i.breakevenMovePct.toFixed(1)}%)  pop ${(i.probProfit * 100).toFixed(0)}%  slip ${(i.slippagePct * 100).toFixed(0)}%`);
    console.log(`   ${i.factors.map((f) => `${f.label} ${f.score.toFixed(0)}`).join(" | ")}`);
    console.log(`   tags: ${i.tags.join(", ")}`);
    for (const l of i.exit.lines) console.log(`   > ${l}`);
    for (const w of i.warnings) console.log(`   ! ${w}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
