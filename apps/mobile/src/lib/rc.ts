/**
 * TEMPORARY STUB — react-native-purchases removed for TestFlight launch
 * bisect. Restore this file to its git history state once we identify
 * which native module is causing the launch crash. All exports here
 * return no-op / free-tier values so the paywall UI renders its empty
 * state and no purchase flow is available.
 */

// Placeholder types matching what the real SDK exposes, so importers
// don't need to change.
export interface CustomerInfo {
  entitlements: { active: Record<string, unknown> };
}
export type PurchasesOffering = {
  availablePackages: PurchasesPackage[];
} | null;
export interface PurchasesPackage {
  identifier: string;
  packageType: string;
  product: { identifier: string; price: number; priceString: string };
}

export const PRO_ENTITLEMENT = "pro";

export function configureRc(_appUserId: string | null) {
  /* no-op */
}
export async function identifyRc(_appUserId: string) {
  /* no-op */
}
export async function resetRc() {
  /* no-op */
}
export async function fetchOffering(): Promise<PurchasesOffering> {
  return null;
}
export async function refreshCustomerInfo(): Promise<CustomerInfo | null> {
  return null;
}
export function hasProEntitlement(_info: CustomerInfo | null): boolean {
  return false;
}
export async function purchasePackage(
  _pkg: PurchasesPackage
): Promise<
  | { cancelled: true }
  | { cancelled: false; info: CustomerInfo }
  | { cancelled: false; info: null; error: string }
> {
  return { cancelled: false, info: null, error: "billing_unavailable" };
}
export async function restorePurchases(): Promise<CustomerInfo | null> {
  return null;
}
