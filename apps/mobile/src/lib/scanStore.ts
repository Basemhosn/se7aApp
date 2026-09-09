import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PlateItem } from "@/types";

/**
 * Async plate-scan store (2026-09-10).
 *
 * Backs the Cal.ai-style "kick off scan, come back later" pattern.
 * The scan screen registers a pending entry here, navigates to Home,
 * and the AI call runs in background. Home renders a card for each
 * pending scan; tapping a `ready` one hops back into the scan review
 * screen with the pre-fetched items.
 *
 * Module-level array + AsyncStorage mirror so the state survives:
 *   • navigation between screens (Home reads the same array)
 *   • app backgrounding + relaunch (rehydrates on module import)
 *   • the scan happening while the user is elsewhere
 *
 * NOT persisting the raw image bytes — only the local URI. If the OS
 * clears the temp image before the scan finishes, we lose the preview
 * but not the result (the server already has the upload).
 */

export type PendingScanStatus = "uploading" | "analyzing" | "ready" | "failed";

export interface PendingScan {
  localId: string;
  createdAt: number;
  previewUri: string | null;
  status: PendingScanStatus;
  // Populated when status becomes "ready".
  scanId?: string | null;
  items?: PlateItem[];
  confidence?: "low" | "medium" | "high";
  invisibleCosts?: string[];
  // Populated when status becomes "failed".
  errorMessage?: string;
}

const STORAGE_KEY = "se7a_pending_scans_v1";

let scans: PendingScan[] = [];
const subscribers = new Set<(list: PendingScan[]) => void>();
let hydrated = false;

async function persist(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(scans));
  } catch {
    /* best-effort — losing the persist just means a crash loses in-flight
       scan progress. In-memory list still works for the current session. */
  }
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PendingScan[];
      if (Array.isArray(parsed)) {
        // Discard entries older than 6 hours — anything that hasn't
        // resolved by then is stale (AI call failed silently, network
        // dropped, etc.) and would confuse the user.
        const cutoff = Date.now() - 6 * 60 * 60 * 1000;
        scans = parsed.filter((s) => s.createdAt > cutoff);
        // Anything left in "uploading" or "analyzing" after a relaunch
        // is orphaned — the scan promise is gone. Mark them failed so
        // the user can retry rather than staring at a stuck spinner.
        scans = scans.map((s) =>
          s.status === "uploading" || s.status === "analyzing"
            ? { ...s, status: "failed", errorMessage: "app_restarted" }
            : s
        );
        emit();
      }
    }
  } catch {
    /* corrupt cache — reset silently */
  }
}

function emit(): void {
  for (const cb of subscribers) cb(scans);
}

/** One-shot rehydrate on module import. Fire and forget. */
void hydrate();

/**
 * Register a new pending scan and return its local ID. The caller is
 * responsible for kicking off the actual AI work and calling
 * markReady/markFailed when it settles.
 */
export function registerScan(previewUri: string | null): string {
  const localId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  scans = [
    { localId, createdAt: Date.now(), previewUri, status: "uploading" },
    ...scans,
  ];
  emit();
  void persist();
  return localId;
}

export function markAnalyzing(localId: string): void {
  scans = scans.map((s) =>
    s.localId === localId ? { ...s, status: "analyzing" } : s
  );
  emit();
  void persist();
}

export function markReady(
  localId: string,
  payload: {
    scanId: string;
    items: PlateItem[];
    confidence: "low" | "medium" | "high";
    invisibleCosts: string[];
  }
): void {
  scans = scans.map((s) =>
    s.localId === localId
      ? {
          ...s,
          status: "ready",
          scanId: payload.scanId,
          items: payload.items,
          confidence: payload.confidence,
          invisibleCosts: payload.invisibleCosts,
        }
      : s
  );
  emit();
  void persist();
}

export function markFailed(localId: string, message: string): void {
  scans = scans.map((s) =>
    s.localId === localId
      ? { ...s, status: "failed", errorMessage: message }
      : s
  );
  emit();
  void persist();
}

/** Remove a scan from the store (call after the user saves it or dismisses). */
export function removeScan(localId: string): void {
  scans = scans.filter((s) => s.localId !== localId);
  emit();
  void persist();
}

export function getScans(): PendingScan[] {
  return [...scans];
}

export function getScan(localId: string): PendingScan | undefined {
  return scans.find((s) => s.localId === localId);
}

/**
 * Subscribe to store changes. Fires immediately with the current list
 * so callers can use it in a useEffect without a separate initial read.
 * Returns an unsubscribe.
 */
export function subscribeScans(
  cb: (list: PendingScan[]) => void
): () => void {
  subscribers.add(cb);
  cb([...scans]);
  return () => {
    subscribers.delete(cb);
  };
}
