import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { api } from "@/lib/api";
import { colors, font, radius, spacing } from "@/lib/theme";

interface WrappedResponse {
  week_start: string;
  week_end: string;
  hero: {
    label: string;
    value: string;
    unit: string;
  };
  slides: Array<{
    kind:
      | "logging"
      | "workouts"
      | "cardio"
      | "weight"
      | "sleep"
      | "recovery"
      | "protein"
      | "streak";
    kicker: string;
    stat: string;
    unit: string;
    detail: string;
  }>;
  roast: string;
  has_any_data: boolean;
}

const SLIDE_TINT: Record<WrappedResponse["slides"][number]["kind"], string> = {
  logging: colors.gold,
  workouts: colors.coral,
  cardio: colors.mint,
  weight: colors.gold,
  sleep: "#8b7dd6",
  recovery: colors.coral,
  protein: colors.mint,
  streak: colors.gold,
};

const SLIDE_ICON: Record<
  WrappedResponse["slides"][number]["kind"],
  keyof typeof Ionicons.glyphMap
> = {
  logging: "checkbox",
  workouts: "barbell",
  cardio: "footsteps",
  weight: "fitness",
  sleep: "moon",
  recovery: "heart",
  protein: "flame",
  streak: "flame",
};

export default function WeeklyWrapped() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<WrappedResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api<WrappedResponse>("/api/wrapped");
      setData(res);
    } catch {
      setData(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const share = async () => {
    if (!data) return;
    const range = formatWeekRange(data.week_start, data.week_end, i18n.language);
    const lines = [
      t("wrapped.share_header", { range }),
      "",
      `${data.hero.value} ${data.hero.unit} · ${data.hero.label.toLowerCase()}`,
      ...data.slides.slice(0, 4).map(
        (s) => `${s.kicker}: ${s.stat} ${s.unit.toLowerCase()}`
      ),
    ];
    if (data.roast) {
      lines.push("");
      lines.push(`"${data.roast}"`);
    }
    await Share.share({ message: lines.join("\n") });
  };

  if (loading) {
    return (
      <Screen>
        <BackButton />
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      </Screen>
    );
  }

  if (!data || !data.has_any_data) {
    return (
      <Screen>
        <BackButton />
        <Text style={styles.title}>{t("wrapped.empty_title")}</Text>
        <Text style={styles.sub}>{t("wrapped.empty_sub")}</Text>
      </Screen>
    );
  }

  const weekRange = formatWeekRange(
    data.week_start,
    data.week_end,
    i18n.language
  );

  return (
    <Screen>
      <BackButton />

      <Text style={styles.kicker}>
        {t("wrapped.kicker", { range: weekRange.toUpperCase() })}
      </Text>
      <Text style={styles.title}>{t("wrapped.title")}</Text>

      <View style={styles.hero}>
        <Text style={styles.heroLabel}>{data.hero.label}</Text>
        <View style={styles.heroValueRow}>
          <Text style={styles.heroValue}>{data.hero.value}</Text>
          <Text style={styles.heroUnit}>{data.hero.unit}</Text>
        </View>
      </View>

      {data.roast.length > 0 && (
        <View style={styles.roastCard}>
          <Text style={styles.roastKicker}>{t("wrapped.roast_kicker")}</Text>
          <Text style={styles.roastText}>"{data.roast}"</Text>
        </View>
      )}

      <View style={styles.slidesGrid}>
        {data.slides.map((s, i) => (
          <View
            key={i}
            style={[
              styles.slideCard,
              { borderLeftColor: SLIDE_TINT[s.kind] },
            ]}
          >
            <View style={styles.slideHead}>
              <Ionicons
                name={SLIDE_ICON[s.kind]}
                size={14}
                color={SLIDE_TINT[s.kind]}
              />
              <Text style={[styles.slideKicker, { color: SLIDE_TINT[s.kind] }]}>
                {s.kicker}
              </Text>
            </View>
            <Text style={styles.slideStat}>
              {s.stat}
              <Text style={styles.slideUnit}> {s.unit.toLowerCase()}</Text>
            </Text>
            <Text style={styles.slideDetail}>{s.detail}</Text>
          </View>
        ))}
      </View>

      <Pressable style={styles.shareBtn} onPress={share}>
        <Ionicons name="share-outline" size={16} color={colors.bg} />
        <Text style={styles.shareBtnText}>{t("wrapped.share_cta")}</Text>
      </Pressable>
    </Screen>
  );
}

function formatWeekRange(
  startIso: string,
  endIso: string,
  locale: string
): string {
  const start = dateFromIso(startIso);
  const end = dateFromIso(endIso);
  const sameMonth = start.getMonth() === end.getMonth();
  const s = start.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  });
  const e = end.toLocaleDateString(locale, {
    month: sameMonth ? undefined : "short",
    day: "numeric",
  });
  return `${s} – ${e}`;
}

function dateFromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  kicker: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.4,
    marginTop: spacing.md,
  },
  title: {
    fontFamily: font.displayBold,
    fontSize: 30,
    color: colors.ink,
    lineHeight: 34,
    marginTop: 4,
  },
  sub: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
    lineHeight: 21,
    marginTop: spacing.md,
  },
  hero: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
    gap: 4,
  },
  heroLabel: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  heroValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    marginTop: 4,
  },
  heroValue: {
    fontFamily: font.displayBold,
    fontSize: 56,
    color: colors.ink,
    lineHeight: 60,
  },
  heroUnit: {
    fontFamily: font.mono,
    fontSize: 14,
    color: colors.dim,
  },
  roastCard: {
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    gap: 6,
  },
  roastKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.4,
  },
  roastText: {
    fontFamily: font.body,
    fontSize: 15,
    color: colors.ink,
    lineHeight: 22,
    fontStyle: "italic",
  },
  slidesGrid: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  slideCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  slideHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  slideKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 1.4,
  },
  slideStat: {
    fontFamily: font.displayBold,
    fontSize: 26,
    color: colors.ink,
    marginTop: 2,
  },
  slideUnit: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    letterSpacing: 0.6,
  },
  slideDetail: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    marginTop: 2,
  },
  shareBtn: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  shareBtnText: {
    fontFamily: font.displayBold,
    fontSize: 15,
    color: colors.bg,
  },
});
