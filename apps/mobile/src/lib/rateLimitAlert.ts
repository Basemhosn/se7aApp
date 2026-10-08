import { Alert } from "react-native";
import { router } from "expo-router";
import { rateLimitMessage, type RateLimitedError } from "./api";

/**
 * Shared rate-limit alert. Replaces scattered `Alert.alert(title, body)`
 * sites so every feature uses the same copy + the same upgrade-path
 * action — the daily-limit case is the single highest-intent
 * conversion moment in the app, so we offer "Upgrade" inline instead
 * of letting the user dismiss and churn.
 *
 * - Burst (5 req / 60s): no upgrade CTA, it's a double-tap guard that
 *   catches Pro users too. Just the "wait a minute" copy.
 * - Daily (5 req / 24h) + user is NOT pro: offer "Upgrade" button that
 *   routes to the paywall with the given feature param so copy is
 *   tailored.
 * - Daily + user IS pro: shouldn't happen in practice (Pro cap is 10k),
 *   but if it does, show the generic message with no upgrade CTA.
 */
export function showRateLimitAlert(
  err: RateLimitedError,
  opts: {
    isArabic: boolean;
    isPro: boolean;
    paywallFeature?: string;
  }
): void {
  const { title, body } = rateLimitMessage(err);

  const buttons: Array<{
    text: string;
    style?: "cancel" | "default" | "destructive";
    onPress?: () => void;
  }> = [];

  const canUpgrade = err.kind === "daily" && !opts.isPro;
  if (canUpgrade) {
    buttons.push({
      text: opts.isArabic ? "لاحقاً" : "Later",
      style: "cancel",
    });
    buttons.push({
      text: opts.isArabic ? "ترقية إلى Pro" : "Upgrade",
      onPress: () =>
        router.push({
          pathname: "/paywall",
          params: opts.paywallFeature ? { feature: opts.paywallFeature } : {},
        }),
    });
  } else {
    buttons.push({ text: opts.isArabic ? "حسناً" : "OK" });
  }

  Alert.alert(title, body, buttons);
}
