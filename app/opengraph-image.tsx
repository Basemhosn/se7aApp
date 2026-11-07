import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt =
  "SE7A — AI food and fitness coach. Honest calorie ranges built for the Gulf.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Inline the SE7A wordmark SVG as a data URL so the OG renderer doesn't
// need to fetch or read from disk. Must stay in sync with
// public/se7a-wordmark-text.svg (cream SE+A, gold hybrid 7/ح glyph).
const WORDMARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="594" height="232" viewBox="0 0 594 232"><path d="M109.4384765625 195.7578125C136.318359375 195.7578125 152.724609375 182.7939453125 152.724609375 161.7734375C152.724609375 145.3671875 142.3974609375 135.7724609375 119.1064453125 130.865234375L108.6328125 128.5947265625C95.2294921875 125.6650390625 89.8095703125 121.9296875 89.8095703125 115.19140625C89.8095703125 107.2080078125 97.646484375 101.6416015625 108.779296875 101.6416015625C120.498046875 101.6416015625 128.1884765625 108.013671875 128.994140625 118.3408203125H150.087890625C149.4287109375 96.3681640625 133.828125 83.111328125 108.7060546875 83.111328125C83.876953125 83.111328125 67.2509765625 96.44140625 67.2509765625 116.2900390625C67.2509765625 131.890625 77.724609375 141.9248046875 99.3310546875 146.6123046875L110.830078125 149.1025390625C124.6728515625 152.10546875 130.3857421875 156.20703125 130.3857421875 163.23828125C130.3857421875 171.734375 122.109375 177.2275390625 109.5849609375 177.2275390625C95.595703125 177.2275390625 87.1728515625 170.1962890625 86.8798828125 158.1845703125H65.126953125C65.126953125 181.9150390625 81.4599609375 195.7578125 109.4384765625 195.7578125Z M168.1787109375 194.0H246.474609375V174.6640625H190.7373046875V148.296875H242.2998046875V129.4736328125H190.7373046875V104.205078125H246.474609375V84.869140625H168.1787109375Z" fill="#F4EDE0"/><g transform="translate(226.330322265625 35.10546875) scale(0.44431849888392855)"><path d="M100 142 H400 C298 195 178 265 178 325 C178 367 240 377 300 361" fill="none" stroke="#EFB13A" stroke-width="64"/></g><path d="M418.4919084821429 194.0H442.8083147321429L450.7184709821429 170.1962890625H491.5143694196429L499.1315569196429 194.0H524.1071428571429L485.8014787946429 84.869140625H456.7975725446429ZM456.7975725446429 152.1787109375 460.5329241071429 140.8994140625C464.0485491071429 129.7666015625 467.4176897321429 118.6337890625 471.3727678571429 105.083984375C475.2546037946429 118.6337890625 478.6237444196429 129.7666015625 481.9928850446429 140.8994140625L485.6549944196429 152.1787109375Z" fill="#F4EDE0"/></svg>`;
const WORDMARK_DATA_URL = `data:image/svg+xml;utf8,${encodeURIComponent(WORDMARK_SVG)}`;

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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={WORDMARK_DATA_URL} width={320} height={125} alt="SE7A" />

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
          <div>SE7A.APP</div>
          <div>DUBAI · UAE</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
