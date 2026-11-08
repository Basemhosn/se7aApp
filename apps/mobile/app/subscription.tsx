import { useState } from "react";
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { useEntitlement } from "@/lib/EntitlementContext";
import { restorePurchases, hasProEntitlement } from "@/lib/rc";
import { Info, RowLink, settingsStyles } from "@/components/SettingsAtoms";
import { colors, font, radius, spacing } from "@/lib/theme";

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/**
 * Subscription sub-screen. Shows plan, status, renewal date + manage
 * link for Pro users; shows the Pro upsell hero + Restore purchases
 * for free users. All state comes from EntitlementContext; no new
 * fetches needed.
 */
export default function SubscriptionScreen() {
  const { ent, refresh: refreshEnt } = useEntitlement();
  const { i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [restoring, setRestoring] = useState(false);

  const manageSubscription = () => {
    Linking.openURL(
      Platform.OS === "ios"
        ? "https://apps.apple.com/account/subscriptions"
        : "https://play.google.com/store/account/subscriptions"
    );
  };

  const doRestore = async () => {
    setRestoring(true);
    const info = await restorePurchases();
    setRestoring(false);
    if (hasProEntitlement(info)) {
      await refreshEnt();
      Alert.alert(
        isArabic ? "تم" : "Restored",
        isArabic ? "أنت على Pro." : "You're on Pro."
      );
    } else {
      Alert.alert(
        isArabic ? "لا توجد مشتريات" : "No purchases found",
        isArabic
          ? "جرّب التسجيل بنفس حساب Apple الذي اشتريت به."
          : "Sign in with the Apple ID you used for the original purchase."
      );
    }
  };

  return (
    <Screen>
      <View style={settingsStyles.head}>
        <BackButton />
      </View>
      <Text style={settingsStyles.title}>
        {isArabic ? "الاشتراك" : "Subscription"}
      </Text>
      <View style={settingsStyles.card}>
        {ent.is_pro ? (
          <>
            <Info
              label={isArabic ? "الخطة" : "Plan"}
              value={
                ent.product_id?.includes("annual")
                  ? isArabic
                    ? "Pro سنوي"
                    : "Pro Annual"
                  : ent.product_id?.includes("monthly")
                    ? isArabic
                      ? "Pro شهري"
                      : "Pro Monthly"
                    : "Pro"
              }
            />
            <Info label={isArabic ? "الحالة" : "Status"} value={ent.status} />
            {ent.expires_at && (
              <Info
                label={
                  ent.will_renew
                    ? isArabic
                      ? "يتجدد"
                      : "Renews"
                    : isArabic
                      ? "ينتهي"
                      : "Expires"
                }
                value={shortDate(ent.expires_at)}
              />
            )}
            <RowLink
              label={isArabic ? "إدارة الاشتراك" : "Manage subscription"}
              onPress={manageSubscription}
              external
            />
          </>
        ) : (
          <>
            <View style={styles.proHero}>
              <Text style={styles.proKicker}>SE7A · PRO</Text>
              <Text style={styles.proBody}>
                {isArabic
                  ? "افتح خطط الوجبات، مسح القوائم، تحليل الجسم، وكوتش الذكاء الاصطناعي."
                  : "Unlock meal plans, menu scans, body composition, and AI coach."}
              </Text>
              <Pressable
                onPress={() => router.push("/paywall")}
                style={styles.proBtn}
              >
                <Text style={styles.proBtnLabel}>
                  {isArabic ? "افتح Pro" : "Unlock Pro"}
                </Text>
              </Pressable>
            </View>
            <Pressable
              onPress={doRestore}
              disabled={restoring}
              style={styles.row}
            >
              <Text style={styles.rowLabel}>
                {restoring
                  ? isArabic
                    ? "جارٍ الاسترجاع…"
                    : "Restoring…"
                  : isArabic
                    ? "استرجع مشترياتي"
                    : "Restore purchases"}
              </Text>
              <Ionicons name="refresh" size={16} color={colors.dim} />
            </Pressable>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  proHero: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  proKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.gold,
  },
  proBody: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
  },
  proBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingVertical: 12,
    alignItems: "center",
  },
  proBtnLabel: {
    fontFamily: font.displayBold,
    fontSize: 14,
    color: colors.bg,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  rowLabel: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.ink,
  },
});
