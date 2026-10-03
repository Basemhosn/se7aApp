import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { BackButton } from "@/components/BackButton";
import { api } from "@/lib/api";
import { colors, font, radius, spacing } from "@/lib/theme";

type BadgeTier = "bronze" | "silver" | "gold" | "platinum";
type BadgeCategory =
  | "firsts"
  | "streaks"
  | "meals"
  | "water"
  | "goals"
  | "weight"
  | "workouts"
  | "referrals"
  | "fun"
  | "anniversaries";

interface BadgeRow {
  key: string;
  icon: string;
  tier: BadgeTier;
  category: BadgeCategory;
  earned_at: string | null;
  seen: boolean;
}

interface BadgesResponse {
  badges: BadgeRow[];
}

// Ordering drives the on-screen section order — "firsts" and
// "streaks" come first because they're the earliest-unlockable and
// most motivating for new users.
const CATEGORY_ORDER: BadgeCategory[] = [
  "firsts",
  "streaks",
  "meals",
  "water",
  "goals",
  "weight",
  "workouts",
  "referrals",
  "fun",
  "anniversaries",
];

const TIER_COLOR: Record<BadgeTier, string> = {
  bronze: "#b47a3a",
  silver: "#a9b0a3",
  gold: colors.gold,
  platinum: "#c7ddff",
};

export default function Achievements() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [badges, setBadges] = useState<BadgeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api<BadgesResponse>("/api/badges");
      setBadges(res.badges);
      // Mark unseen earned badges as seen so the Home toast stops
      // reappearing after the user has visited this screen.
      const toSeen = res.badges
        .filter((b) => b.earned_at && !b.seen)
        .map((b) => b.key);
      if (toSeen.length > 0) {
        api("/api/badges", {
          method: "POST",
          body: JSON.stringify({ mark_seen: toSeen }),
        }).catch(() => {});
      }
    } catch {
      /* empty */
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const grouped = useMemo(() => {
    const map = new Map<BadgeCategory, BadgeRow[]>();
    for (const b of badges) {
      const list = map.get(b.category) ?? [];
      list.push(b);
      map.set(b.category, list);
    }
    // Within each category: unlocked first (newest earned at top),
    // then locked badges in catalog order.
    for (const [k, list] of map) {
      list.sort((a, b) => {
        if (!!a.earned_at !== !!b.earned_at) return a.earned_at ? -1 : 1;
        if (a.earned_at && b.earned_at) {
          return b.earned_at.localeCompare(a.earned_at);
        }
        return 0;
      });
      map.set(k, list);
    }
    return CATEGORY_ORDER
      .filter((c) => map.has(c))
      .map((c) => ({ category: c, items: map.get(c)! }));
  }, [badges]);

  const earnedCount = badges.filter((b) => b.earned_at).length;
  const totalCount = badges.length;

  return (
    <SafeAreaView style={styles.shell} edges={["top", "bottom"]}>
      <View style={styles.headRow}>
        <BackButton />
        <Text style={styles.headTitle}>{t("achievements.title")}</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={(g) => g.category}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <HeroCard
              earned={earnedCount}
              total={totalCount}
              isArabic={isArabic}
            />
          }
          renderItem={({ item }) => (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {t(`achievements.category_${item.category}`)}
              </Text>
              <View style={styles.grid}>
                {item.items.map((b) => (
                  <BadgeTile key={b.key} badge={b} isArabic={isArabic} t={t} />
                ))}
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function HeroCard({
  earned,
  total,
  isArabic,
}: {
  earned: number;
  total: number;
  isArabic: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.hero}>
      <View style={styles.heroIconWrap}>
        <Ionicons name="trophy" size={28} color={colors.gold} />
      </View>
      <Text style={styles.heroValue}>
        {t("achievements.earned_count", { earned, total })}
      </Text>
      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            { width: `${total > 0 ? (earned / total) * 100 : 0}%` },
          ]}
        />
      </View>
      {isArabic ? null : (
        <Text style={styles.heroSub}>Keep logging to unlock more.</Text>
      )}
    </View>
  );
}

function BadgeTile({
  badge,
  isArabic,
  t,
}: {
  badge: BadgeRow;
  isArabic: boolean;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const earned = !!badge.earned_at;
  const title = t(`achievements.catalog.${badge.key}.t`);
  const desc = t(`achievements.catalog.${badge.key}.d`);
  const tierColor = TIER_COLOR[badge.tier];
  const earnedDate = badge.earned_at
    ? new Date(badge.earned_at).toLocaleDateString(isArabic ? "ar" : "en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <View style={styles.tile}>
      <View
        style={[
          styles.iconCircle,
          earned
            ? { backgroundColor: tierColor + "22", borderColor: tierColor }
            : { backgroundColor: colors.panel2, borderColor: colors.line },
        ]}
      >
        <Ionicons
          name={badge.icon as keyof typeof Ionicons.glyphMap}
          size={22}
          color={earned ? tierColor : colors.dim}
        />
      </View>
      <Text
        style={[styles.tileTitle, !earned && styles.tileTitleLocked]}
        numberOfLines={1}
      >
        {title}
      </Text>
      <Text
        style={[styles.tileDesc, !earned && styles.tileDescLocked]}
        numberOfLines={2}
      >
        {earned && earnedDate
          ? t("achievements.earned_on", { date: earnedDate })
          : desc}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headTitle: {
    color: colors.ink,
    fontFamily: font.displayBold,
    fontSize: 22,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
    gap: spacing.lg,
  },
  // Hero
  hero: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  heroIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.gold + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  heroValue: {
    color: colors.ink,
    fontFamily: font.displayBold,
    fontSize: 20,
  },
  heroSub: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 12,
  },
  progressBar: {
    height: 6,
    width: "100%",
    borderRadius: 3,
    backgroundColor: colors.panel2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.gold,
  },
  // Section
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.dim,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  tile: {
    width: "48%",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
    minHeight: 128,
    alignItems: "center",
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  tileTitle: {
    color: colors.ink,
    fontFamily: font.bodyBold,
    fontSize: 13,
    textAlign: "center",
  },
  tileTitleLocked: {
    color: colors.dim,
  },
  tileDesc: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 11,
    textAlign: "center",
    lineHeight: 15,
  },
  tileDescLocked: {
    color: colors.dim,
  },
});
