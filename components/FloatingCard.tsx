"use client";

import type { ReactNode } from "react";

/**
 * Small notification-style card that hovers over a phone screenshot
 * (usetaskr-style "4.9★ Top rated pros" callouts). Positioned
 * absolutely relative to the .feature-shot container; caller chooses
 * a `pos` preset so the pill lands somewhere legible. Animated with
 * a subtle float via CSS keyframes; per-instance delay so multiple
 * cards don't bob in sync.
 *
 * Rendered as a plain client component (no state) so it's safe to
 * hydrate on server-rendered pages without a wave.
 */
export function FloatingCard({
  kicker,
  title,
  sub,
  pos,
  delay = 0,
  accent,
}: {
  kicker?: string;
  title: string;
  sub?: string;
  pos: "tl" | "tr" | "bl" | "br" | "l" | "r";
  delay?: number; // seconds
  accent?: boolean;
}) {
  return (
    <div
      className={`floating-card pos-${pos} ${accent ? "floating-accent" : ""}`}
      style={{ animationDelay: `${delay}s` }}
    >
      {kicker ? <div className="floating-kicker">{kicker}</div> : null}
      <div className="floating-title">{title}</div>
      {sub ? <div className="floating-sub">{sub}</div> : null}
    </div>
  );
}

export function FloatingIconCard({
  icon,
  title,
  sub,
  pos,
  delay = 0,
}: {
  icon: ReactNode;
  title: string;
  sub?: string;
  pos: "tl" | "tr" | "bl" | "br" | "l" | "r";
  delay?: number;
}) {
  return (
    <div
      className={`floating-card floating-icon-card pos-${pos}`}
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="floating-icon">{icon}</div>
      <div>
        <div className="floating-title">{title}</div>
        {sub ? <div className="floating-sub">{sub}</div> : null}
      </div>
    </div>
  );
}
