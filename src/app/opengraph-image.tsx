import { ImageResponse } from "next/og";

export const alt = "Gamma, an options scanner driven by dealer gamma exposure";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Rendered at build time and served to link unfurlers such as iMessage. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 84,
          background: "linear-gradient(140deg, #0b1220 0%, #07080b 55%, #0d1a17 100%)",
          color: "#e7e9ee",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <svg width="64" height="64" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="14" fill="#0f141c" />
            <path
              d="M8 46 C 20 46, 24 18, 32 18 C 40 18, 44 46, 56 46"
              fill="none"
              stroke="#7dd3fc"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <circle cx="32" cy="18" r="5" fill="#34d399" />
          </svg>
          <div style={{ fontSize: 60, fontWeight: 700, letterSpacing: -1.5 }}>Gamma</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 62, fontWeight: 600, lineHeight: 1.12, letterSpacing: -1.6, maxWidth: 940 }}>
            Debit spreads and calls, ranked by where dealers are pinned.
          </div>
          <div style={{ fontSize: 30, color: "#9aa3b2", maxWidth: 900 }}>
            Pick a ticker and a budget. Get trades that fit both.
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, fontSize: 24, color: "#7dd3fc" }}>
          {["Gamma exposure", "Call and put walls", "Liquidity", "Reward and risk"].map((t) => (
            <div
              key={t}
              style={{
                display: "flex",
                border: "1px solid #24303f",
                borderRadius: 999,
                padding: "10px 22px",
                background: "#0e141d",
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
