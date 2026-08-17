import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt =
  "SE7A — AI food and fitness coach. Honest calorie ranges built for the Gulf.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0b0d0b",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 42,
            fontWeight: 800,
            letterSpacing: -1,
            color: "#eef2e9",
          }}
        >
          <span>SE</span>
          <span style={{ color: "#f6b73c" }}>7</span>
          <span>A</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 20,
              color: "#f6b73c",
              letterSpacing: 3,
              fontWeight: 600,
              textTransform: "uppercase",
            }}
          >
            AI food + fitness · Gulf-first
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 84,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -2,
              maxWidth: 940,
            }}
          >
            <div style={{ color: "#eef2e9" }}>Honest ranges.</div>
            <div style={{ color: "#f6b73c" }}>Not fake precision.</div>
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#8a937f",
              lineHeight: 1.35,
              maxWidth: 900,
              marginTop: 16,
            }}
          >
            Scan a plate, scan a menu, ask a coach. Machboos, shawarma,
            karak — SE7A knows what you eat.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontSize: 18,
            color: "#8a937f",
            letterSpacing: 1.5,
            fontFamily: "ui-monospace, monospace",
          }}
        >
          <div>SE7A.VERCEL.APP</div>
          <div>DUBAI · UAE</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
