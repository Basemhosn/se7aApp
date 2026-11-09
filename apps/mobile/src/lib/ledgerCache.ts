import AsyncStorage from "@react-native-async-storage/async-storage";
import type { LedgerDayResponse } from "@/types";

/**
 * Persistent cache of the last-seen /api/ledger/today response, keyed
 * by the viewed date. Lets Home render the ring + meals in the first
 * frame on cold start instead of waiting for the full fetch round-trip
 * — the fresh fetch overwrites the state shortly after. Biggest single
 * perceived-speed win for cold-opening the app.
 *
 * Non-authoritative by design: if a cached entry is wrong (user added
 * meals from the web, items deleted from another device), the next
 * live fetch corrects it. We only keep cache within a short TTL so
 * it never persists past the point of being useful.
 */

const STORAGE_PREFIX = "home_ledger_v1";
// 24h — a ledger older than that for a given date won't help the user
// (likely a different day entirely by the time they return) and risks
// showing wildly outdated numbers before the real fetch lands.
const TTL_MS = 24 * 60 * 60 * 1000;

interface CachedEntry {
  cached_at: number;
  ledger: LedgerDayResponse;
}

function storageKey(dateIso: string): string {
  return `${STORAGE_PREFIX}:${dateIso}`;
}

/** Non-blocking read — never throws; returns null on miss or stale. */
export async function readCachedLedger(
  dateIso: string
): Promise<LedgerDayResponse | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(dateIso));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEntry;
    if (!parsed?.cached_at || !parsed?.ledger) return null;
    if (Date.now() - parsed.cached_at > TTL_MS) return null;
    return parsed.ledger;
  } catch {
    return null;
  }
}

/** Fire-and-forget write; swallow errors. */
export function writeCachedLedger(
  dateIso: string,
  ledger: LedgerDayResponse
): void {
  const payload: CachedEntry = { cached_at: Date.now(), ledger };
  AsyncStorage.setItem(storageKey(dateIso), JSON.stringify(payload)).catch(
    () => {
      /* silent — losing a cache write is harmless */
    }
  );
}
