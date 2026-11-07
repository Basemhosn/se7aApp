import { Platform } from "react-native";
import {
  GoogleSignin,
  statusCodes,
  isErrorWithCode,
} from "@react-native-google-signin/google-signin";

/**
 * Native Google Sign-In helper. Replaces the WebBrowser-based OAuth
 * flow for iOS/Android where the native SDK gives a cleaner UX:
 *
 *   - No more iOS "SE7A wants to use supabase.co to Sign In" system
 *     dialog (that only fires for ASWebAuthenticationSession, which
 *     the native SDK bypasses entirely).
 *   - Google's native account picker shows SE7A branding directly
 *     from the OAuth consent screen config — not the Supabase project
 *     subdomain.
 *
 * Flow: GoogleSignin.signIn() returns a Google ID token → we hand it
 * to supabase.auth.signInWithIdToken({ provider: 'google', token })
 * and Supabase creates / resumes the session the same way it would
 * after the web OAuth callback.
 *
 * Requires two env vars at build time:
 *   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID  (OAuth client id for the iOS app)
 *   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID  (OAuth client id used by Supabase;
 *     also required here because iOS SDK needs it to request an
 *     idToken that Supabase will accept)
 *
 * If either is missing, isGoogleSignInConfigured() returns false and
 * callers should fall back to the WebBrowser OAuth path so sign-in
 * keeps working during the Google Cloud setup window.
 */

let configured = false;

export function configureGoogleSignIn(): boolean {
  if (configured) return true;
  if (Platform.OS !== "ios" && Platform.OS !== "android") return false;

  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!iosClientId || !webClientId) return false;

  GoogleSignin.configure({
    iosClientId,
    webClientId,
    offlineAccess: false,
  });
  configured = true;
  return true;
}

export function isGoogleSignInConfigured(): boolean {
  return (
    !!process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID &&
    !!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  );
}

export type GoogleSignInResult =
  | { kind: "ok"; idToken: string }
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

/**
 * Open the native Google account picker and return the ID token.
 * Caller is responsible for exchanging the ID token for a Supabase
 * session (via supabase.auth.signInWithIdToken).
 */
export async function signInWithGoogleNative(): Promise<GoogleSignInResult> {
  if (!configureGoogleSignIn()) {
    return { kind: "error", message: "Google Sign-In not configured" };
  }
  try {
    if (Platform.OS === "android") {
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });
    }
    const result = await GoogleSignin.signIn();
    // v14+ SDK returns { type: 'success' | 'cancelled', data? }
    if (result.type === "cancelled") {
      return { kind: "cancelled" };
    }
    const idToken = result.data?.idToken ?? null;
    if (!idToken) {
      return { kind: "error", message: "no idToken returned" };
    }
    return { kind: "ok", idToken };
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) {
        return { kind: "cancelled" };
      }
      return { kind: "error", message: `${e.code}: ${e.message}` };
    }
    return { kind: "error", message: (e as Error)?.message ?? "unknown" };
  }
}

export async function signOutGoogle(): Promise<void> {
  if (!configured) return;
  try {
    await GoogleSignin.signOut();
  } catch {
    /* silent */
  }
}
