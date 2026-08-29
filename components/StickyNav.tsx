"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Nav bar wrapper that gets a subtle glass/blur background once the
 * user has scrolled past the hero. Children pass through unchanged
 * (plain ReactNode — no render prop) so this stays SSR-safe: the
 * page-level Server Component can pass regular JSX in without hitting
 * the "functions can't cross Server→Client boundary" error.
 *
 * Scroll state lives here; the toggle just flips a class name on the
 * wrapper. CSS in globals.css owns the actual visual (padding shrink,
 * backdrop blur, border-bottom).
 */
export function StickyNav({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className={`nav-wrap ${scrolled ? "nav-wrap-scrolled" : ""}`}>
      {children}
    </div>
  );
}
