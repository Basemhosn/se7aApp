import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { api } from "@/lib/api";
import { colors, font, radius, spacing } from "@/lib/theme";

interface Pattern {
  id: string;
  severity: "info" | "warn";
  title: string;
  body: string;
  evidence: Record<string, string | number>;
}

interface PatternsResponse {
  patterns: Pattern[];
  window_days: number;
}

type Category = "food" | "movement" | "sleep" | "cycle";

const CATEGORY_FOR_ID: Record<string, Category> = {
  dow_kcal_bias: "food",
  late_night_eating: "food",
  fiber_sodium_days: "food",
  ramadan_drift: "food",
  weekend_cardio_dip: "movement",
  post_workout_sleep_drop: "sleep",
  cycle_phase_kcal_drift: "cycle",
  cycle_phase_workout_capacity: "cycle",
  cycle_phase_micro_drift: "cycle",
  cycle_phase_pr_clustering: "cycle",
};

const CATEGORY_ORDER: Category[] = ["food", "movement", "sleep", "cycle"];

const ICON_FOR_ID: Record<string, keyof typeof Ionicons.glyphMap> = {
  dow_kcal_bias: "calendar",
  late_night_eating: "moon",
  post_workout_sleep_drop: "bed",
  weekend_cardio_dip: "walk",
  fiber_sodium_days: "leaf",
  ramadan_drift: "moon",
  cycle_phase_kcal_drift: "sync",
  cycle_phase_workout_capacity: "barbell",
  cycle_phase_micro_drift: "nutrition",
  cycle_phase_pr_clustering: "trophy",
};

const DISMISS_PREFIX = "se7a_insight_dismissed_";
const DISMISS_WINDOW_MS = 30 * 86_400_000;

export default function Insights() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [data, setData] = useState<PatternsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Pattern-id → dismissed-at ms epoch. Rehydrated from AsyncStorage
  // on mount so a dismissal survives app restart.
  const [dismissed, setDismissed] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const res = await api<PatternsResponse>("/api/insights/patterns");
      setData(res);
    } catch {
      setData(null);
    }
  }, []);

  // Hydrate dismissals on mount
  useEffect(() => {
    (async () => {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const dismissKeys = keys.filter((k) => k.startsWith(DISMISS_PREFIX));
        if (dismissKeys.length === 0) return;
        const pairs = await AsyncStorage.multiGet(dismissKeys);
        const map: Record<string, number> = {};
        const now = Date.now();
        const expired: string[] = [];
        for (const [k, v] of pairs) {
          if (!v) continue;
          const ts = Number(v);
          if (!Number.isFinite(ts)) continue;
          const patternId = k.slice(DISMISS_PREFIX.length);
          if (now - ts > DISMISS_WINDOW_MS) {
            expired.push(k);
          } else {
            map[patternId] = ts;
          }
        }
        if (expired.length > 0) {
          AsyncStorage.multiRemove(expired).catch(() => {});
        }
        setDismissed(map);
      } catch {
        /* empty */
      }
    })();
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const dismissPattern = (p: Pattern) => {
    Alert.alert(
      isArabic ? "إخفاء هذا النمط؟" : "Dismiss this pattern?",
      isArabic
        ? "لن يظهر لمدة 30 يومًا. إذا استمرّ النمط بعد ذلك، سيعود."
        : "Hidden for 30 days. If the pattern still fires after that window, it comes back.",
      [
        { text: isArabic ? "إلغاء" : "Cancel", style: "cancel" },
        {
          text: isArabic ? "أخفِ" : "Dismiss",
          onPress: () => {
            const ts = Date.now();
            AsyncStorage.setItem(DISMISS_PREFIX + p.id, String(ts)).catch(
              () => {}
            );
            setDismissed((prev) => ({ ...prev, [p.id]: ts }));
          },
        },
      ]
    );
  };

  // Group fired patterns by category after filtering dismissals
  const grouped = useMemo(() => {
    if (!data) return [] as { category: Category; patterns: Pattern[] }[];
    const alive = data.patterns.filter((p) => !dismissed[p.id]);
    const byCategory = new Map<Category, Pattern[]>();
    for (const p of alive) {
      const cat = CATEGORY_FOR_ID[p.id] ?? "food";
      const list = byCategory.get(cat) ?? [];
      // Warn-level first within a category
      if (p.severity === "warn") list.unshift(p);
      else list.push(p);
      byCategory.set(cat, list);
    }
    return CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((c) => ({
      category: c,
      patterns: byCategory.get(c)!,
    }));
  }, [data, dismissed]);

  const totalAlive = grouped.reduce((n, g) => n + g.patterns.length, 0);
  const totalDismissed = Object.keys(dismissed).length;

  const categoryLabel = (c: Category): string => {
    if (isArabic) {
      switch (c) {
        case "food":
          return "الطعام";
        case "movement":
          return "الحركة";
        case "sleep":
          return "النوم";
        case "cycle":
          return "الدورة";
      }
    }
    switch (c) {
      case "food":
        return "Food";
      case "movement":
        return "Movement";
      case "sleep":
        return "Sleep";
      case "cycle":
        return "Cycle";
    }
  };

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.gold}
          />
        }
      >
        <BackButton />
        <Text style={styles.kicker}>{t("insights.kicker")}</Text>
        <Text style={styles.title}>{t("insights.title")}</Text>
        <Text style={styles.sub}>
          {data
            ? t("insights.sub", { days: data.window_days })
            : t("insights.loading")}
        </Text>

        {loading ? (
          <ActivityIndicator
            color={colors.gold}
            style={{ marginVertical: spacing.xl }}
          />
        ) : !data || totalAlive === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="hourglass" size={32} color={colors.dim} />
            <Text style={styles.emptyText}>
              {totalDismissed > 0
                ? isArabic
                  ? "لا شيء جديد. العادات التي أخفيتها قد تعود إن استمر النمط."
                  : "Nothing new. Dismissed patterns may return if they keep firing."
                : t("insights.empty")}
            </Text>
          </View>
        ) : (
          grouped.map((group) => (
            <View key={group.category} style={{ marginTop: spacing.lg }}>
              <Text style={styles.sectionTitle}>
                {categoryLabel(group.category).toUpperCase()}
              </Text>
              {group.patterns.map((p) => (
                <PatternCard
                  key={p.id}
                  pattern={p}
                  isArabic={isArabic}
                  onDismiss={() => dismissPattern(p)}
                />
              ))}
            </View>
          ))
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </Screen>
  );
}

function PatternCard({
  pattern: p,
  isArabic,
  onDismiss,
}: {
  pattern: Pattern;
  isArabic: boolean;
  onDismiss: () => void;
}) {
  const tint = p.severity === "warn" ? colors.coral : colors.gold;
  const daysUsed = typeof p.evidence.days_used === "number"
    ? p.evidence.days_used
    : null;

  return (
    <View style={[styles.card, { borderLeftColor: tint }]}>
      <View style={styles.cardHead}>
        <View
          style={[
            styles.cardIcon,
            { borderColor: tint, backgroundColor: colors.panel2 },
          ]}
        >
          <Ionicons
            name={ICON_FOR_ID[p.id] ?? "sparkles"}
            size={16}
            color={tint}
          />
        </View>
        <Text style={[styles.cardTitle, { color: tint }]} numberOfLines={2}>
          {p.title}
        </Text>
        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isArabic ? "أخفِ النمط" : "Dismiss pattern"}
        >
          <Ionicons name="close" size={18} color={colors.dim} />
        </Pressable>
      </View>
      <Text style={styles.cardBody}>{p.body}</Text>
      <View style={styles.pillRow}>
        {p.severity === "warn" ? (
          <View style={[styles.pill, styles.pillWarn]}>
            <Ionicons name="warning" size={10} color={colors.coral} />
            <Text style={[styles.pillText, { color: colors.coral }]}>
              {isArabic ? "يحتاج انتباه" : "Needs attention"}
            </Text>
          </View>
        ) : null}
        {daysUsed !== null && daysUsed > 0 ? (
          <View style={styles.pill}>
            <Text style={styles.pillText}>
              {isArabic ? `على مدى ${daysUsed} يوم` : `${daysUsed} days sampled`}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.4,
    marginTop: spacing.md,
  },
  title: {
    fontFamily: font.displayBold,
    fontSize: 26,
    color: colors.ink,
    marginTop: 4,
  },
  sub: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    marginTop: 4,
    lineHeight: 20,
  },
  sectionTitle: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.4,
    marginBottom: spacing.xs,
  },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    gap: 6,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontFamily: font.displayBold,
    fontSize: 15,
    flex: 1,
  },
  cardBody: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 21,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pillWarn: {
    backgroundColor: "rgba(240,143,114,0.08)",
    borderColor: "rgba(240,143,114,0.4)",
  },
  pillText: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 0.5,
  },
  empty: {
    alignItems: "center",
    marginTop: spacing.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  emptyText: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
    textAlign: "center",
    lineHeight: 21,
  },
});
