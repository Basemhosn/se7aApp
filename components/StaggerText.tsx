"use client";

import React, {
  Fragment,
  createElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type StaggerTag = "h1" | "h2" | "span" | "div" | "p";

/**
 * Word-by-word entry animation for hero headlines. Splits string
 * children on whitespace and wraps each word in a span with a
 * staggered transition delay. Fires once when the element enters
 * the viewport.
 *
 * Preserves nested JSX (accent spans, <br />) — we recurse into
 * elements so a mix like `"foo " + <span className="gold">bar</span>`
 * still staggers correctly and the accent color survives.
 */
export function StaggerText({
  children,
  as = "h1",
  className,
  step = 60,
  delay = 0,
}: {
  children: ReactNode;
  as?: StaggerTag;
  className?: string;
  step?: number;
  delay?: number;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -60px 0px" }
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  const state = { i: 0 };
  const rendered = walk(children, state, step, delay, visible);

  return createElement(
    as,
    {
      ref,
      className: `stagger ${visible ? "stagger-in" : ""} ${className ?? ""}`,
    },
    rendered
  );
}

function walk(
  node: ReactNode,
  state: { i: number },
  step: number,
  base: number,
  visible: boolean
): ReactNode {
  if (typeof node === "string") {
    const parts = node.split(/(\s+)/);
    return parts.map((part, k) => {
      if (part.trim() === "") return <span key={`ws-${k}`}>{part}</span>;
      const idx = state.i++;
      return (
        <span
          key={`w-${idx}-${k}`}
          className="stagger-word"
          style={{ transitionDelay: visible ? `${base + idx * step}ms` : "0ms" }}
        >
          {part}
        </span>
      );
    });
  }
  if (Array.isArray(node)) {
    return node.map((c, i) => (
      <Fragment key={i}>{walk(c, state, step, base, visible)}</Fragment>
    ));
  }
  if (React.isValidElement(node)) {
    const el = node as React.ReactElement<{ children?: ReactNode }>;
    return React.cloneElement(el, {
      ...el.props,
      children: walk(el.props.children, state, step, base, visible),
    });
  }
  return node;
}
