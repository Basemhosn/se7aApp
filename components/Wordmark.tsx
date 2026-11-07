/**
 * SE7A wordmark — shared component so every page uses the same mark.
 *
 * - variant="header" (default): SE7A text only, ~28px tall. Drops the
 *   صحة subtext so the mark fits a one-line page header at the same
 *   visual weight as the old HTML wordmark it replaces.
 * - variant="hero": full lockup including the Arabic صحة subtext,
 *   ~56px tall. Use for landing / marketing hero moments where the
 *   brand statement should sit larger and the subtext is readable.
 *
 * Both SVGs are cream + gold, baked colors tuned for the app's dark
 * background (--bg: #0b0d0b). If a light-background page ever ships,
 * add a "-light" variant rather than recoloring at the component.
 */
type Variant = "header" | "hero";

export function Wordmark({
  variant = "header",
  className,
}: {
  variant?: Variant;
  className?: string;
}) {
  const src = variant === "header" ? "/se7a-wordmark-text.svg" : "/se7a-wordmark.svg";
  const height = variant === "header" ? 28 : 56;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="SE7A"
      height={height}
      style={{ height, width: "auto", display: "block" }}
      className={className}
    />
  );
}
