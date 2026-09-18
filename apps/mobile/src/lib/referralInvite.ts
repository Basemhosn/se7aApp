import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";

/**
 * Referral invite deep-link handler.
 *
 * When a user taps a shared referral link:
 *   • https://se7a.app/join/<code> — universal link (opens app if installed)
 *   • se7a://join/<code>          — custom scheme (fallback)
 *
 * We extract the code and stash it in AsyncStorage so the Settings
 * "Have a friend's code?" attach block (or, later, an onboarding
 * step) can pre-fill it without the user having to remember or type.
 *
 * Codes are 6-12 hex characters; anything else is silently ignored.
 */

const STORAGE_KEY = "se7a_pending_invite_code_v1";
const VALID = /^[a-f0-9]{6,12}$/;

/**
 * Try to extract a referral code from a URL. Handles both formats:
 *   https://se7a.app/join/ABC123
 *   se7a://join/ABC123
 * Case-insensitive on the host and path prefix; codes are normalized
 * to lowercase to match the server-side schema.
 */
export function extractCodeFromUrl(url: string): string | null {
  try {
    const parsed = Linking.parse(url);
    // Both universal links and custom scheme URLs parse `path` similarly
    // ("join/ABC" or "/join/ABC"). Normalize + split.
    const parts = (parsed.path ?? "")
      .replace(/^\/+/, "")
      .split("/")
      .filter(Boolean);
    if (parts.length < 2) return null;
    if (parts[0]?.toLowerCase() !== "join") return null;
    const code = parts[1]!.toLowerCase().trim();
    return VALID.test(code) ? code : null;
  } catch {
    return null;
  }
}

export async function stashInviteCode(code: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* best-effort */
  }
}

export async function readInviteCode(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    return v && VALID.test(v) ? v : null;
  } catch {
    return null;
  }
}

export async function clearInviteCode(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* best-effort */
  }
}

/**
 * Handle a URL fired at app cold-start or via the Linking listener.
 * Idempotent — safe to call for every URL event; codes without a
 * /join/ path are ignored.
 */
export async function handleInviteUrl(url: string | null): Promise<void> {
  if (!url) return;
  const code = extractCodeFromUrl(url);
  if (code) await stashInviteCode(code);
}
