import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

const SITE_URL = "https://se7a.vercel.app";
const TITLE = "SE7A — AI Food & Fitness Coach";
const DESCRIPTION =
  "Scan a plate, scan a menu, ask a coach — honest calorie ranges built for the Gulf. Not fake precision.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "SE7A",
    type: "website",
    locale: "en_US",
    // opengraph-image.tsx in this folder auto-populates og:image at 1200×630
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
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
