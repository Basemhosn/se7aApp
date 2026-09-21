import { api } from "./api";

export interface PollScanResult {
  id: string;
  kind: string;
  status: "queued" | "processing" | "ready" | "failed";
  parsed?: unknown;
  error_message?: string | null;
}

/**
 * Poll a background-processing scan until it reaches ready/failed.
 *
 * Used by menu + body scanners in build 70's async refactor. Plate
 * uses a different mechanism (scanStore + Home reconciliation) because
 * users navigate away — menu/body scans, users stay on the review
 * screen so a simple poll is enough.
 *
 * Backoff: 1s initial, 2s steady after the first 5 polls. Total wait
 * capped by `maxWaitSec` (typically 4 minutes; server ceiling is 300s
 * so anything longer means the server crashed or ran out of budget).
 *
 * Server push arrives independently — if the user backgrounds mid-poll
 * and iOS pauses JS, the push wakes them and the deep link opens the
 * review directly.
 */
export async function pollScan(
  scanId: string,
  kind: "menu" | "body" | "plate",
  maxWaitSec: number
): Promise<PollScanResult> {
  const start = Date.now();
  const capMs = maxWaitSec * 1000;
  let attempt = 0;
  while (Date.now() - start < capMs) {
    attempt += 1;
    try {
      const res = await api<PollScanResult>(
        `/api/scan/${kind}/${encodeURIComponent(scanId)}`
      );
      if (res.status === "ready" || res.status === "failed") {
        return res;
      }
    } catch {
      // Transient network error — keep polling.
    }
    await new Promise((r) => setTimeout(r, attempt <= 5 ? 1000 : 2000));
  }
  return {
    id: scanId,
    kind,
    status: "failed",
    error_message: "Scan is taking longer than expected. Try again.",
  };
}
