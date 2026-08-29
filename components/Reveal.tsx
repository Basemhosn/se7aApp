"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Scroll-triggered fade-in wrapper. Uses IntersectionObserver so the
 * animation runs on the compositor and doesn't block the main thread.
 *
 * Renders as a plain <div> with opacity + translateY transitions. The
 * "visible" state flips once when the element crosses the viewport
 * threshold (25%) — no re-triggering on scroll back up. Delay staggers
 * children for cascading reveals.
 *
 * Keep the wrapper cheap: no library, no context, no observer per
 * element beyond what's necessary. One shared observer would be
 * more optimal but per-element is fine for a marketing landing with
 * ~10-20 reveal targets.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number; // ms
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Respect reduced-motion. Skip the observer entirely and render
    // as if already visible — no animation at all.
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      setVisible(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -80px 0px" }
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${visible ? "reveal-in" : ""} ${className}`}
      style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}
