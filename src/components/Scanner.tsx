"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GexChart } from "./GexChart";
import { IdeaCard } from "./IdeaCard";
import { bigUsd, signedPct, strikeLabel, usd, usd0 } from "@/lib/format";
import type { StrikeGamma } from "@/lib/gamma";
import type { TradeIdea } from "@/lib/strategy";
import type { Underlying } from "@/lib/types";

interface ScanResult {
  underlying: Underlying;
  source: string;
  gamma: {
    totalGex: number;
    regime: "positive" | "negative";
    callWall: number | null;
    putWall: number | null;
    gammaFlip: number | null;
    expectedMove: number;
    atmIv: number;
    horizonDays: number;
    perStrike: StrikeGamma[];
  };
  bias: "bullish" | "bearish";
  naturalBias: "bullish" | "bearish";
  conflict: boolean;
  structure: string;
  target: number;
  considered: number;
  ideas: TradeIdea[];
}

const DTE_OPTIONS = [
  { value: "0-7", label: "7d" },
  { value: "7-21", label: "3wk" },
  { value: "21-45", label: "6wk" },
  { value: "45-120", label: "3mo" },
  { value: "all", label: "Any" },
];

const STRUCTURE_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "calls", label: "Calls" },
  { value: "puts", label: "Puts" },
  { value: "spreads", label: "Spreads" },
];

const BIAS_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "bullish", label: "Up" },
  { value: "bearish", label: "Down" },
];

const POPULAR = ["SPY", "QQQ", "NVDA", "TSLA", "AAPL", "AMD"];

function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  hint,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className={disabled ? "opacity-40" : undefined}>
      <span className="mb-1.5 flex items-baseline gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
        {hint && <span className="normal-case tracking-normal text-zinc-600">{hint}</span>}
      </span>
      <div className="flex gap-1 rounded-xl bg-white/[0.04] p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`flex-1 whitespace-nowrap rounded-lg px-1.5 py-1.5 text-[12px] font-medium transition-colors ${
              value === o.value
                ? "bg-white/[0.11] text-zinc-50"
                : "text-zinc-500 active:text-zinc-300"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl bg-white/[0.035] px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`tnum mt-0.5 text-[15px] font-semibold ${tone ?? "text-zinc-50"}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[10px] leading-tight text-zinc-600">{hint}</div>}
    </div>
  );
}

export function Scanner() {
  const [symbol, setSymbol] = useState("");
  const [budget, setBudget] = useState(600);
  const [dte, setDte] = useState("7-21");
  const [bias, setBias] = useState("auto");
  const [structure, setStructure] = useState("any");
  const [data, setData] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const lastQuery = useRef<string>("");

  const run = useCallback(
    async (sym: string, opts?: { scroll?: boolean }) => {
      const ticker = sym.trim().toUpperCase();
      if (!ticker) return;
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams({
        symbol: ticker,
        budget: String(budget),
        dte,
        bias,
        structure,
      });
      lastQuery.current = qs.toString();
      try {
        const res = await fetch(`/api/scan?${qs}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Scan failed.");
        setData(json as ScanResult);
        if (opts?.scroll) {
          requestAnimationFrame(() =>
            resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
          );
        }
      } catch (e) {
        setData(null);
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setLoading(false);
      }
    },
    [budget, dte, bias, structure],
  );

  // Re-run automatically when a filter changes, but only once a ticker is loaded.
  useEffect(() => {
    if (!data && !error) return;
    const sym = data?.underlying.symbol ?? symbol;
    if (!sym) return;
    const id = setTimeout(() => run(sym), 260);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget, dte, bias, structure]);

  const g = data?.gamma;
  const u = data?.underlying;
  const up = (u?.change ?? 0) >= 0;

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-8 sm:pt-12">
      <header className="mb-6">
        <div className="flex items-center gap-2.5">
          <svg className="h-7 w-7" viewBox="0 0 64 64" aria-hidden>
            <rect width="64" height="64" rx="14" fill="#12151d" />
            <path
              d="M8 46 C 20 46, 24 18, 32 18 C 40 18, 44 46, 56 46"
              fill="none"
              stroke="#7dd3fc"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <circle cx="32" cy="18" r="5" fill="#34d399" />
          </svg>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Gamma</h1>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">
          Pick a ticker and say what you can spend. It reads dealer positioning, vol and
          liquidity, then ranks the debit spreads and calls that actually fit.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(symbol, { scroll: true });
        }}
        className="space-y-4 rounded-2xl border border-white/10 bg-[#101219] p-4"
      >
        <div className="flex gap-2">
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="Ticker"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            maxLength={10}
            className="tnum min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-lg font-semibold tracking-wide text-zinc-50 outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-zinc-600 focus:border-sky-400/50"
          />
          <button
            type="submit"
            disabled={loading || !symbol.trim()}
            className="shrink-0 rounded-xl bg-sky-400 px-5 py-3 text-[15px] font-semibold text-[#06202c] transition-opacity disabled:opacity-35"
          >
            {loading ? "Reading" : "Scan"}
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {POPULAR.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setSymbol(t);
                run(t, { scroll: true });
              }}
              className="tnum rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-medium text-zinc-400 active:bg-white/10"
            >
              {t}
            </button>
          ))}
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Budget per trade</span>
            <span className="tnum text-sm font-semibold text-zinc-50">{usd0(budget)}</span>
          </div>
          <input
            type="range"
            min={50}
            max={5000}
            step={25}
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            className="w-full accent-sky-400"
            aria-label="Budget per trade"
          />
        </div>

        <Segmented
          options={STRUCTURE_OPTIONS}
          value={structure}
          onChange={setStructure}
          label="Structure"
          hint={structure === "spreads" ? "two legs" : structure === "any" ? "" : "single leg"}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Segmented options={DTE_OPTIONS} value={dte} onChange={setDte} label="Time frame" />
          <Segmented
            options={BIAS_OPTIONS}
            value={bias}
            onChange={setBias}
            label="Your view"
            hint={structure === "calls" || structure === "puts" ? "set by structure" : undefined}
            disabled={structure === "calls" || structure === "puts"}
          />
        </div>
      </form>

      <div ref={resultsRef} className="scroll-mt-4">
        {error && (
          <p className="mt-5 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        )}

        {loading && !data && (
          <div className="mt-5 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/[0.04]" />
            ))}
          </div>
        )}

        {u && g && data && (
          <div className={`mt-6 space-y-6 ${loading ? "opacity-50 transition-opacity" : ""}`}>
            <section className="rounded-2xl border border-white/10 bg-[#101219] p-4">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <h2 className="tnum text-lg font-semibold text-zinc-50">{u.symbol}</h2>
                  <p className="tnum text-[11px] text-zinc-500">
                    IV30 {(u.iv30 * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="text-right">
                  <div className="tnum text-xl font-semibold text-zinc-50">{usd(u.price)}</div>
                  <div className={`tnum text-[12px] ${up ? "text-emerald-400" : "text-rose-400"}`}>
                    {up ? "+" : ""}
                    {u.change.toFixed(2)} ({signedPct(u.changePercent)})
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Metric
                  label="Dealer gamma"
                  value={g.regime === "positive" ? "Positive" : "Negative"}
                  tone={g.regime === "positive" ? "text-emerald-300" : "text-rose-300"}
                  hint={
                    g.regime === "positive"
                      ? "Hedging dampens moves. Price tends to pin."
                      : "Hedging feeds moves. Expect follow through."
                  }
                />
                <Metric label="Net exposure" value={bigUsd(g.totalGex)} hint="Per 1% move" />
                <Metric
                  label="Call wall"
                  value={g.callWall == null ? "None" : strikeLabel(g.callWall)}
                  tone="text-emerald-300"
                  hint="Where upside stalls"
                />
                <Metric
                  label="Put wall"
                  value={g.putWall == null ? "None" : strikeLabel(g.putWall)}
                  tone="text-rose-300"
                  hint="Where downside slows"
                />
                <Metric
                  label="Gamma flip"
                  value={g.gammaFlip == null ? "Out of range" : strikeLabel(Number(g.gammaFlip.toFixed(2)))}
                  hint="Below here, moves accelerate"
                />
                <Metric
                  label="Expected move"
                  value={`${usd(g.expectedMove)}`}
                  hint={`1 sigma over ${g.horizonDays}d`}
                />
              </div>

              <div className="mt-4 rounded-xl bg-white/[0.03] px-3 py-2.5">
                <p className="text-[12px] leading-relaxed text-zinc-400">
                  Leaning{" "}
                  <span className={data.bias === "bullish" ? "text-emerald-300" : "text-rose-300"}>
                    {data.bias}
                  </span>{" "}
                  toward <span className="tnum text-zinc-200">{usd(data.target)}</span>. Scored{" "}
                  <span className="tnum">{data.considered.toLocaleString()}</span> structures.
                </p>
                {data.conflict && (
                  <p className="mt-2 border-t border-white/[0.07] pt-2 text-[12px] leading-relaxed text-amber-300/90">
                    Heads up: the gamma read points {data.naturalBias}, so these are scored
                    against the flow rather than with it.
                  </p>
                )}
              </div>
            </section>

            <section>
              <h2 className="mb-2 px-1 text-[11px] uppercase tracking-wider text-zinc-500">
                Gamma by strike
              </h2>
              <div className="rounded-2xl border border-white/10 bg-[#101219] p-4">
                <GexChart
                  perStrike={g.perStrike}
                  spot={u.price}
                  callWall={g.callWall}
                  putWall={g.putWall}
                />
              </div>
            </section>

            <section>
              <h2 className="mb-2 px-1 text-[11px] uppercase tracking-wider text-zinc-500">
                {structure === "calls"
                  ? "Calls"
                  : structure === "puts"
                    ? "Puts"
                    : structure === "spreads"
                      ? "Spreads"
                      : "Trades"}{" "}
                that fit {usd0(budget)}
              </h2>
              {data.ideas.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-[#101219] px-4 py-6 text-center text-sm text-zinc-500">
                  Nothing clean at this budget, structure and time frame. Try raising the
                  budget, widening the window, or setting structure back to Any.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {data.ideas.map((idea, i) => (
                    <IdeaCard key={idea.id} idea={idea} rank={i + 1} />
                  ))}
                </ul>
              )}
            </section>

            <p className="px-1 text-[11px] leading-relaxed text-zinc-600">
              {data.source}. Gamma exposure assumes dealers are long calls and short puts
              against customer flow, which is a positioning proxy rather than a measured book.
              Quotes are delayed, so confirm pricing in your broker before trading. Nothing
              here is financial advice.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
