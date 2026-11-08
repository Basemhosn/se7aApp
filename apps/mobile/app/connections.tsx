import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as WebBrowser from "expo-web-browser";
import { openHealthConnectSettings } from "react-native-health-connect";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { api } from "@/lib/api";
import { useAuth } from "@/auth/AuthContext";
import {
  readLatestBodyFatPct,
  readLatestWeightKg,
  readTodayActiveEnergy,
  readTodaySteps,
  readWorkoutsSince,
  requestHealthKitAuth,
} from "@/lib/healthkit";
import { requestHealthConnectAuth } from "@/lib/healthConnect";
import { syncHealthNow } from "@/lib/useHealthSync";
import { settingsStyles } from "@/components/SettingsAtoms";
import { colors, font, radius, spacing } from "@/lib/theme";

const HEALTH_CONNECTED_KEY = "se7a_health_connected";

// Strava integration is fully implemented but hidden from the UI while
// Strava's Nov 2024 API terms require a paid Enterprise contract for
// consumer apps. Flip to true once we're on the paid tier.
const STRAVA_ENABLED = false;

interface Integration {
  provider: "strava" | "whoop" | "oura" | "fitbit" | "ultrahuman";
  provider_user_id: string | null;
  connected_at: string;
  last_sync_at: string | null;
}

interface UltrahumanConfig {
  enabled: boolean;
  share_code: string | null;
}

/**
 * Connections sub-screen. Extracted from settings.tsx so the main
 * Settings page can be a lean menu list. Hosts Apple Health / Health
 * Connect, the add-cardio-to-target toggle, and OAuth integrations
 * (Whoop, Oura, Strava gated, Ultrahuman flag-gated).
 */
export default function ConnectionsScreen() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [busy, setBusy] = useState<
    Partial<Record<Integration["provider"], "connecting" | "syncing">>
  >({});
  const [uhConfig, setUhConfig] = useState<UltrahumanConfig | null>(null);

  useEffect(() => {
    api<{ integrations: Integration[] }>("/api/integrations")
      .then((r) => setIntegrations(r.integrations))
      .catch(() => setIntegrations([]));
    api<UltrahumanConfig>("/api/integrations/ultrahuman/config")
      .then((r) => setUhConfig(r))
      .catch(() => setUhConfig({ enabled: false, share_code: null }));
  }, []);

  const strava = integrations.find((i) => i.provider === "strava");
  const whoop = integrations.find((i) => i.provider === "whoop");
  const oura = integrations.find((i) => i.provider === "oura");
  const ultrahuman = integrations.find((i) => i.provider === "ultrahuman");

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
            /* non-blocking */
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
        isArabic
          ? `قطع الاتصال مع ${displayName}؟`
          : `Disconnect ${displayName}?`,
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
                await api(`/api/integrations/${provider}`, { method: "DELETE" });
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

  return (
    <Screen>
      <View style={settingsStyles.head}>
        <BackButton />
      </View>
      <Text style={settingsStyles.title}>
        {isArabic ? "الاتصالات" : "Connections"}
      </Text>
      <View style={settingsStyles.card}>
        <HealthRow isArabic={isArabic} />
        <CardioToTargetRow isArabic={isArabic} />
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
          last={!uhConfig?.enabled}
        />
        {uhConfig?.enabled && (
          <UltrahumanRow
            integration={ultrahuman}
            shareCode={uhConfig.share_code}
            onChanged={refreshIntegrations}
            isArabic={isArabic}
          />
        )}
      </View>
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────────────
// HealthRow — Apple Health / Health Connect cell with Resync / Permissions
// / Diagnose action pills. Previously inlined in settings.tsx.

function HealthRow({ isArabic }: { isArabic: boolean }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const supported = Platform.OS === "ios" || Platform.OS === "android";
  const platformName =
    Platform.OS === "ios"
      ? "Apple Health"
      : Platform.OS === "android"
        ? "Health Connect"
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
      let ok = false;
      let errorDetail = "";
      if (Platform.OS === "ios") {
        const res = await requestHealthKitAuth();
        ok = res.ok;
        errorDetail = res.error ?? "";
      } else if (Platform.OS === "android") {
        ok = await requestHealthConnectAuth();
      }
      if (ok) {
        await AsyncStorage.setItem(HEALTH_CONNECTED_KEY, "1");
        setConnected(true);
        if (user?.id) syncHealthNow(user.id).catch(() => {});
        Alert.alert(
          isArabic ? "تم" : "Connected",
          isArabic
            ? "سيتم مزامنة الوزن والخطوات والتمارين والنوم تلقائياً."
            : "Weight, steps, workouts, and sleep will sync automatically."
        );
      } else {
        const settingsHint =
          isArabic
            ? Platform.OS === "ios"
              ? "افتح إعدادات > الخصوصية والأمان > الصحة > SE7A لتفعيل الأذونات."
              : "افتح Health Connect لتفعيل الأذونات."
            : Platform.OS === "ios"
              ? "Open Settings > Privacy & Security > Health > SE7A to grant permissions."
              : "Open the Health Connect app to grant permissions.";
        Alert.alert(
          isArabic ? "لم يتم المنح" : "Not granted",
          errorDetail ? `${settingsHint}\n\nDetail: ${errorDetail}` : settingsHint
        );
      }
    } catch (e) {
      Alert.alert(isArabic ? "خطأ" : "Health error", (e as Error).message);
    }
    setBusy(false);
  };

  const openSystemSettings = () => {
    if (Platform.OS === "ios") {
      Linking.openSettings().catch(() => {});
    } else if (Platform.OS === "android") {
      openHealthConnectSettings();
    }
  };

  if (!supported) return null;

  const onResync = async () => {
    if (!user?.id) return;
    setBusy(true);
    try {
      await syncHealthNow(user.id, { force: true, resyncHistory: true });
      Alert.alert(
        isArabic ? "تم" : "Done",
        isArabic
          ? "تمت إعادة مزامنة آخر ٩٠ يوماً من بيانات الصحة."
          : "Re-synced the past 90 days of Health data."
      );
    } catch (e) {
      Alert.alert(
        isArabic ? "خطأ" : "Error",
        (e as Error).message ?? "unknown"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.healthCard}>
      <View style={styles.healthHeaderRow}>
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
              ? "…"
              : connected
                ? isArabic
                  ? "متصل · يزامن تلقائياً"
                  : "Connected · syncs automatically"
                : isArabic
                  ? "اضغط للتفعيل"
                  : "Tap to enable"}
          </Text>
        </View>
        {!connected ? (
          <Pressable onPress={authorize} disabled={busy} hitSlop={6}>
            <Text style={styles.integConnect}>
              {busy ? "…" : isArabic ? "فعّل" : "ENABLE"}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {connected ? (
        <View style={styles.healthActionRow}>
          <Pressable
            style={styles.healthActionBtn}
            onPress={onResync}
            disabled={busy}
            hitSlop={6}
          >
            <Ionicons name="refresh" size={14} color={colors.gold} />
            <Text style={styles.healthActionText}>
              {busy ? "…" : isArabic ? "أعد المزامنة" : "Resync"}
            </Text>
          </Pressable>
          <Pressable
            style={styles.healthActionBtn}
            onPress={openSystemSettings}
            disabled={busy}
            hitSlop={6}
          >
            <Ionicons name="settings-outline" size={14} color={colors.gold} />
            <Text style={styles.healthActionText}>
              {isArabic ? "الأذونات" : "Permissions"}
            </Text>
          </Pressable>
          <Pressable
            style={styles.healthActionBtn}
            onPress={() => diagnoseHealthKit(isArabic)}
            disabled={busy}
            hitSlop={6}
          >
            <Ionicons name="bug-outline" size={14} color={colors.gold} />
            <Text style={styles.healthActionText}>
              {isArabic ? "افحص" : "Diagnose"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

async function diagnoseHealthKit(isArabic: boolean) {
  if (Platform.OS !== "ios") {
    Alert.alert("Diagnose", "iOS only.");
    return;
  }
  const lines: string[] = [];
  try {
    const authRes = await requestHealthKitAuth();
    lines.push(
      `Auth init: ${authRes.ok ? "OK" : `FAIL — ${authRes.error ?? "unknown"}`}`
    );
    if (!authRes.ok) {
      Alert.alert(isArabic ? "الفحص" : "Diagnose", lines.join("\n"));
      return;
    }
    const [weight, bf, steps, activeKcal, workouts] = await Promise.all([
      readLatestWeightKg(),
      readLatestBodyFatPct(),
      readTodaySteps(),
      readTodayActiveEnergy(),
      readWorkoutsSince(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      ),
    ]);
    lines.push(
      `Latest weight: ${weight ? `${weight.weight_kg} kg (${new Date(weight.measured_at).toLocaleDateString()})` : "none"}`
    );
    lines.push(
      `Latest body-fat: ${bf ? `${bf.body_fat_pct}% (${new Date(bf.measured_at).toLocaleDateString()})` : "none"}`
    );
    lines.push(`Today steps: ${steps}`);
    lines.push(`Today active kcal: ${activeKcal}`);
    lines.push(`Workouts (last 7d): ${workouts.length}`);
    if (steps === 0 && activeKcal === 0 && workouts.length === 0 && !weight && !bf) {
      lines.push("");
      lines.push(
        "No data anywhere. Most likely: you granted permission but not all data types. Open Settings > Privacy & Security > Health > SE7A and enable each category."
      );
    }
    Alert.alert(isArabic ? "الفحص" : "Diagnose", lines.join("\n"));
  } catch (e) {
    Alert.alert(isArabic ? "الفحص" : "Diagnose", `Threw: ${(e as Error).message}`);
  }
}

function CardioToTargetRow({ isArabic }: { isArabic: boolean }) {
  const [value, setValue] = useState<boolean | null>(null);

  useEffect(() => {
    api<{ add_cardio_to_target?: boolean }>("/api/profile/prefs")
      .then((r) => setValue(!!r.add_cardio_to_target))
      .catch(() => setValue(false));
  }, []);

  const toggle = async (v: boolean) => {
    setValue(v);
    try {
      await api("/api/profile/prefs", {
        method: "POST",
        body: JSON.stringify({ add_cardio_to_target: v }),
      });
    } catch {
      setValue(!v);
    }
  };

  return (
    <View style={[styles.row, { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>
          {isArabic
            ? "أضف حرق النشاط لهدف السعرات"
            : "Add activity burn to daily target"}
        </Text>
        <Text style={styles.rowValue}>
          {isArabic
            ? "يوسع حلقة اليوم بالخطوات والكارديو. مغلق افتراضياً."
            : "Expands today's ring by steps + cardio kcal. Off by default."}
        </Text>
      </View>
      <Switch
        value={!!value}
        disabled={value === null}
        onValueChange={toggle}
        trackColor={{ true: colors.gold, false: colors.line }}
        thumbColor={colors.ink}
      />
    </View>
  );
}

function IntegrationRow({
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
            {isArabic
              ? `اقطع الاتصال مع ${displayName}`
              : `Disconnect ${displayName}`}
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
        {busy === "connecting" ? "…" : isArabic ? "اربط" : "Connect"}
      </Text>
    </Pressable>
  );
}

function shortAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function UltrahumanRow({
  integration,
  shareCode,
  onChanged,
  isArabic,
}: {
  integration: Integration | undefined;
  shareCode: string | null;
  onChanged: () => void | Promise<void>;
  isArabic: boolean;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"connecting" | "syncing" | null>(null);
  const connected = !!integration;

  const doConnect = async () => {
    if (!email) return;
    setBusy("connecting");
    try {
      await api("/api/integrations/ultrahuman/connect", {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      setEmail("");
      await onChanged();
    } catch (e) {
      Alert.alert(
        isArabic ? "تعذّر الربط" : "Couldn't connect",
        (e as Error).message
      );
    } finally {
      setBusy(null);
    }
  };

  const doSync = async () => {
    setBusy("syncing");
    try {
      const res = await api<{
        days_synced: number;
        sleep_upserted: number;
        recovery_upserted: number;
        glucose_upserted: number;
        error?: string;
      }>("/api/integrations/ultrahuman/sync", { method: "POST" });
      await onChanged();
      Alert.alert(
        isArabic ? "تمت المزامنة" : "Synced",
        res.error
          ? res.error
          : `${res.days_synced} day(s) • sleep ${res.sleep_upserted} • recovery ${res.recovery_upserted} • glucose ${res.glucose_upserted}`
      );
    } catch (e) {
      Alert.alert(
        isArabic ? "تعذّرت المزامنة" : "Sync failed",
        (e as Error).message
      );
    } finally {
      setBusy(null);
    }
  };

  const doDisconnect = async () => {
    try {
      await api("/api/integrations/ultrahuman/disconnect", { method: "POST" });
      await onChanged();
    } catch (e) {
      Alert.alert(
        isArabic ? "تعذّر الفصل" : "Couldn't disconnect",
        (e as Error).message
      );
    }
  };

  return (
    <View style={{ paddingVertical: spacing.md, gap: spacing.sm, paddingHorizontal: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "#5A3FFF",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="pulse" size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: font.body, fontSize: 15, color: colors.ink }}>
            Ultrahuman
          </Text>
          <Text style={{ fontFamily: font.mono, fontSize: 11, color: colors.dim }}>
            {connected
              ? `${integration?.provider_user_id ?? ""}${
                  integration?.last_sync_at
                    ? ` • synced ${shortAgo(integration.last_sync_at)}`
                    : ""
                }`
              : isArabic
                ? "اربط لاستيراد النوم والتعافي والجلوكوز."
                : "Import sleep, recovery, and glucose."}
          </Text>
        </View>
      </View>

      {!connected && (
        <>
          {shareCode && (
            <View
              style={{
                backgroundColor: colors.panel2,
                borderRadius: radius.sm,
                padding: spacing.sm,
                gap: 4,
              }}
            >
              <Text
                style={{
                  fontFamily: font.mono,
                  fontSize: 10,
                  color: colors.dim,
                  letterSpacing: 1.2,
                }}
              >
                {isArabic
                  ? "خطوة ١: أدخل هذا الرمز في تطبيق Ultrahuman"
                  : "STEP 1 — ENTER IN THE ULTRAHUMAN APP"}
              </Text>
              <Text
                style={{
                  fontFamily: font.monoBold,
                  fontSize: 16,
                  color: colors.gold,
                  letterSpacing: 2,
                }}
              >
                {shareCode}
              </Text>
            </View>
          )}
          <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.dim, letterSpacing: 1.2 }}>
            {isArabic ? "خطوة ٢: أدخل بريدك في Ultrahuman" : "STEP 2 — YOUR ULTRAHUMAN EMAIL"}
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.dim}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={{
              fontFamily: font.body,
              fontSize: 14,
              color: colors.ink,
              backgroundColor: colors.panel2,
              borderRadius: radius.sm,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            }}
          />
          <Pressable
            onPress={doConnect}
            disabled={!email || busy === "connecting"}
            style={{
              backgroundColor: !email || busy === "connecting" ? colors.panel2 : colors.gold,
              borderRadius: radius.pill,
              paddingVertical: 10,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: font.displayBold,
                fontSize: 13,
                color: !email || busy === "connecting" ? colors.dim : colors.bg,
              }}
            >
              {busy === "connecting" ? "…" : isArabic ? "اربط" : "Connect"}
            </Text>
          </Pressable>
        </>
      )}
      {connected && (
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Pressable
            onPress={doSync}
            disabled={busy === "syncing"}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radius.pill,
              paddingVertical: 8,
              alignItems: "center",
            }}
          >
            <Text style={{ fontFamily: font.mono, fontSize: 12, color: colors.gold }}>
              {busy === "syncing" ? "…" : isArabic ? "زامن الآن" : "Sync now"}
            </Text>
          </Pressable>
          <Pressable
            onPress={doDisconnect}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radius.pill,
              paddingVertical: 8,
              alignItems: "center",
            }}
          >
            <Text style={{ fontFamily: font.mono, fontSize: 12, color: colors.coral }}>
              {isArabic ? "اقطع" : "Disconnect"}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowLabel: { fontFamily: font.body, fontSize: 14, color: colors.ink },
  rowValue: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
    marginTop: 2,
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
  integTitle: { fontFamily: font.displayBold, fontSize: 15, color: colors.ink },
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
  healthCard: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  healthHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  healthActionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    marginLeft: 40 + spacing.md,
  },
  healthActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    backgroundColor: colors.panel2,
  },
  healthActionText: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 0.4,
  },
});
