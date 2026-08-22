/**
 * Recovery band buckets + coaching language. Kept small + pure so
 * both server routes and future client code can share it.
 *
 * Whoop's own colors: red (0-33), yellow (34-66), green (67-100).
 * Oura's readiness uses the same 0-100 scale so we can bucket both
 * identically without re-thinking the thresholds.
 */

export type RecoveryBand = "poor" | "compromised" | "primed";

export function bandForScore(score: number): RecoveryBand {
  if (score < 34) return "poor";
  if (score < 67) return "compromised";
  return "primed";
}

/**
 * Short one-sentence coaching bias per band. Deliberately kept generic
 * — the coach is the one making the actual call, this just supplies a
 * conservative starting point so the model doesn't push a "green light"
 * session on a red-recovery day.
 */
export function coachHintForBand(band: RecoveryBand, score: number): string {
  switch (band) {
    case "poor":
      return `Recovery ${score}%. Rest today or keep it easy — walk, mobility, low-intensity. Don't program intensity.`;
    case "compromised":
      return `Recovery ${score}%. Keep planned volume but cut intensity ~10–15%. Skip max-effort sets.`;
    case "primed":
      return `Recovery ${score}%. Green light — hard session is on the table if programmed.`;
  }
}
