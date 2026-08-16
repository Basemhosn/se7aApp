/**
 * SE7A native theme — mirrors the web globals.css palette so the two
 * surfaces feel like the same product.
 */
export const colors = {
  bg: "#0b0d0b",
  panel: "#121512",
  panel2: "#181c17",
  line: "#242a22",
  ink: "#eef2e9",
  dim: "#8a937f",
  gold: "#f6b73c",
  goldDim: "#c2892a",
  mint: "#5dcaa5",
  coral: "#f08f72",
  err: "#ff6b5e",
} as const;

export const font = {
  display: "Manrope_700Bold",
  displayBold: "Manrope_800ExtraBold",
  body: "InstrumentSans_400Regular",
  bodyBold: "InstrumentSans_600SemiBold",
  mono: "IBMPlexMono_400Regular",
  monoBold: "IBMPlexMono_500Medium",
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  xxl: 40,
} as const;
