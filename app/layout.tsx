import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "SE7A — AI Food & Fitness Coach",
  description:
    "Scan any menu. Know what to order. SE7A reads restaurant menus and your remaining macros, then tells you exactly what to eat. Eat smart, train smart.",
  metadataBase: new URL("https://se7a.app"),
  openGraph: {
    title: "SE7A — AI Food & Fitness Coach",
    description: "Scan any menu. Know what to order. Built for how we actually eat.",
    url: "https://se7a.app",
    siteName: "SE7A",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Instrument+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
