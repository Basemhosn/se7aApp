import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { api } from "@/lib/api";
import type { RamadanStatus } from "@/lib/useRamadan";
import { rescheduleRamadanReminders } from "@/lib/ramadanScheduler";
import { settingsStyles } from "@/components/SettingsAtoms";
import { colors, font, radius, spacing } from "@/lib/theme";

interface RamadanPrefsShape {
  auto_detect: boolean;
  enabled_override: boolean | null;
  fajr_time: string;
  maghrib_time: string;
  suhoor_reminder: boolean;
  iftar_reminder: boolean;
}

/**
 * Ramadan mode sub-screen. Hosts Mode (auto/on/off), City + Country for
 * aladhan lookup, auto/manual Fajr + Maghrib times, suhoor + iftar
 * reminder toggles. All state local to this screen; a successful patch
 * re-schedules the local notifications immediately (not next launch).
 */
export default function RamadanScreen() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  // Start with a sensible default so the screen renders instantly —
  // Mode row, City row, Country row, reminder toggles all appear
  // immediately. active=false hides Fajr/Maghrib until the server
  // confirms Ramadan is current. Server fetch updates values in place.
  const [status, setStatus] = useState<RamadanStatus>({
    active: false,
    hijri_year: null,
    day_num: null,
    total_days: null,
    days_left: null,
    today: null,
    next_ramadan_start: null,
    prefs: {
      auto_detect: true,
      enabled_override: null,
      fajr_time: "05:00",
      maghrib_time: "18:30",
      suhoor_reminder: true,
      iftar_reminder: true,
    },
    times_source: "manual",
    city: null,
    country: null,
  });
  const [savingCity, setSavingCity] = useState(false);

  const reload = useCallback(() => {
    api<RamadanStatus>("/api/ramadan/status")
      .then(setStatus)
      .catch(() => {
        /* keep defaults on fetch failure */
      });
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

  const patch = useCallback(
    async (p: Partial<RamadanPrefsShape>) => {
      setStatus((prev) => ({ ...prev, prefs: { ...prev.prefs, ...p } }));
      try {
        const res = await api<RamadanStatus>("/api/ramadan/status", {
          method: "POST",
          body: JSON.stringify(p),
        });
        setStatus(res);
        rescheduleRamadanReminders(res).catch(() => {});
      } catch {
        /* keep optimistic */
      }
    },
    []
  );

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
    if (status.prefs.auto_detect) {
      patch({ auto_detect: false, enabled_override: true });
    } else if (status.prefs.enabled_override) {
      patch({ auto_detect: false, enabled_override: false });
    } else {
      patch({ auto_detect: true, enabled_override: null });
    }
  };

  return (
    <Screen>
      <View style={settingsStyles.head}>
        <BackButton />
      </View>
      <Text style={settingsStyles.title}>
        {isArabic ? "رمضان" : "Ramadan mode"}
      </Text>
      <View style={settingsStyles.card}>
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
            <Text style={styles.rowLabel}>
              {isArabic ? "المدينة" : "City"}
            </Text>
            <Text style={styles.rowValue}>
              {isArabic
                ? "لضبط أوقات الفجر والمغرب تلقائياً"
                : "For auto fajr + maghrib times"}
            </Text>
          </View>
          <Text style={[styles.rowValue, { color: colors.gold, fontSize: 13 }]}>
            {savingCity ? "…" : status.city ?? (isArabic ? "غير محدد" : "Not set")}
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
              <View style={styles.timeHeader}>
                <Text style={styles.rowLabel}>
                  {isArabic ? "الفجر" : "Fajr"}
                </Text>
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
              <View style={styles.timeHeader}>
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
      </View>
    </Screen>
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
    <View style={styles.timeFieldRow}>
      <View style={styles.timeFieldIcon}>
        <Ionicons name="time-outline" size={16} color={colors.gold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          onPress={() => {
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
          style={styles.timeFieldText}
        >
          {draft}
        </Text>
      </View>
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
  rowLabel: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.ink,
  },
  rowValue: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
    marginTop: 2,
  },
  timeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  autoBadge: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.gold,
    letterSpacing: 1.2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.pill,
    backgroundColor: "rgba(246,183,60,0.10)",
    textTransform: "uppercase",
  },
  timeFieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  timeFieldIcon: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: colors.panel2,
  },
  timeFieldText: {
    fontFamily: font.displayBold,
    fontSize: 18,
    color: colors.ink,
    paddingVertical: 6,
  },
});
