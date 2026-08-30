"use client";

import type { ReactNode } from "react";

/**
 * Infinite horizontal marquee. Duplicates its children once so the
 * loop is seamless — one animation moves both copies together at
 * exactly -50% translate, which lands the second copy where the first
 * started. Speed configurable via CSS variable.
 *
 * Kept pure CSS (transform + animation) so it runs on the compositor
 * and doesn't force layout. Pauses on hover for readability. Silent
 * when prefers-reduced-motion is reduced (falls back to a static
 * single row).
 */
export function Marquee({
  children,
  duration = 40,
}: {
  children: ReactNode;
  duration?: number; // seconds for one full loop
}) {
  return (
    <div className="marquee" style={{ "--marquee-duration": `${duration}s` } as React.CSSProperties}>
      <div className="marquee-track">
        <div className="marquee-group">{children}</div>
        <div className="marquee-group" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}
