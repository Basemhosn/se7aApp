"use client";

import { useEffect, useState } from "react";

/**
 * Slim gold progress bar pinned to the very top of the viewport that
 * fills as the user scrolls the page. A small polish detail borrowed
 * from long-form editorial sites — makes the landing feel like a
 * curated story with a beginning and end.
 *
 * Uses window.scrollY / (documentHeight - viewportHeight). Updated
 * via requestAnimationFrame throttling so it never fires more than
 * once per frame.
 */
export function ScrollProgress() {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    let raf = 0;
    const compute = () => {
      raf = 0;
      const doc = document.documentElement;
      const total = doc.scrollHeight - window.innerHeight;
      if (total <= 0) return setPct(0);
      const p = Math.max(0, Math.min(1, window.scrollY / total));
      setPct(p);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="scroll-progress">
      <div className="scroll-progress-fill" style={{ transform: `scaleX(${pct})` }} />
    </div>
  );
}
