import { useEffect, useState } from "react";
import { api } from "./api";

/**
 * Fetch a food image URL for a dish name from our server-side proxy.
 * Server does its own caching (Redis), so this hook is basically a
 * one-shot fetch. Locally, we also cache in-memory across the app
 * lifetime so re-rendering a plan doesn't re-fetch the same URLs.
 *
 * Returns null while loading OR when no image was found. The consumer
 * should fall back to its slot-icon badge in either case.
 */

const inMemoryCache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

export function useFoodImage(name: string | null | undefined): string | null {
  const key = (name ?? "").trim().toLowerCase();
  const cached = inMemoryCache.get(key);
  const [url, setUrl] = useState<string | null>(cached ?? null);

  useEffect(() => {
    if (!key) return;
    if (inMemoryCache.has(key)) {
      setUrl(inMemoryCache.get(key) ?? null);
      return;
    }
    let cancelled = false;

    const existing = inFlight.get(key);
    const p =
      existing ??
      api<{ url: string | null }>(
        `/api/food-image?q=${encodeURIComponent(key)}`
      )
        .then((res) => res.url ?? null)
        .catch(() => null);

    if (!existing) inFlight.set(key, p);

    p.then((result) => {
      inMemoryCache.set(key, result);
      inFlight.delete(key);
      if (!cancelled) setUrl(result);
    });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return url;
}
