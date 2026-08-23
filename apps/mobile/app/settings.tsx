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
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { openHealthConnectSettings } from "react-native-health-connect";
import { requestHealthKitAuth } from "@/lib/healthkit";
import { requestHealthConnectAuth } from "@/lib/healthConnect";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { api } from "@/lib/api";
import type { RamadanStatus } from "@/lib/useRamadan";
import { rescheduleRamadanReminders } from "@/lib/ramadanScheduler";
import { useAuth } from "@/auth/AuthContext";
import { useReferral } from "@/lib/useReferral";
import { useEntitlement } from "@/lib/EntitlementContext";
import { restorePurchases, hasProEntitlement } from "@/lib/rc";
import { colors, font, radius, spacing } from "@/lib/theme";

const WEB_BASE = "https://se7a.vercel.app";
const HEALTH_CONNECTED_KEY = "se7a_health_connected";

// Strava integration is fully implemented but hidden from the UI while
// Strava's Nov 2024 API terms require a paid Enterprise contract for
// consumer apps. Flip to true once we're on the paid tier or Strava's
// terms change. All server routes + sync logic in lib/strava.ts and
// app/api/integrations/strava/* stay in place.
const STRAVA_ENABLED = false;

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
  const [busy, setBusy] = useState<
    Partial<Record<Integration["provider"], "connecting" | "syncing">>
  >({});

  useEffect(() => {
    api<{ notification_prefs: NotificationPrefs }>("/api/profile/prefs")
      .then((r) => setPrefs(r.notification_prefs ?? {}))
      .catch(() => setPrefs({}));
    api<{ integrations: Integration[] }>("/api/integrations")
      .then((r) => setIntegrations(r.integrations))
      .catch(() => setIntegrations([]));
  }, []);

  const strava = integrations.find((i) => i.provider === "strava");
  const whoop = integrations.find((i) => i.provider === "whoop");
  const oura = integrations.find((i) => i.provider === "oura");

  const refreshIntegrations = useCallback(async () => {
    const listRes = await api<{ integrations: Integration[] }>(
      "/api/integrations"
    ).catch(() => null);
    if (listRes) setIntegrations(listRes.integrations);
  }, []);

  const setProviderBusy = (
    provider: Integration["provider"],
    state: "connecting" | "syncing" | null
  ) => {
    setBusy((b) => {
      const next = { ...b };
      if (state) next[provider] = state;
      else delete next[provider];
      return next;
    });
  };

  const connect = useCallback(
    async (provider: Integration["provider"], returnUrl: string) => {
      setProviderBusy(provider, "connecting");
      try {
        const { url } = await api<{ url: string }>(
          `/api/integrations/${provider}/start`,
          { method: "POST" }
        );
        const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);
        if (result.type === "success") {
          await refreshIntegrations();
          try {
            await api(`/api/integrations/${provider}/sync`, { method: "POST" });
            await refreshIntegrations();
          } catch {
            /* sync failure non-blocking; user can tap Sync now */
          }
        }
      } catch (e) {
        Alert.alert(
          isArabic ? "تعذّر الاتصال" : "Couldn't connect",
          (e as Error).message
        );
      }
      setProviderBusy(provider, null);
    },
    [isArabic, refreshIntegrations]
  );

  const sync = useCallback(
    async (provider: Integration["provider"]) => {
      setProviderBusy(provider, "syncing");
      try {
        const res = await api<{
          inserted?: number;
          workouts_inserted?: number;
          error?: string;
        }>(`/api/integrations/${provider}/sync`, { method: "POST" });
        await refreshIntegrations();
        if (res.error) {
          Alert.alert(isArabic ? "خطأ" : "Sync error", res.error);
        } else {
          const count = res.inserted ?? res.workouts_inserted ?? 0;
          Alert.alert(
            isArabic ? "تم" : "Synced",
            isArabic
              ? `تم استيراد ${count} نشاط.`
              : `Imported ${count} activit${count === 1 ? "y" : "ies"}.`
          );
        }
      } catch (e) {
        Alert.alert(
          isArabic ? "خطأ" : "Sync error",
          (e as Error).message
        );
      }
      setProviderBusy(provider, null);
    },
    [isArabic, refreshIntegrations]
  );

  const disconnect = useCallback(
    (provider: Integration["provider"], displayName: string) => {
      Alert.alert(
        isArabic ? `قطع الاتصال مع ${displayName}؟` : `Disconnect ${displayName}?`,
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
                await api(`/api/integrations/${provider}`, {
                  method: "DELETE",
                });
                setIntegrations((prev) =>
                  prev.filter((i) => i.provider !== provider)
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
    },
    [isArabic]
  );

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
        <HealthRow isArabic={isArabic} />
        {STRAVA_ENABLED && (
          <IntegrationRow
            provider="strava"
            displayName="Strava"
            brandColor="#fc4c02"
            iconConnected="bicycle"
            iconDisconnected="bicycle-outline"
            connectedLabel={isArabic ? "متصل" : "Connected"}
            disconnectedBlurb={
              isArabic
                ? "اربط لاستيراد الجري والدراجة تلقائياً."
                : "Auto-import runs, rides, and other activities."
            }
            integration={strava}
            busy={busy.strava}
            onConnect={() => connect("strava", "se7a://strava-connected")}
            onSync={() => sync("strava")}
            onDisconnect={() => disconnect("strava", "Strava")}
            isArabic={isArabic}
          />
        )}
        <IntegrationRow
          provider="whoop"
          displayName="Whoop"
          brandColor="#5a5a5a"
          iconConnected="heart"
          iconDisconnected="heart-outline"
          connectedLabel={isArabic ? "متصل" : "Connected"}
          disconnectedBlurb={
            isArabic
              ? "اربط لاستيراد التمارين والسعرات النشطة اليومية."
              : "Auto-import workouts + daily active calories."
          }
          integration={whoop}
          busy={busy.whoop}
          onConnect={() => connect("whoop", "se7a://whoop-connected")}
          onSync={() => sync("whoop")}
          onDisconnect={() => disconnect("whoop", "Whoop")}
          isArabic={isArabic}
        />
        <IntegrationRow
          provider="oura"
          displayName="Oura"
          brandColor="#7b6ef6"
          iconConnected="ellipse"
          iconDisconnected="ellipse-outline"
          connectedLabel={isArabic ? "متصل" : "Connected"}
          disconnectedBlurb={
            isArabic
              ? "اربط لاستيراد التمارين والخطوات والسعرات النشطة."
              : "Auto-import workouts, steps, and active calories."
          }
          integration={oura}
          busy={busy.oura}
          onConnect={() => connect("oura", "se7a://oura-connected")}
          onSync={() => sync("oura")}
          onDisconnect={() => disconnect("oura", "Oura")}
          isArabic={isArabic}
          last
        />
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

      <Section title={isArabic ? "رمضان" : "Ramadan"}>
        <RamadanSettings isArabic={isArabic} />
      </Section>

      <Section title={isArabic ? "الدورة الشهرية" : "Cycle"}>
        <CycleSettings isArabic={isArabic} />
      </Section>

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

interface RamadanPrefsShape {
  auto_detect: boolean;
  enabled_override: boolean | null;
  fajr_time: string;
  maghrib_time: string;
  suhoor_reminder: boolean;
  iftar_reminder: boolean;
}

function RamadanSettings({ isArabic }: { isArabic: boolean }) {
  const [status, setStatus] = useState<RamadanStatus | null>(null);
  const [savingCity, setSavingCity] = useState(false);

  const reload = useCallback(() => {
    api<RamadanStatus>("/api/ramadan/status")
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const saveCityCountry = useCallback(
    async (patch: { city?: string | null; country?: string | null }) => {
      setSavingCity(true);
      try {
        await api("/api/profile/prefs", {
          method: "POST",
          body: JSON.stringify(patch),
        });
        reload();
      } catch {
        /* silent */
      }
      setSavingCity(false);
    },
    [reload]
  );

  const promptCity = () => {
    Alert.prompt(
      isArabic ? "المدينة" : "City",
      isArabic
        ? "اسم المدينة بالإنجليزية (مثلاً Dubai)"
        : "City name (e.g. Dubai, Riyadh)",
      [
        { text: isArabic ? "إلغاء" : "Cancel", style: "cancel" },
        {
          text: isArabic ? "حفظ" : "Save",
          onPress: (val) => {
            const v = (val ?? "").trim();
            saveCityCountry({ city: v || null });
          },
        },
      ],
      "plain-text",
      status?.city ?? ""
    );
  };

  const promptCountry = () => {
    Alert.prompt(
      isArabic ? "الدولة" : "Country",
      isArabic
        ? "اسم الدولة بالإنجليزية (مثلاً United Arab Emirates)"
        : "Country name (e.g. United Arab Emirates)",
      [
        { text: isArabic ? "إلغاء" : "Cancel", style: "cancel" },
        {
          text: isArabic ? "حفظ" : "Save",
          onPress: (val) => {
            const v = (val ?? "").trim();
            saveCityCountry({ country: v || null });
          },
        },
      ],
      "plain-text",
      status?.country ?? ""
    );
  };

  const patch = useCallback(async (p: Partial<RamadanPrefsShape>) => {
    // Optimistic update.
    setStatus((prev) =>
      prev
        ? { ...prev, prefs: { ...prev.prefs, ...p } }
        : prev
    );
    try {
      const res = await api<RamadanStatus>("/api/ramadan/status", {
        method: "POST",
        body: JSON.stringify(p),
      });
      setStatus(res);
      // Re-sync local iftar/suhoor notifications immediately so a toggle
      // flip in Settings takes effect without waiting for the Home tab
      // to re-focus.
      rescheduleRamadanReminders(res).catch(() => {});
    } catch {
      /* revert would be nice; keeping optimistic for simplicity */
    }
  }, []);

  if (!status) {
    return (
      <View style={{ padding: spacing.md }}>
        <Text style={styles.rowValue}>{isArabic ? "…" : "Loading…"}</Text>
      </View>
    );
  }

  const modeText = status.prefs.auto_detect
    ? isArabic
      ? "تلقائي"
      : "Auto"
    : status.prefs.enabled_override
      ? isArabic
        ? "مفعل"
        : "On"
      : isArabic
        ? "مطفأ"
        : "Off";

  const cycleMode = () => {
    // auto → on → off → auto
    if (status.prefs.auto_detect) {
      patch({ auto_detect: false, enabled_override: true });
    } else if (status.prefs.enabled_override) {
      patch({ auto_detect: false, enabled_override: false });
    } else {
      patch({ auto_detect: true, enabled_override: null });
    }
  };

  return (
    <>
      <Pressable onPress={cycleMode} style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>{isArabic ? "الوضع" : "Mode"}</Text>
          <Text style={styles.rowValue}>
            {isArabic
              ? "تلقائي: يشتغل خلال رمضان فقط. مفعل: دايماً. مطفأ: أبداً."
              : "Auto: on during Ramadan only. On: always. Off: never."}
          </Text>
        </View>
        <Text style={[styles.rowValue, { color: colors.gold, fontSize: 13 }]}>
          {modeText}
        </Text>
      </Pressable>
      <Pressable onPress={promptCity} style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>{isArabic ? "المدينة" : "City"}</Text>
          <Text style={styles.rowValue}>
            {isArabic
              ? "لضبط أوقات الفجر والمغرب تلقائياً"
              : "For auto fajr + maghrib times"}
          </Text>
        </View>
        <Text style={[styles.rowValue, { color: colors.gold, fontSize: 13 }]}>
          {savingCity
            ? isArabic
              ? "…"
              : "…"
            : status.city ?? (isArabic ? "غير محدد" : "Not set")}
        </Text>
      </Pressable>
      <Pressable onPress={promptCountry} style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>
            {isArabic ? "الدولة" : "Country"}
          </Text>
          <Text style={styles.rowValue}>
            {isArabic
              ? "الاسم بالإنجليزية (مثلاً UAE)"
              : "English name (e.g. UAE)"}
          </Text>
        </View>
        <Text style={[styles.rowValue, { color: colors.gold, fontSize: 13 }]}>
          {status.country ?? (isArabic ? "غير محدد" : "Not set")}
        </Text>
      </Pressable>
      {status.active && (
        <>
          <View
            style={[
              styles.row,
              { flexDirection: "column", alignItems: "flex-start" },
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.xs,
              }}
            >
              <Text style={styles.rowLabel}>{isArabic ? "الفجر" : "Fajr"}</Text>
              {status.times_source === "aladhan" && (
                <Text style={styles.autoBadge}>
                  {isArabic ? "تلقائي" : "auto"}
                </Text>
              )}
            </View>
            {status.times_source === "aladhan" ? (
              <Text style={[styles.rowValue, { fontSize: 15, marginTop: 4 }]}>
                {status.prefs.fajr_time}
              </Text>
            ) : (
              <TimeField
                value={status.prefs.fajr_time}
                onChange={(v) => patch({ fajr_time: v })}
              />
            )}
          </View>
          <View
            style={[
              styles.row,
              { flexDirection: "column", alignItems: "flex-start" },
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.xs,
              }}
            >
              <Text style={styles.rowLabel}>
                {isArabic ? "المغرب" : "Maghrib"}
              </Text>
              {status.times_source === "aladhan" && (
                <Text style={styles.autoBadge}>
                  {isArabic ? "تلقائي" : "auto"}
                </Text>
              )}
            </View>
            {status.times_source === "aladhan" ? (
              <Text style={[styles.rowValue, { fontSize: 15, marginTop: 4 }]}>
                {status.prefs.maghrib_time}
              </Text>
            ) : (
              <TimeField
                value={status.prefs.maghrib_time}
                onChange={(v) => patch({ maghrib_time: v })}
              />
            )}
          </View>
        </>
      )}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>
            {isArabic ? "تذكير السحور" : "Suhoor reminder"}
          </Text>
          <Text style={styles.rowValue}>
            {isArabic ? "قبل ١٥ دقيقة من الفجر" : "15 min before fajr"}
          </Text>
        </View>
        <Switch
          value={status.prefs.suhoor_reminder}
          onValueChange={(v) => patch({ suhoor_reminder: v })}
          trackColor={{ true: colors.gold, false: colors.line }}
          thumbColor={colors.ink}
        />
      </View>
      <View style={[styles.row, { borderBottomWidth: 0 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>
            {isArabic ? "تذكير الإفطار" : "Iftar reminder"}
          </Text>
          <Text style={styles.rowValue}>
            {isArabic ? "قبل ١٠ دقائق من المغرب" : "10 min before maghrib"}
          </Text>
        </View>
        <Switch
          value={status.prefs.iftar_reminder}
          onValueChange={(v) => patch({ iftar_reminder: v })}
          trackColor={{ true: colors.gold, false: colors.line }}
          thumbColor={colors.ink}
        />
      </View>
    </>
  );
}

interface CyclePrefsShape {
  enabled: boolean;
  avg_cycle_length_days: number;
  avg_period_length_days: number;
  share_with_coach: boolean;
}

function CycleSettings({ isArabic }: { isArabic: boolean }) {
  const [prefs, setPrefs] = useState<CyclePrefsShape | null>(null);

  const load = useCallback(() => {
    api<{ prefs: CyclePrefsShape }>("/api/cycle/status")
      .then((r) => setPrefs(r.prefs))
      .catch(() => setPrefs(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patch = useCallback(
    async (p: Partial<CyclePrefsShape>) => {
      setPrefs((prev) => (prev ? { ...prev, ...p } : prev));
      try {
        const res = await api<{ prefs: CyclePrefsShape }>(
          "/api/cycle/status",
          { method: "POST", body: JSON.stringify(p) }
        );
        setPrefs(res.prefs);
      } catch {
        load();
      }
    },
    [load]
  );

  if (!prefs) {
    return (
      <View style={{ padding: spacing.md }}>
        <Text style={styles.rowValue}>{isArabic ? "…" : "Loading…"}</Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>
            {isArabic ? "تفعيل" : "Track cycle"}
          </Text>
          <Text style={styles.rowValue}>
            {isArabic
              ? "خصوصي وبيتحكم فيه. مغلق افتراضياً."
              : "Private + opt-in. Off by default."}
          </Text>
        </View>
        <Switch
          value={prefs.enabled}
          onValueChange={(v) => patch({ enabled: v })}
          trackColor={{ true: colors.gold, false: colors.line }}
          thumbColor={colors.ink}
        />
      </View>
      {prefs.enabled && (
        <>
          <Pressable
            onPress={() => router.push("/cycle")}
            style={styles.row}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>
                {isArabic ? "افتح الشاشة" : "Open cycle screen"}
              </Text>
              <Text style={styles.rowValue}>
                {isArabic
                  ? "سجل بداية الدورة وشوف المرحلة الحالية"
                  : "Log period starts + see current phase"}
              </Text>
            </View>
            <Text style={[styles.rowValue, { color: colors.gold, fontSize: 13 }]}>
              →
            </Text>
          </Pressable>
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>
                {isArabic ? "شارك مع المدرب" : "Share with coach"}
              </Text>
              <Text style={styles.rowValue}>
                {isArabic
                  ? "يعدل نصائح التدريب والأكل حسب المرحلة"
                  : "Adjust training + nutrition advice by phase"}
              </Text>
            </View>
            <Switch
              value={prefs.share_with_coach}
              onValueChange={(v) => patch({ share_with_coach: v })}
              trackColor={{ true: colors.gold, false: colors.line }}
              thumbColor={colors.ink}
            />
          </View>
        </>
      )}
    </>
  );
}

function TimeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        marginTop: spacing.xs,
      }}
    >
      <View
        style={{
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          paddingVertical: 8,
          backgroundColor: colors.panel2,
        }}
      >
        <Ionicons name="time-outline" size={16} color={colors.gold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          onPress={() => {
            // Simple prompt-style edit — user retypes. Full time-picker
            // wheel would be nicer but adds a dep.
            const parts = draft.split(":");
            const currentH = Number(parts[0] ?? 0);
            const currentM = Number(parts[1] ?? 0);
            Alert.prompt(
              "Time (HH:MM)",
              `Current: ${String(currentH).padStart(2, "0")}:${String(currentM).padStart(2, "0")}`,
              (input) => {
                if (input && /^\d{1,2}:\d{2}$/.test(input)) {
                  const [h, m] = input.split(":").map(Number);
                  if (h! >= 0 && h! <= 23 && m! >= 0 && m! <= 59) {
                    const normalized = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                    setDraft(normalized);
                    onChange(normalized);
                  }
                }
              },
              "plain-text",
              draft
            );
          }}
          style={{
            fontFamily: font.displayBold,
            fontSize: 18,
            color: colors.ink,
            paddingVertical: 6,
          }}
        >
          {draft}
        </Text>
      </View>
    </View>
  );
}

/**
 * On-device health store row — Apple Health on iOS, Health Connect on
 * Android. Different from IntegrationRow: no OAuth (permissions are
 * native), no server-side "connected" concept (data flows client-side
 * via useHealthSync), and no per-provider sync button (background sync
 * runs on Home mount).
 *
 * "Connected" is a cached flag in AsyncStorage set on the first
 * successful auth prompt. Users can revoke in system settings and
 * we won't know until the next auth call fails silently — the
 * "Manage in system settings" link makes that path obvious.
 */
function HealthRow({ isArabic }: { isArabic: boolean }) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const supported = Platform.OS === "ios" || Platform.OS === "android";
  const platformName =
    Platform.OS === "ios"
      ? isArabic
        ? "Apple Health"
        : "Apple Health"
      : Platform.OS === "android"
        ? isArabic
          ? "Health Connect"
          : "Health Connect"
        : isArabic
          ? "الصحة"
          : "Health";

  useEffect(() => {
    if (!supported) return;
    AsyncStorage.getItem(HEALTH_CONNECTED_KEY)
      .then((v) => setConnected(v === "1"))
      .catch(() => setConnected(false));
  }, [supported]);

  const authorize = async () => {
    setBusy(true);
    try {
      const ok =
        Platform.OS === "ios"
          ? await requestHealthKitAuth()
          : Platform.OS === "android"
            ? await requestHealthConnectAuth()
            : false;
      if (ok) {
        await AsyncStorage.setItem(HEALTH_CONNECTED_KEY, "1");
        setConnected(true);
        Alert.alert(
          isArabic ? "تم" : "Connected",
          isArabic
            ? "سيتم مزامنة الوزن والخطوات والتمارين والنوم تلقائياً."
            : "Weight, steps, workouts, and sleep will sync automatically."
        );
      } else {
        Alert.alert(
          isArabic ? "لم يتم المنح" : "Not granted",
          isArabic
            ? Platform.OS === "ios"
              ? "افتح إعدادات > الخصوصية والأمان > الصحة > SE7A لتفعيل الأذونات."
              : "افتح Health Connect لتفعيل الأذونات."
            : Platform.OS === "ios"
              ? "Open Settings > Privacy & Security > Health > SE7A to grant permissions."
              : "Open the Health Connect app to grant permissions."
        );
      }
    } catch {
      /* silent */
    }
    setBusy(false);
  };

  const openSystemSettings = () => {
    if (Platform.OS === "ios") {
      Linking.openSettings().catch(() => {});
    } else if (Platform.OS === "android") {
      // openHealthConnectSettings is the official API and no-ops
      // gracefully when the SDK isn't installed.
      openHealthConnectSettings();
    }
  };

  if (!supported) return null;

  return (
    <View style={styles.integRow}>
      <View style={styles.integIcon}>
        <Ionicons
          name={connected ? "heart" : "heart-outline"}
          size={20}
          color={connected ? colors.coral : colors.dim}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.integTitle}>{platformName}</Text>
        <Text style={styles.integMeta}>
          {connected === null
            ? isArabic
              ? "…"
              : "…"
            : connected
              ? isArabic
                ? "متصل · يزامن تلقائياً"
                : "Connected · syncs automatically"
              : isArabic
                ? "اضغط للتفعيل"
                : "Tap to enable"}
        </Text>
      </View>
      {connected ? (
        <Pressable
          onPress={openSystemSettings}
          disabled={busy}
          hitSlop={6}
        >
          <Text style={styles.healthGhostBtn}>
            {isArabic ? "الأذونات" : "Permissions"}
          </Text>
        </Pressable>
      ) : (
        <Pressable onPress={authorize} disabled={busy} hitSlop={6}>
          <Text style={styles.integConnect}>
            {busy ? "…" : isArabic ? "فعّل" : "ENABLE"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function IntegrationRow({
  provider,
  displayName,
  brandColor,
  iconConnected,
  iconDisconnected,
  connectedLabel,
  disconnectedBlurb,
  integration,
  busy,
  onConnect,
  onSync,
  onDisconnect,
  isArabic,
  last,
}: {
  provider: Integration["provider"];
  displayName: string;
  brandColor: string;
  iconConnected: keyof typeof Ionicons.glyphMap;
  iconDisconnected: keyof typeof Ionicons.glyphMap;
  connectedLabel: string;
  disconnectedBlurb: string;
  integration: Integration | undefined;
  busy?: "connecting" | "syncing";
  onConnect: () => void;
  onSync: () => void;
  onDisconnect: () => void;
  isArabic: boolean;
  last?: boolean;
}) {
  if (integration) {
    return (
      <>
        <View style={styles.integRow}>
          <View style={styles.integIcon}>
            <Ionicons name={iconConnected} size={20} color={brandColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.integTitle}>{displayName}</Text>
            <Text style={styles.integMeta}>
              {connectedLabel}
              {integration.last_sync_at
                ? ` · ${isArabic ? "آخر مزامنة" : "last sync"} ${shortAgo(integration.last_sync_at)}`
                : ""}
            </Text>
          </View>
          <Pressable
            onPress={onSync}
            disabled={!!busy}
            hitSlop={8}
            style={styles.integSyncBtn}
          >
            <Ionicons
              name="refresh"
              size={16}
              color={busy === "syncing" ? colors.dim : colors.gold}
            />
          </Pressable>
        </View>
        <Pressable
          onPress={onDisconnect}
          style={[styles.row, last && { borderBottomWidth: 0 }]}
        >
          <Text style={[styles.rowLabel, { color: colors.coral }]}>
            {isArabic ? `اقطع الاتصال مع ${displayName}` : `Disconnect ${displayName}`}
          </Text>
        </Pressable>
      </>
    );
  }
  return (
    <Pressable
      onPress={onConnect}
      disabled={!!busy}
      style={[styles.integRow, last && { borderBottomWidth: 0 }]}
    >
      <View style={styles.integIcon}>
        <Ionicons name={iconDisconnected} size={20} color={brandColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.integTitle}>{displayName}</Text>
        <Text style={styles.integMeta}>{disconnectedBlurb}</Text>
      </View>
      <Text style={styles.integConnect}>
        {busy === "connecting"
          ? "…"
          : isArabic
            ? "اربط"
            : "Connect"}
      </Text>
    </Pressable>
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
  autoBadge: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.gold,
    letterSpacing: 0.8,
    borderColor: colors.gold,
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
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
  healthGhostBtn: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    letterSpacing: 1.2,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    backgroundColor: colors.panel2,
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
