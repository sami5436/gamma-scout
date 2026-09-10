"use client";

import { bigUsd, strikeLabel } from "@/lib/format";
import type { StrikeGamma } from "@/lib/gamma";

interface Props {
  perStrike: StrikeGamma[];
  spot: number;
  callWall: number | null;
  putWall: number | null;
}

/**
 * Horizontal net gamma bars, one row per strike. Horizontal rather than
 * vertical because strike labels stay readable on a phone this way.
 */
export function GexChart({ perStrike, spot, callWall, putWall }: Props) {
  const rows = perStrike
    .filter((r) => Math.abs(r.strike - spot) / spot <= 0.12)
    .filter((r) => r.netGex !== 0)
    .sort((a, b) => b.strike - a.strike)
    .slice(0, 26);

  if (!rows.length) {
    return <p className="text-sm text-zinc-500">Not enough open interest near spot to plot.</p>;
  }

  const max = Math.max(...rows.map((r) => Math.abs(r.netGex)));
  let spotDrawn = false;

  return (
    <div className="space-y-[3px]">
      {rows.map((r, i) => {
        const w = (Math.abs(r.netGex) / max) * 50;
        const pos = r.netGex >= 0;
        const isCallWall = r.strike === callWall;
        const isPutWall = r.strike === putWall;
        const showSpot = !spotDrawn && r.strike <= spot;
        if (showSpot) spotDrawn = true;

        return (
          <div key={r.strike}>
            {showSpot && i > 0 && (
              <div className="relative my-1 flex items-center gap-2">
                <div className="h-px flex-1 bg-sky-400/45" />
                <span className="tnum shrink-0 text-[10px] font-medium tracking-wide text-sky-300">
                  spot {strikeLabel(spot)}
                </span>
                <div className="h-px flex-1 bg-sky-400/45" />
              </div>
            )}
            <div className="flex items-center gap-2">
              <span
                className={`tnum w-14 shrink-0 text-right text-[11px] ${
                  isCallWall ? "font-semibold text-emerald-300" : isPutWall ? "font-semibold text-rose-300" : "text-zinc-500"
                }`}
              >
                {strikeLabel(r.strike)}
              </span>
              <div className="relative h-4 flex-1">
                <div className="absolute left-1/2 top-0 h-full w-px bg-white/10" />
                <div
                  className={`absolute top-[3px] h-[10px] rounded-sm ${pos ? "bg-emerald-400/80" : "bg-rose-400/80"}`}
                  style={
                    pos
                      ? { left: "50%", width: `${w}%` }
                      : { right: "50%", width: `${w}%` }
                  }
                />
              </div>
              <span className="tnum w-16 shrink-0 text-[10px] text-zinc-500">
                {bigUsd(r.netGex)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
