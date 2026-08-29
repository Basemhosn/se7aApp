"use client";

import { useEffect, useRef } from "react";

/**
 * Cursor-tracking radial glow on the plan band. Reads pointer position
 * and updates two CSS custom properties (--x, --y) that the parent's
 * ::before uses to position a soft radial gradient. Pure CSS handles
 * the visual; JS just moves the coordinates.
 *
 * Silently no-ops on touch devices (pointer:coarse) — no glow on iOS,
 * saves battery, avoids the persistent glow stuck where the user's
 * finger last touched.
 */
export function PlanBandAccent() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    if (window.matchMedia?.("(pointer: coarse)").matches) return;

    const onMove = (e: PointerEvent) => {
      const rect = parent.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      parent.style.setProperty("--x", `${x}%`);
      parent.style.setProperty("--y", `${y}%`);
    };
    parent.addEventListener("pointermove", onMove);
    return () => parent.removeEventListener("pointermove", onMove);
  }, []);

  return <div ref={ref} style={{ display: "none" }} />;
}
