import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { BackButton } from "@/components/BackButton";
import { api } from "@/lib/api";
import { colors, font, radius, spacing } from "@/lib/theme";

type CyclePhase =
  | "menstrual"
  | "follicular"
  | "ovulation"
  | "luteal"
  | "unknown";

interface CycleStatus {
  enabled: boolean;
  phase: CyclePhase;
  cycle_day: number | null;
  avg_cycle_length_days: number;
  avg_period_length_days: number;
  days_until_next_period: number | null;
  last_period_started_on: string | null;
  next_period_estimate: string | null;
  history_count: number;
  coaching_hint: string | null;
}

interface PeriodRow {
  id: number;
  started_on: string;
  ended_on: string | null;
  flow: string | null;
  notes: string | null;
}

interface StatusResponse {
  status: CycleStatus;
  prefs: {
    enabled: boolean;
    avg_cycle_length_days: number;
    avg_period_length_days: number;
    share_with_coach: boolean;
  };
  recent: PeriodRow[];
}

const PHASE_META: Record<
  CyclePhase,
  { label: string; tint: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  menstrual: { label: "Menstrual", tint: colors.coral, icon: "water" },
  follicular: { label: "Follicular", tint: colors.mint, icon: "leaf" },
  ovulation: { label: "Ovulation", tint: colors.gold, icon: "sparkles" },
  luteal: { label: "Luteal", tint: "#8b7dd6", icon: "moon" },
  unknown: { label: "Not enough data", tint: colors.dim, icon: "help-circle" },
};

export default function CycleScreen() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [data, setData] = useState<StatusResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<StatusResponse>("/api/cycle/status");
      setData(res);
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const logToday = async () => {
    setBusy(true);
    try {
      const today = new Date();
      const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      await api("/api/cycle/log", {
        method: "POST",
        body: JSON.stringify({ started_on: iso }),
      });
      await load();
    } catch {
      Alert.alert(isArabic ? "خطأ" : "Error", isArabic ? "أعد المحاولة" : "Try again");
    }
    setBusy(false);
  };

  const deletePeriod = (id: number) => {
    Alert.alert(
      isArabic ? "حذف الإدخال؟" : "Delete this entry?",
      isArabic ? "لا يمكن التراجع." : "Can't be undone.",
      [
        { text: isArabic ? "إلغاء" : "Cancel", style: "cancel" },
        {
          text: isArabic ? "حذف" : "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api(`/api/cycle/${id}`, { method: "DELETE" });
              await load();
            } catch {
              /* silent */
            }
          },
        },
      ]
    );
  };

  if (!data) {
    return (
      <Screen>
        <BackButton />
        <Text style={styles.title}>{isArabic ? "الدورة" : "Cycle"}</Text>
        <Text style={styles.sub}>{isArabic ? "…" : "Loading…"}</Text>
      </Screen>
    );
  }

  if (!data.prefs.enabled) {
    return (
      <Screen>
        <BackButton />
        <Text style={styles.title}>{isArabic ? "الدورة" : "Cycle"}</Text>
        <Text style={styles.sub}>
          {isArabic
            ? "الميزة مغلقة. فعّلها من الإعدادات."
            : "Feature is off. Enable it from Settings."}
        </Text>
      </Screen>
    );
  }

  const s = data.status;
  const meta = PHASE_META[s.phase];

  return (
    <Screen>
      <BackButton />
      <View style={styles.head}>
        <Text style={styles.title}>{isArabic ? "الدورة" : "Cycle"}</Text>
        <Text style={styles.sub}>
          {isArabic
            ? "خصوصي — يستخدم فقط لتخصيص النصائح."
            : "Private — used only to tailor advice."}
        </Text>
      </View>

      <View style={[styles.phaseCard, { borderColor: meta.tint }]}>
        <View style={styles.phaseRow}>
          <Ionicons name={meta.icon} size={22} color={meta.tint} />
          <Text style={[styles.phaseLabel, { color: meta.tint }]}>
            {meta.label.toUpperCase()}
          </Text>
        </View>
        <View style={styles.phaseNumRow}>
          <Text style={styles.phaseNum}>
            {s.cycle_day ?? "—"}
          </Text>
          <Text style={styles.phaseUnit}>
            / {s.avg_cycle_length_days}
          </Text>
        </View>
        {s.days_until_next_period !== null && (
          <Text style={styles.phaseSub}>
            {s.days_until_next_period === 0
              ? isArabic
                ? "متوقع اليوم"
                : "Expected today"
              : s.days_until_next_period > 0
                ? `${s.days_until_next_period} ${
                    isArabic ? "أيام حتى الدورة القادمة" : "days to next period"
                  }`
                : `${Math.abs(s.days_until_next_period)} ${
                    isArabic ? "أيام متأخرة" : "days late"
                  }`}
          </Text>
        )}
        {s.coaching_hint && (
          <Text style={styles.hint}>{s.coaching_hint}</Text>
        )}
      </View>

      <Btn
        label={busy ? (isArabic ? "…" : "…") : isArabic ? "سجل بداية اليوم" : "Log period started today"}
        onPress={logToday}
        disabled={busy}
      />

      {data.recent.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {isArabic ? "السجل" : "Recent periods"}
          </Text>
          {data.recent.map((p) => (
            <Pressable
              key={p.id}
              onLongPress={() => deletePeriod(p.id)}
              style={styles.historyRow}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.historyDate}>{formatDate(p.started_on)}</Text>
                {p.ended_on && (
                  <Text style={styles.historyMeta}>
                    {isArabic ? "انتهت" : "ended"} {formatDate(p.ended_on)}
                  </Text>
                )}
              </View>
              {p.flow && (
                <Text style={styles.historyFlow}>{p.flow}</Text>
              )}
            </Pressable>
          ))}
          <Text style={styles.hintSmall}>
            {isArabic ? "اضغط مطولاً للحذف." : "Long-press to delete."}
          </Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {isArabic ? "المتوسطات" : "Your averages"}
        </Text>
        <Text style={styles.avgLine}>
          {isArabic ? "طول الدورة: " : "Cycle length: "}
          <Text style={styles.avgVal}>
            {s.avg_cycle_length_days} {isArabic ? "يوم" : "days"}
          </Text>
        </Text>
        <Text style={styles.avgLine}>
          {isArabic ? "طول الفترة: " : "Period length: "}
          <Text style={styles.avgVal}>
            {s.avg_period_length_days} {isArabic ? "يوم" : "days"}
          </Text>
        </Text>
        <Text style={styles.avgLine}>
          {isArabic ? "دورات مسجلة: " : "Cycles logged: "}
          <Text style={styles.avgVal}>{s.history_count}</Text>
        </Text>
      </View>
    </Screen>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const styles = StyleSheet.create({
  head: { gap: 4, marginTop: spacing.sm },
  title: {
    fontFamily: font.displayBold,
    fontSize: 26,
    color: colors.ink,
  },
  sub: { fontFamily: font.body, fontSize: 13, color: colors.dim },
  phaseCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 8,
    marginTop: spacing.md,
  },
  phaseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  phaseLabel: {
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  phaseNumRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  phaseNum: {
    fontFamily: font.displayBold,
    fontSize: 48,
    color: colors.ink,
  },
  phaseUnit: {
    fontFamily: font.mono,
    fontSize: 16,
    color: colors.dim,
  },
  phaseSub: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.ink,
  },
  hint: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    marginTop: 4,
  },
  hintSmall: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 0.6,
    marginTop: spacing.xs,
  },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    gap: 6,
  },
  cardTitle: {
    fontFamily: font.displayBold,
    fontSize: 15,
    color: colors.ink,
    marginBottom: 4,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  historyDate: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.ink,
  },
  historyMeta: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
  },
  historyFlow: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  avgLine: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
  },
  avgVal: {
    fontFamily: font.displayBold,
    color: colors.ink,
  },
});
