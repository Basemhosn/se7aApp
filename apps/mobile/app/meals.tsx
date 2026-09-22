import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * Meals hub — 3-tab shell that unifies the previously-scattered
 * nutrition surfaces:
 *   • Now      → per-meal recommendations from /meals-suggest
 *   • Week     → the 7-day planner + groceries from /meal-plan
 *   • Recipes  → the Gulf recipe catalog from /recipes
 *
 * Each tab renders a summary card + a CTA that pushes into the
 * corresponding detail screen. Consolidation goal: users stop
 * feeling like there are three parallel food features that half
 * do the same thing. Detail screens remain accessible directly
 * so existing deep links keep working.
 */

type Tab = "now" | "week" | "recipes";

export default function MealsHub() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [tab, setTab] = useState<Tab>("now");

  return (
    <Screen>
      <View style={styles.head}>
        <BackButton />
        <Text style={styles.title}>{isArabic ? "الوجبات" : "Meals"}</Text>
        <View style={{ width: 30 }} />
      </View>

      <View style={styles.tabRow}>
        <TabBtn
          label={isArabic ? "الآن" : "Now"}
          active={tab === "now"}
          onPress={() => setTab("now")}
        />
        <TabBtn
          label={isArabic ? "الأسبوع" : "Week"}
          active={tab === "week"}
          onPress={() => setTab("week")}
        />
        <TabBtn
          label={isArabic ? "وصفات" : "Recipes"}
          active={tab === "recipes"}
          onPress={() => setTab("recipes")}
        />
      </View>

      {tab === "now" ? (
        <HubCard
          icon="sparkles-outline"
          kicker={isArabic ? "توصيات فورية" : "RIGHT NOW"}
          title={
            isArabic
              ? "ماذا يجب أن آكل الآن؟"
              : "What should I eat right now?"
          }
          body={
            isArabic
              ? "توصيات مبنية على ماكروك المتبقي اليوم وتفضيلاتك."
              : "AI picks 3-5 meals that fit your remaining daily macros and preferences."
          }
          ctaLabel={
            isArabic ? "احصل على توصيات" : "Get recommendations"
          }
          onCta={() => router.push("/meals-suggest")}
        />
      ) : tab === "week" ? (
        <HubCard
          icon="calendar-outline"
          kicker={isArabic ? "خطة الأسبوع" : "THIS WEEK"}
          title={
            isArabic
              ? "خطة سبعة أيام + قائمة تسوق"
              : "7-day plan + shopping list"
          }
          body={
            isArabic
              ? "SE7A يبني لك أسبوعاً كاملاً يناسب هدفك، ويحوّله لقائمة تسوق مرتبة."
              : "SE7A builds a full week that fits your goals, then rolls it into a supermarket-aisle grocery list."
          }
          ctaLabel={
            isArabic ? "افتح الخطة" : "Open planner"
          }
          onCta={() => router.push("/meal-plan")}
        />
      ) : (
        <HubCard
          icon="restaurant-outline"
          kicker={isArabic ? "وصفات الخليج" : "GULF-FIRST"}
          title={
            isArabic ? "وصفات جاهزة للطبخ" : "Curated recipes"
          }
          body={
            isArabic
              ? "وصفات كلاسيكية بنطاقات ماكرو صادقة. تسجّلها بضغطة."
              : "Classic Gulf dishes with honest macro ranges. Log in one tap."
          }
          ctaLabel={
            isArabic ? "تصفّح الوصفات" : "Browse recipes"
          }
          onCta={() => router.push("/recipes")}
        />
      )}
    </Screen>
  );
}

function TabBtn({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tabBtn, active && styles.tabBtnActive]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function HubCard({
  icon,
  kicker,
  title,
  body,
  ctaLabel,
  onCta,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  kicker: string;
  title: string;
  body: string;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={28} color={colors.gold} />
      </View>
      <Text style={styles.kicker}>{kicker}</Text>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
      <Pressable
        onPress={onCta}
        style={styles.cta}
        accessibilityRole="button"
        accessibilityLabel={ctaLabel}
      >
        <Text style={styles.ctaLabel}>{ctaLabel}</Text>
        <Ionicons name="arrow-forward" size={16} color={colors.bg} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  title: {
    fontFamily: font.displayBold,
    fontSize: 22,
    color: colors.ink,
  },
  tabRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    backgroundColor: colors.panel2,
  },
  tabBtnActive: {
    borderColor: colors.gold,
    backgroundColor: colors.gold + "18",
  },
  tabText: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
    letterSpacing: 1,
  },
  tabTextActive: {
    color: colors.gold,
  },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: "center",
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.gold + "18",
    borderWidth: 1,
    borderColor: colors.gold + "44",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  kicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  cardTitle: {
    fontFamily: font.displayBold,
    fontSize: 22,
    color: colors.ink,
    textAlign: "center",
    lineHeight: 28,
  },
  cardBody: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
    lineHeight: 21,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.gold,
  },
  ctaLabel: {
    fontFamily: font.displayBold,
    fontSize: 15,
    color: colors.bg,
  },
});
