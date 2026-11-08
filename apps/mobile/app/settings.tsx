import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { api } from "@/lib/api";
import { useAuth } from "@/auth/AuthContext";
import { useEntitlement } from "@/lib/EntitlementContext";
import {
  MenuRow,
  RowLink,
  settingsStyles,
} from "@/components/SettingsAtoms";
import { colors, font, radius, spacing } from "@/lib/theme";

type Deleting = "idle" | "deleting";

/**
 * Settings — a clean menu list. All category content lives on dedicated
 * sub-screens (/account, /subscription, /connections, /notifications-
 * settings, /ramadan, /cycle-settings, /invite, /follow-us, /legal).
 *
 * The only logic kept on this page is the account-level destructive
 * flow (log out + delete), because:
 *   - Log out needs signOut from AuthContext + router.replace
 *   - Delete requires a two-step confirmation (warning Alert → type
 *     DELETE to confirm Alert.prompt) and lives at the bottom of
 *     settings as the "do you really want this" destination
 */
export default function Settings() {
  const { signOut } = useAuth();
  const { ent } = useEntitlement();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [deleting, setDeleting] = useState<Deleting>("idle");

  const doDelete = async () => {
    setDeleting("deleting");
    try {
      await api("/api/account/delete", { method: "POST" });
    } catch (e) {
      Alert.alert(
        isArabic ? "تعذّر الحذف" : "Delete failed",
        (e as Error).message
      );
      setDeleting("idle");
      return;
    }
    await signOut();
    router.replace("/login");
  };

  const confirmDelete = () => {
    // Step 1: warn + describe what's lost. Step 2 (only if they
    // proceed) requires typing DELETE to confirm — guards against
    // misclicks.
    Alert.alert(
      isArabic ? "احذف الحساب؟" : "Delete account?",
      isArabic
        ? "سيمحو هذا كل شيء نهائياً — الملف الشخصي، السجلات، التمارين، الصور، والاشتراك. لا يمكن التراجع."
        : "This permanently erases everything — your profile, logs, workouts, photos, and subscription. This action cannot be undone.",
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: isArabic ? "متابعة" : "Continue",
          style: "destructive",
          onPress: () => {
            Alert.prompt(
              isArabic ? "اكتب DELETE للتأكيد" : "Type DELETE to confirm",
              isArabic
                ? "هذه آخر فرصة للإلغاء. اكتب كلمة DELETE بالضبط."
                : "This is your last chance to cancel. Type DELETE exactly.",
              [
                { text: t("common.cancel"), style: "cancel" },
                {
                  text: isArabic ? "احذف نهائياً" : "Delete forever",
                  style: "destructive",
                  onPress: (input) => {
                    if ((input ?? "").trim().toUpperCase() === "DELETE") {
                      doDelete();
                    } else {
                      Alert.alert(
                        isArabic ? "لم يتم الحذف" : "Not deleted",
                        isArabic
                          ? "لم تكتب DELETE بشكل صحيح. حسابك آمن."
                          : "You didn't type DELETE. Your account is safe."
                      );
                    }
                  },
                },
              ],
              "plain-text",
              ""
            );
          },
        },
      ]
    );
  };

  return (
    <Screen>
      <View style={settingsStyles.head}>
        <BackButton />
      </View>
      <Text style={settingsStyles.title}>
        {isArabic ? "الإعدادات" : "Settings"}
      </Text>

      {/* Primary categories — Account + money + sync + notifications. */}
      <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
        <View style={settingsStyles.card}>
          <MenuRow
            icon="person-outline"
            label={isArabic ? "الحساب" : "Account"}
            onPress={() => router.push("/account" as never)}
          />
          <MenuRow
            icon="sparkles-outline"
            label={isArabic ? "الاشتراك" : "Subscription"}
            value={ent.is_pro ? "Pro" : isArabic ? "مجاني" : "Free"}
            onPress={() => router.push("/subscription" as never)}
          />
          <MenuRow
            icon="link-outline"
            label={isArabic ? "الاتصالات" : "Connections"}
            onPress={() => router.push("/connections" as never)}
          />
          <MenuRow
            icon="notifications-outline"
            label={isArabic ? "الإشعارات" : "Notifications"}
            onPress={() => router.push("/notifications-settings" as never)}
            last
          />
        </View>
      </View>

      {/* Lifestyle — mode-based features (Ramadan, cycle tracking) and
       * the referral loop. Grouped together because they're opt-in
       * personal context the user turns on/off. */}
      <View style={{ marginTop: spacing.lg, gap: spacing.xs }}>
        <View style={settingsStyles.card}>
          <MenuRow
            icon="moon-outline"
            label={isArabic ? "وضع رمضان" : "Ramadan mode"}
            onPress={() => router.push("/ramadan" as never)}
          />
          <MenuRow
            icon="heart-circle-outline"
            label={isArabic ? "الدورة الشهرية" : "Cycle tracking"}
            onPress={() => router.push("/cycle-settings" as never)}
          />
          <MenuRow
            icon="gift-outline"
            label={isArabic ? "ادعُ الأصدقاء" : "Invite friends"}
            onPress={() => router.push("/invite" as never)}
            last
          />
        </View>
      </View>

      {/* Marketing + legal — static links that rarely change. */}
      <View style={{ marginTop: spacing.lg, gap: spacing.xs }}>
        <View style={settingsStyles.card}>
          <MenuRow
            icon="logo-instagram"
            label={isArabic ? "تابعنا" : "Follow us"}
            onPress={() => router.push("/follow-us" as never)}
          />
          <MenuRow
            icon="document-text-outline"
            label={isArabic ? "قانوني" : "Legal"}
            onPress={() => router.push("/legal" as never)}
            last
          />
        </View>
      </View>

      {/* Log out — separate card. Common action, not destructive.
       * Visually distinct card + spacing from the Delete card below
       * so a user tapping "sign out" doesn't accidentally hit delete. */}
      <View style={{ marginTop: spacing.xl, gap: spacing.xs }}>
        <View style={settingsStyles.card}>
          <RowLink
            label={t("common.sign_out")}
            onPress={async () => {
              await signOut();
              router.replace("/landing");
            }}
          />
        </View>
      </View>

      {/* Delete account — fully separated. Extra top margin + a two-
       * step confirmation requiring the user to type DELETE. Impossible
       * to trigger by accident. */}
      <View style={{ marginTop: spacing.xl, gap: spacing.xs }}>
        <View style={settingsStyles.card}>
          <Pressable
            onPress={confirmDelete}
            disabled={deleting === "deleting"}
            style={[styles.dangerBtn, deleting === "deleting" && { opacity: 0.5 }]}
            accessibilityRole="button"
            accessibilityLabel={isArabic ? "احذف حسابي" : "Delete my account"}
            accessibilityHint={
              isArabic
                ? "يمسح حسابك وكل بياناتك نهائياً"
                : "Permanently erases your account and all data"
            }
          >
            <Text style={styles.dangerLabel}>
              {deleting === "deleting"
                ? isArabic
                  ? "جارٍ الحذف…"
                  : "Deleting…"
                : isArabic
                  ? "احذف حسابي"
                  : "Delete my account"}
            </Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.foot}>SE7A · v0.1.0</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dangerBtn: {
    paddingVertical: spacing.md,
    alignItems: "center",
    borderRadius: radius.md,
  },
  dangerLabel: {
    fontFamily: font.displayBold,
    fontSize: 14,
    color: colors.coral,
  },
  foot: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
    textAlign: "center",
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
});
