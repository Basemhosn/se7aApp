"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animates a number from 0 (or a start value) to `to` when the
 * element enters the viewport. Fires once. Uses requestAnimationFrame
 * with a cubic-ease for a natural feel (no linear counter jank).
 *
 * Fixed-decimals via `decimals` for values like 0.5s (not just ints).
 * Suffix (e.g. "s", "%", "+") renders in a smaller inline span so the
 * numeric part stays the dominant visual.
 */
export function CountUp({
  to,
  duration = 1600,
  decimals = 0,
  suffix,
  prefix,
  className,
}: {
  to: number;
  duration?: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      setValue(to);
      return;
    }

    let started = false;
    let rafId = 0;

    const start = () => {
      if (started) return;
      started = true;
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / duration);
        // Cubic ease-out: 1 - (1-x)^3
        const eased = 1 - Math.pow(1 - p, 3);
        setValue(eased * to);
        if (p < 1) rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          start();
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(node);
    return () => {
      io.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, [to, duration]);

  const display =
    decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display}
      {suffix ? <span className="countup-suffix">{suffix}</span> : null}
    </span>
  );
}
