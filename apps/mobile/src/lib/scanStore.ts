import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PlateItem } from "@/types";
import { api } from "./api";

/**
 * Async plate-scan store (v2 2026-09-16).
 *
 * The scan flow is fully server-owned: client uploads, gets a scan_id,
 * server processes AI in the background (waitUntil, up to 300s) and
 * pushes a notification when done. This store is the client-side
 * projection of the server state.
 *
 * State survives:
 *   • navigation between screens (Home + review read the same array)
 *   • app backgrounding + relaunch (rehydrates on module import)
 *   • app KILL — on rehydrate we reconcile against the server using
 *     the persisted scan_id, so a previously in-flight scan becomes
 *     "ready" if the server finished while the app was gone.
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
  // scanId is the server-side UUID. Set as soon as POST /api/scan/plate
  // returns (typically < 3s). Reconciliation relies on this — a
  // PendingScan without scanId is orphaned and can't be recovered.
  scanId?: string | null;
  // Populated when status becomes "ready".
  items?: PlateItem[];
  confidence?: "low" | "medium" | "high";
  invisibleCosts?: string[];
  // Freeform reasoning the model wrote about its estimate — added
  // with plate.v3 prompt (2026-09-18) so users can sanity-check the
  // container-size assumption behind the ranges.
  notes?: string;
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
        // Discard entries older than 6 hours.
        const cutoff = Date.now() - 6 * 60 * 60 * 1000;
        scans = parsed.filter((s) => s.createdAt > cutoff);
        // An entry stuck in "uploading" without a scanId means the
        // POST /start never returned — the initial upload was killed
        // mid-flight. There's nothing to reconcile against, so fail
        // it and let the user retry.
        scans = scans.map((s) =>
          (s.status === "uploading" && !s.scanId)
            ? { ...s, status: "failed", errorMessage: "upload_interrupted" }
            : s
        );
        emit();
      }
    }
  } catch {
    /* corrupt cache — reset silently */
  }
  // After hydrate: pull server truth for anything still in flight.
  void reconcileFromServer();
}

/**
 * For every locally-pending scan that has a scanId, ask the server
 * what state it's in and merge. Called on hydrate + on app-focus +
 * after a push notification arrives.
 *
 * We never mutate a scan the user has already dismissed (removed from
 * the store), and we never revert a "ready" back to earlier states.
 */
export async function reconcileFromServer(): Promise<void> {
  const pending = scans.filter(
    (s) =>
      (s.status === "uploading" || s.status === "analyzing") && !!s.scanId
  );
  if (pending.length === 0) return;
  await Promise.all(
    pending.map(async (s) => {
      try {
        const remote = await api<{
          id: string;
          status: PendingScanStatus | "queued" | "processing";
          parsed?: {
            items?: PlateItem[];
            confidence?: "low" | "medium" | "high";
            invisible_costs?: string[];
            notes?: string;
          } | null;
          error_message?: string | null;
        }>(`/api/scan/plate/${encodeURIComponent(s.scanId!)}`);
        if (remote.status === "ready" && remote.parsed) {
          markReady(s.localId, {
            scanId: remote.id,
            items: remote.parsed.items ?? [],
            confidence: remote.parsed.confidence ?? "medium",
            invisibleCosts: remote.parsed.invisible_costs ?? [],
            notes: remote.parsed.notes,
          });
        } else if (remote.status === "failed") {
          markFailed(s.localId, remote.error_message ?? "ai_failed");
        } else if (
          remote.status === "queued" ||
          remote.status === "processing"
        ) {
          // Still working server-side; ensure our local status reflects
          // the "analyzing" phase so the UI doesn't say "uploading" forever.
          if (s.status === "uploading") markAnalyzing(s.localId);
        }
      } catch {
        /* transient — reconcile will retry on next focus/hydrate */
      }
    })
  );
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

/**
 * Called immediately after the server accepts an upload and returns
 * a scan_id. Storing it here is what makes app-kill survivable — the
 * next launch can reconcile against the server by this id.
 */
export function attachScanId(localId: string, scanId: string): void {
  scans = scans.map((s) =>
    s.localId === localId ? { ...s, scanId, status: "analyzing" } : s
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
    notes?: string;
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
          notes: payload.notes,
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
