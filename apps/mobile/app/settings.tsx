import { useCallback, useEffect, useState } from "react";
import { Switch } from "react-native";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { api } from "@/lib/api";
import { useAuth } from "@/auth/AuthContext";
import { useReferral } from "@/lib/useReferral";
import { useEntitlement } from "@/lib/EntitlementContext";
import { restorePurchases, hasProEntitlement } from "@/lib/rc";
import { colors, font, radius, spacing } from "@/lib/theme";

const WEB_BASE = "https://se7a.vercel.app";

type Deleting = "idle" | "confirming" | "typing" | "deleting";

interface NotificationPrefs {
  streak_at_risk?: boolean;
  lunch_nudge?: boolean;
  weigh_in?: boolean;
  pr_celebration?: boolean;
  plan_your_week?: boolean;
  weekly_recap?: boolean;
}

interface Integration {
  provider: "strava" | "whoop" | "oura" | "fitbit";
  provider_user_id: string | null;
  connected_at: string;
  last_sync_at: string | null;
}

export default function Settings() {
  const { user, signOut } = useAuth();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [deleting, setDeleting] = useState<Deleting>("idle");
  const [restoring, setRestoring] = useState(false);
  const { stats: referral } = useReferral(user?.id);
  const { ent, refresh: refreshEnt } = useEntitlement();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [stravaBusy, setStravaBusy] = useState<"idle" | "connecting" | "syncing">(
    "idle"
  );

  useEffect(() => {
    api<{ notification_prefs: NotificationPrefs }>("/api/profile/prefs")
      .then((r) => setPrefs(r.notification_prefs ?? {}))
      .catch(() => setPrefs({}));
    api<{ integrations: Integration[] }>("/api/integrations")
      .then((r) => setIntegrations(r.integrations))
      .catch(() => setIntegrations([]));
  }, []);

  const strava = integrations.find((i) => i.provider === "strava");

  const connectStrava = useCallback(async () => {
    setStravaBusy("connecting");
    try {
      const { url } = await api<{ url: string }>(
        "/api/integrations/strava/start",
        { method: "POST" }
      );
      const result = await WebBrowser.openAuthSessionAsync(
        url,
        "se7a://strava-connected"
      );
      if (result.type === "success") {
        // Refresh state; also kick off a first sync so activities land immediately.
        const listRes = await api<{ integrations: Integration[] }>(
          "/api/integrations"
        ).catch(() => null);
        if (listRes) setIntegrations(listRes.integrations);
        try {
          await api("/api/integrations/strava/sync", { method: "POST" });
        } catch {
          /* sync failure is non-blocking; user can tap Sync now */
        }
      }
    } catch (e) {
      Alert.alert(
        isArabic ? "تعذّر الاتصال" : "Couldn't connect",
        (e as Error).message
      );
    }
    setStravaBusy("idle");
  }, [isArabic]);

  const syncStrava = useCallback(async () => {
    setStravaBusy("syncing");
    try {
      const res = await api<{
        inserted: number;
        skipped: number;
        error?: string;
      }>("/api/integrations/strava/sync", { method: "POST" });
      const listRes = await api<{ integrations: Integration[] }>(
        "/api/integrations"
      ).catch(() => null);
      if (listRes) setIntegrations(listRes.integrations);
      if (res.error) {
        Alert.alert(isArabic ? "خطأ" : "Sync error", res.error);
      } else {
        Alert.alert(
          isArabic ? "تم" : "Synced",
          isArabic
            ? `تم استيراد ${res.inserted} نشاط.`
            : `Imported ${res.inserted} activit${res.inserted === 1 ? "y" : "ies"}.`
        );
      }
    } catch (e) {
      Alert.alert(
        isArabic ? "خطأ" : "Sync error",
        (e as Error).message
      );
    }
    setStravaBusy("idle");
  }, [isArabic]);

  const disconnectStrava = useCallback(() => {
    Alert.alert(
      isArabic ? "قطع الاتصال مع Strava؟" : "Disconnect Strava?",
      isArabic
        ? "لن نستورد أي أنشطة جديدة. النشاطات المستوردة سابقاً تبقى."
        : "We'll stop importing new activities. Previously imported ones stay.",
      [
        { text: isArabic ? "إلغاء" : "Cancel", style: "cancel" },
        {
          text: isArabic ? "اقطع" : "Disconnect",
          style: "destructive",
          onPress: async () => {
            try {
              await api("/api/integrations/strava", { method: "DELETE" });
              setIntegrations((prev) =>
                prev.filter((i) => i.provider !== "strava")
              );
            } catch (e) {
              Alert.alert(
                isArabic ? "فشل" : "Failed",
                (e as Error).message
              );
            }
          },
        },
      ]
    );
  }, [isArabic]);

  const togglePref = useCallback(
    async (key: keyof NotificationPrefs, value: boolean) => {
      setPrefs((prev) => ({ ...(prev ?? {}), [key]: value }));
      try {
        await api("/api/profile/prefs", {
          method: "POST",
          body: JSON.stringify({ notification_prefs: { [key]: value } }),
        });
      } catch {
        // Revert on failure.
        setPrefs((prev) => ({ ...(prev ?? {}), [key]: !value }));
      }
    },
    []
  );

  const shareLink = async () => {
    if (!referral?.link) return;
    try {
      await Share.share({
        message: isArabic
          ? `انضم إلى SE7A — مدرب غذائي ولياقة بالذكاء الاصطناعي. ${referral.link}`
          : `Try SE7A — AI food + fitness coach for the Gulf. ${referral.link}`,
        url: referral.link,
      });
    } catch {
      /* user cancelled */
    }
  };

  const copyLink = async () => {
    if (!referral?.link) return;
    await Clipboard.setStringAsync(referral.link);
    Alert.alert(isArabic ? "تم النسخ" : "Copied", referral.link);
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
        isArabic ? "لا شيء لاسترجاعه" : "Nothing to restore",
        isArabic
          ? "لم نجد اشتراكاً نشطاً لحسابك."
          : "No active subscription found for this account."
      );
    }
  };

  const manageSubscription = () => {
    Linking.openURL(
      Platform.OS === "ios"
        ? "https://apps.apple.com/account/subscriptions"
        : "https://play.google.com/store/account/subscriptions"
    );
  };

  const openTerms = () => Linking.openURL(`${WEB_BASE}/terms`);
  const openPrivacy = () => Linking.openURL(`${WEB_BASE}/privacy`);
  const openSupport = () =>
    Linking.openURL("mailto:hello@se7a.app?subject=SE7A%20support");

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
    Alert.alert(
      isArabic ? "احذف الحساب؟" : "Delete account?",
      isArabic
        ? "سيمحو هذا كل شيء — الملف الشخصي، السجلات، التمارين، الصور. لا يمكن التراجع."
        : "This erases everything — profile, logs, workouts, photos. Can't be undone.",
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: isArabic ? "احذف نهائياً" : "Delete forever",
          style: "destructive",
          onPress: doDelete,
        },
      ]
    );
  };

  return (
    <Screen>
      <View style={styles.head}>
        <BackButton />
      </View>
      <Text style={styles.title}>{isArabic ? "الإعدادات" : "Settings"}</Text>

      <Section title={isArabic ? "الحساب" : "Account"}>
        <Info label={isArabic ? "البريد" : "Email"} value={user?.email ?? "—"} />
        <RowLink
          label={t("home.change_my_plan")}
          onPress={() => router.push("/onboarding")}
        />
        <RowLink
          label={t("language.title")}
          value={isArabic ? "العربية" : "English"}
          onPress={() => router.push("/language")}
        />
      </Section>

      <Section title={isArabic ? "الاشتراك" : "Subscription"}>
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
            <Info
              label={isArabic ? "الحالة" : "Status"}
              value={ent.status}
            />
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
              <Ionicons
                name="refresh"
                size={16}
                color={colors.dim}
              />
            </Pressable>
          </>
        )}
      </Section>

      <Section title={isArabic ? "التكاملات" : "Integrations"}>
        {strava ? (
          <>
            <View style={styles.integRow}>
              <View style={styles.integIcon}>
                <Ionicons name="bicycle" size={20} color="#fc4c02" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.integTitle}>Strava</Text>
                <Text style={styles.integMeta}>
                  {isArabic ? "متصل" : "Connected"}
                  {strava.last_sync_at
                    ? ` · ${isArabic ? "آخر مزامنة" : "last sync"} ${shortAgo(strava.last_sync_at)}`
                    : ""}
                </Text>
              </View>
              <Pressable
                onPress={syncStrava}
                disabled={stravaBusy !== "idle"}
                hitSlop={8}
                style={styles.integSyncBtn}
              >
                <Ionicons
                  name="refresh"
                  size={16}
                  color={stravaBusy === "syncing" ? colors.dim : colors.gold}
                />
              </Pressable>
            </View>
            <Pressable
              onPress={disconnectStrava}
              style={[styles.row, { borderBottomWidth: 0 }]}
            >
              <Text style={[styles.rowLabel, { color: colors.coral }]}>
                {isArabic ? "اقطع الاتصال" : "Disconnect Strava"}
              </Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={connectStrava}
            disabled={stravaBusy !== "idle"}
            style={styles.integRow}
          >
            <View style={styles.integIcon}>
              <Ionicons name="bicycle-outline" size={20} color="#fc4c02" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.integTitle}>Strava</Text>
              <Text style={styles.integMeta}>
                {isArabic
                  ? "اربط لاستيراد الجري والدراجة تلقائياً."
                  : "Auto-import runs, rides, and other activities."}
              </Text>
            </View>
            <Text style={styles.integConnect}>
              {stravaBusy === "connecting"
                ? isArabic
                  ? "…"
                  : "…"
                : isArabic
                  ? "اربط"
                  : "Connect"}
            </Text>
          </Pressable>
        )}
      </Section>

      {prefs && (
        <Section title={isArabic ? "الإشعارات" : "Notifications"}>
          <PrefRow
            label={isArabic ? "خطر انكسار السلسلة" : "Streak at risk"}
            hint={isArabic ? "٨ مساءً إذا لم تسجل شيء" : "8 pm if you haven't logged"}
            value={prefs.streak_at_risk !== false}
            onChange={(v) => togglePref("streak_at_risk", v)}
          />
          <PrefRow
            label={isArabic ? "تنبيه الغداء" : "Lunch nudge"}
            hint={isArabic ? "١ ظهراً" : "1 pm reminder"}
            value={prefs.lunch_nudge !== false}
            onChange={(v) => togglePref("lunch_nudge", v)}
          />
          <PrefRow
            label={isArabic ? "الوزن الأسبوعي" : "Weekly weigh-in"}
            hint={isArabic ? "صباح الاثنين" : "Monday morning"}
            value={prefs.weigh_in !== false}
            onChange={(v) => togglePref("weigh_in", v)}
          />
          <PrefRow
            label={isArabic ? "احتفال PR" : "PR celebration"}
            hint={isArabic ? "بعد التمرين مباشرة" : "Right after a workout"}
            value={prefs.pr_celebration !== false}
            onChange={(v) => togglePref("pr_celebration", v)}
          />
          <PrefRow
            label={isArabic ? "خطة الأسبوع (Pro)" : "Plan your week (Pro)"}
            hint={isArabic ? "صباح الأحد" : "Sunday morning"}
            value={prefs.plan_your_week !== false}
            onChange={(v) => togglePref("plan_your_week", v)}
          />
          <PrefRow
            label={isArabic ? "التلخيص الأسبوعي" : "Weekly recap"}
            hint={isArabic ? "صباح الأحد" : "Sunday morning"}
            value={prefs.weekly_recap !== false}
            onChange={(v) => togglePref("weekly_recap", v)}
            last
          />
        </Section>
      )}

      {referral && (
        <Section title={isArabic ? "ادعُ صديقًا" : "Invite a friend"}>
          <View style={styles.inviteBody}>
            <Text style={styles.inviteCount}>
              {referral.referred_count === 0
                ? isArabic
                  ? "لم ينضم أحد بعد."
                  : "No one has joined yet."
                : isArabic
                  ? `انضم ${referral.referred_count} عبر رابطك`
                  : `${referral.referred_count} joined via your link`}
            </Text>
            <Text style={styles.inviteLink}>{referral.link}</Text>
            <View style={styles.inviteRow}>
              <Pressable onPress={shareLink} style={styles.invitePrimary}>
                <Ionicons name="share-outline" size={16} color={colors.bg} />
                <Text style={styles.invitePrimaryLabel}>
                  {isArabic ? "شارك" : "Share"}
                </Text>
              </Pressable>
              <Pressable onPress={copyLink} style={styles.inviteSecondary}>
                <Ionicons
                  name="copy-outline"
                  size={16}
                  color={colors.ink}
                />
                <Text style={styles.inviteSecondaryLabel}>
                  {isArabic ? "انسخ" : "Copy"}
                </Text>
              </Pressable>
            </View>
          </View>
        </Section>
      )}

      <View style={styles.safetyCard}>
        <Text style={styles.safetyKicker}>
          {isArabic ? "ملاحظة أمان" : "SAFETY"}
        </Text>
        <Text style={styles.safetyBody}>
          {isArabic
            ? "SE7A أداة تتبع وتدريب — ليس جهازًا طبيًا. النطاقات تقديرات لا تشخيصات. لو عندك حالة طبية، حامل، أو تاريخ اضطراب أكل — استشيري طبيبك قبل أي تغيير كبير في النظام أو التمرين."
            : "SE7A is a tracking and coaching tool — not a medical device. Ranges are estimates, not diagnoses. If you have a medical condition, are pregnant, or have a history of disordered eating, talk to your doctor before any significant change in diet or training."}
        </Text>
      </View>

      <Section title={isArabic ? "قانوني" : "Legal"}>
        <RowLink
          label={isArabic ? "الشروط والأحكام" : "Terms of Service"}
          onPress={openTerms}
          external
        />
        <RowLink
          label={isArabic ? "سياسة الخصوصية" : "Privacy Policy"}
          onPress={openPrivacy}
          external
        />
        <RowLink
          label={isArabic ? "الدعم" : "Support"}
          value="hello@se7a.app"
          onPress={openSupport}
          external
        />
      </Section>

      <Section title={isArabic ? "المنطقة الخطرة" : "Danger zone"} tint={colors.coral}>
        <RowLink
          label={t("common.sign_out")}
          onPress={signOut}
        />
        <Pressable
          onPress={confirmDelete}
          disabled={deleting === "deleting"}
          style={[styles.dangerBtn, deleting === "deleting" && { opacity: 0.5 }]}
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
      </Section>

      <Text style={styles.foot}>SE7A · v0.1.0</Text>
    </Screen>
  );
}

function Section({
  title,
  tint,
  children,
}: {
  title: string;
  tint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[styles.sectionH, tint ? { color: tint } : null]}>
        {title.toUpperCase()}
      </Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function PrefRow({
  label,
  hint,
  value,
  onChange,
  last,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.row,
        last && { borderBottomWidth: 0 },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.gold, false: colors.line }}
        thumbColor={colors.ink}
      />
    </View>
  );
}

function RowLink({
  label,
  value,
  onPress,
  external,
}: {
  label: string;
  value?: string;
  onPress: () => void;
  external?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {value && <Text style={styles.rowValue}>{value}</Text>}
        <Ionicons
          name={external ? "open-outline" : "chevron-forward"}
          size={16}
          color={colors.dim}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { marginTop: spacing.sm },
  title: {
    fontFamily: font.displayBold,
    fontSize: 32,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  sectionH: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.4,
    marginTop: spacing.md,
  },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowLabel: {
    fontFamily: font.body,
    fontSize: 15,
    color: colors.ink,
  },
  rowValue: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
  },
  dangerBtn: {
    padding: spacing.md,
    alignItems: "center",
  },
  dangerLabel: {
    fontFamily: font.displayBold,
    fontSize: 15,
    color: colors.coral,
  },
  foot: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    textAlign: "center",
    marginTop: spacing.xl,
  },
  inviteBody: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  inviteCount: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
  },
  inviteLink: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.gold,
  },
  inviteRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  invitePrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.sm,
    backgroundColor: colors.gold,
    borderRadius: radius.md,
  },
  invitePrimaryLabel: {
    fontFamily: font.displayBold,
    fontSize: 14,
    color: colors.bg,
  },
  inviteSecondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  inviteSecondaryLabel: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.ink,
  },
  safetyCard: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 3,
    borderLeftColor: colors.coral,
    borderRadius: radius.md,
    gap: 6,
  },
  safetyKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.coral,
    letterSpacing: 1.4,
  },
  safetyBody: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    lineHeight: 19,
  },
  proHero: {
    padding: spacing.md,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  proKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  proBody: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    lineHeight: 19,
  },
  proBtn: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  proBtnLabel: {
    fontFamily: font.displayBold,
    fontSize: 13,
    color: colors.bg,
    letterSpacing: 0.5,
  },
  integRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  integIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  integTitle: {
    fontFamily: font.displayBold,
    fontSize: 15,
    color: colors.ink,
  },
  integMeta: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    marginTop: 2,
  },
  integConnect: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.2,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.pill,
    backgroundColor: "rgba(246,183,60,0.10)",
  },
  integSyncBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
});

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function shortAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
