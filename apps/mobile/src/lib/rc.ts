import { Platform } from "react-native";
import Purchases, {
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
  LOG_LEVEL,
} from "react-native-purchases";

/**
 * RevenueCat client wrapper. Configuration happens once at app boot;
 * downstream code calls the small facade below rather than importing
 * Purchases directly, so we can swap SDKs or add mocks later.
 *
 * Entitlement identifier: "pro" — configured in the RC dashboard to
 * grant when either se7a_pro_monthly or se7a_pro_annual is active.
 */

export const PRO_ENTITLEMENT = "pro";

let configured = false;

function apiKey(): string | null {
  const raw =
    Platform.OS === "ios"
      ? process.env.EXPO_PUBLIC_RC_IOS_KEY
      : Platform.OS === "android"
        ? process.env.EXPO_PUBLIC_RC_ANDROID_KEY
        : null;
  if (!raw) return null;
  // RC public keys are `appl_...` (iOS) or `goog_...` (Android). Anything
  // else — like the `test_` demo string from the RC signup wizard — will
  // make the native SDK throw an NSException on configure(), which
  // crashes the app before any JS try/catch can help. Refuse to init
  // rather than crash; the paywall will show its empty-offering state.
  const isValidShape =
    (Platform.OS === "ios" && raw.startsWith("appl_")) ||
    (Platform.OS === "android" && raw.startsWith("goog_"));
  if (!isValidShape) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(
        `[rc] EXPO_PUBLIC_RC_${Platform.OS.toUpperCase()}_KEY doesn't look like a real RC key (expected appl_/goog_ prefix). Skipping IAP init.`
      );
    }
    return null;
  }
  return raw;
}

/**
 * Boot the SDK. Safe to call multiple times — RC configure is
 * idempotent per-user but we track it locally to skip the noop.
 * The `appUserId` is our Supabase auth user id, so RC events carry
 * it back into our webhook without a mapping table.
 */
export function configureRc(appUserId: string | null) {
  const key = apiKey();
  if (!key) return; // env not set — Simulator or preview build w/o keys
  if (configured) {
    if (appUserId) {
      Purchases.logIn(appUserId).catch(() => {});
    }
    return;
  }
  // Wrap the whole init — a malformed key, missing RC dashboard config,
  // or bundle-id mismatch can throw synchronously and take down the app.
  // We'd rather ship without IAP than crash on launch.
  try {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.WARN : LOG_LEVEL.ERROR);
    Purchases.configure({
      apiKey: key,
      appUserID: appUserId ?? undefined,
    });
    configured = true;
  } catch {
    // Leave `configured` false so subsequent calls no-op; the paywall
    // will show its empty-offering state instead of crashing.
  }
}

export async function identifyRc(appUserId: string) {
  if (!apiKey()) return;
  try {
    await Purchases.logIn(appUserId);
  } catch {
    /* transient login failure — retry on next boot */
  }
}

export async function resetRc() {
  if (!apiKey()) return;
  try {
    await Purchases.logOut();
  } catch {
    /* if user was already anonymous, RC throws — safe to ignore */
  }
}

export async function fetchOffering(): Promise<PurchasesOffering | null> {
  if (!apiKey()) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch {
    return null;
  }
}

export async function refreshCustomerInfo(): Promise<CustomerInfo | null> {
  if (!apiKey()) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch {
    return null;
  }
}

export function hasProEntitlement(info: CustomerInfo | null): boolean {
  if (!info) return false;
  return !!info.entitlements.active[PRO_ENTITLEMENT];
}

/**
 * Wrap a purchase call with a normalized result. RC surfaces user-cancel
 * as an error — we recast it as `{ cancelled: true }` so the caller can
 * treat it non-exceptionally (no red toast on a benign cancel).
 */
export async function purchasePackage(
  pkg: PurchasesPackage
): Promise<
  | { cancelled: true }
  | { cancelled: false; info: CustomerInfo }
  | { cancelled: false; info: null; error: string }
> {
  if (!apiKey()) {
    return { cancelled: false, info: null, error: "billing_unavailable" };
  }
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { cancelled: false, info: customerInfo };
  } catch (e) {
    const err = e as { userCancelled?: boolean; message?: string };
    if (err.userCancelled) return { cancelled: true };
    return {
      cancelled: false,
      info: null,
      error: err.message ?? "purchase_failed",
    };
  }
}

export async function restorePurchases(): Promise<CustomerInfo | null> {
  if (!apiKey()) return null;
  try {
    return await Purchases.restorePurchases();
  } catch {
    return null;
  }
}
