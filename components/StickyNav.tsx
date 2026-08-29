"use client";

import { useEffect, useState } from "react";

/**
 * Nav bar that gets a subtle glass/blur background once the user has
 * scrolled past the hero. Client-only because it hooks window scroll;
 * SSR fallback renders the transparent (default) state, so no
 * layout jump on hydration.
 */
export function StickyNav({
  children,
}: {
  children: (isScrolled: boolean) => React.ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return <>{children(scrolled)}</>;
}
