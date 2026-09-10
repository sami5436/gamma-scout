"use client";

import { useState } from "react";
import { expiryLabel, strikeLabel, usd, usd0 } from "@/lib/format";
import type { TradeIdea } from "@/lib/strategy";

function scoreTone(score: number) {
  if (score >= 78) return { ring: "#34d399", text: "text-emerald-300" };
  if (score >= 62) return { ring: "#7dd3fc", text: "text-sky-300" };
  if (score >= 48) return { ring: "#fbbf24", text: "text-amber-300" };
  return { ring: "#f87171", text: "text-rose-300" };
}

function ScoreDial({ score }: { score: number }) {
  const tone = scoreTone(score);
  return (
    <div
      className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full"
      style={{
        background: `conic-gradient(${tone.ring} ${score * 3.6}deg, #ffffff14 0deg)`,
      }}
    >
      <div className="grid h-[38px] w-[38px] place-items-center rounded-full bg-[#12151d]">
        <span className={`tnum text-sm font-semibold ${tone.text}`}>{Math.round(score)}</span>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`tnum truncate text-sm font-medium ${tone ?? "text-zinc-100"}`}>{value}</div>
    </div>
  );
}

export function IdeaCard({ idea, rank }: { idea: TradeIdea; rank: number }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="rise overflow-hidden rounded-2xl border border-white/10 bg-[#101219]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full px-4 py-3.5 text-left active:bg-white/5"
      >
        <div className="flex items-start gap-3">
          <ScoreDial score={idea.score} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-medium text-zinc-600">#{rank}</span>
              <h3 className="truncate text-[15px] font-semibold text-zinc-50">{idea.label}</h3>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              {expiryLabel(idea.expiry)} expiry, {Math.round(idea.dte)} days out
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {idea.tags.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-zinc-300"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
          <svg
            className={`mt-1 h-4 w-4 shrink-0 text-zinc-600 transition-transform ${open ? "rotate-180" : ""}`}
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3 border-t border-white/[0.07] pt-3">
          <Stat label="Cost" value={usd0(idea.debit)} />
          <Stat
            label="Max gain"
            value={idea.maxProfit == null ? "Uncapped" : usd0(idea.maxProfit)}
            tone="text-emerald-300"
          />
          <Stat label="Breakeven" value={usd(idea.breakeven)} />
        </div>
      </button>

      {open && (
        <div className="space-y-4 border-t border-white/[0.07] bg-[#0c0e14] px-4 py-4">
          <div>
            <h4 className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">Order ticket</h4>
            <div className="space-y-1.5">
              {idea.legs.map((l) => (
                <div
                  key={l.symbol}
                  className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2"
                >
                  <span className="text-[13px]">
                    <span
                      className={`font-semibold ${l.action === "buy" ? "text-emerald-300" : "text-rose-300"}`}
                    >
                      {l.action === "buy" ? "Buy" : "Sell"}
                    </span>{" "}
                    <span className="text-zinc-300">
                      {strikeLabel(l.strike)} {l.right === "C" ? "call" : "put"}
                    </span>
                  </span>
                  <span className="tnum text-[11px] text-zinc-500">
                    {usd(l.bid)} by {usd(l.ask)}, OI {l.openInterest.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
            <p className="tnum mt-2 text-[11px] text-zinc-500">
              Net debit {usd(idea.debit / 100)} per share, {usd0(idea.debit)} per contract.
              Budget fits {idea.contracts} for {usd0(idea.totalCost)}.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Stat label="Max loss" value={usd0(idea.maxLoss)} tone="text-rose-300" />
            <Stat
              label="Reward to risk"
              value={idea.rewardRisk == null ? "Uncapped" : `${idea.rewardRisk.toFixed(2)} to 1`}
            />
            <Stat label="Odds past breakeven" value={`${(idea.probProfit * 100).toFixed(0)}%`} />
            <Stat label="Move needed" value={`${idea.breakevenMovePct.toFixed(1)}%`} />
            <Stat label="Decay per day" value={usd(Math.abs(idea.thetaPerDay))} tone="text-zinc-300" />
            <Stat label="Position delta" value={idea.netDelta.toFixed(2)} />
          </div>

          <div>
            <h4 className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">Why it ranked here</h4>
            <div className="space-y-2">
              {[...idea.factors]
                .sort((a, b) => b.weight - a.weight)
                .map((f) => (
                  <div key={f.key}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12px] text-zinc-300">{f.label}</span>
                      <span className="tnum text-[11px] text-zinc-500">{Math.round(f.score)}</span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(f.score, 2)}%`,
                          background: scoreTone(f.score).ring,
                        }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-zinc-500">{f.note}</p>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
