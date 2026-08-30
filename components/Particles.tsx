"use client";

import { useMemo } from "react";

/**
 * Slowly drifting background particles for hero/CTA sections. Renders
 * a random arrangement of small SVG glyphs (SE7A gold arrows, dots,
 * and rings) with per-particle keyframe delays so the motion doesn't
 * pulse in lockstep.
 *
 * Uses deterministic pseudo-random positions from a fixed seed so
 * server + client render match (no hydration mismatch). Pure CSS
 * animation on transform + opacity — compositor-only, no layout.
 *
 * Silent for prefers-reduced-motion (CSS media query pauses the
 * animations; particles stay statically placed).
 */
export function Particles({
  count = 22,
  variant = "hero",
}: {
  count?: number;
  variant?: "hero" | "cta";
}) {
  const particles = useMemo(() => {
    // Deterministic PRNG so SSR + CSR match. LCG seeded on count+variant.
    let seed = count * 97 + (variant === "cta" ? 31 : 7);
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    return Array.from({ length: count }).map((_, i) => {
      const kind = i % 3; // 0 = arrow, 1 = dot, 2 = ring
      return {
        i,
        kind,
        left: rand() * 100,
        top: rand() * 100,
        size: 8 + rand() * 14,
        delay: rand() * 8,
        duration: 12 + rand() * 14,
        opacity: 0.22 + rand() * 0.38,
        rotate: rand() * 360,
      };
    });
  }, [count, variant]);

  return (
    <div className={`particles ${variant === "cta" ? "particles-cta" : ""}`} aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.i}
          className="particle"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            opacity: p.opacity,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        >
          {p.kind === 0 ? (
            <ArrowGlyph />
          ) : p.kind === 1 ? (
            <DotGlyph />
          ) : (
            <RingGlyph />
          )}
        </span>
      ))}
    </div>
  );
}

function ArrowGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2 8h11m-4-4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function DotGlyph() {
  return (
    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="3" fill="currentColor" />
    </svg>
  );
}
function RingGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
