import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, font, spacing } from "@/lib/theme";

/**
 * Segmented control shared between /meal-plan and /shopping-list so
 * both screens feel like tabs on one "Plan" surface. Active tab is
 * inert; inactive tab routes to the other screen (parent decides
 * how — the routes need a week_start param).
 */
export function PlanTabs({
  active,
  onGroceries,
  onPlanner,
}: {
  active: "planner" | "groceries";
  onPlanner?: () => void;
  onGroceries?: () => void;
}) {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  return (
    <View style={styles.row}>
      <Pressable
        onPress={active === "planner" ? undefined : onPlanner}
        style={[styles.tab, active === "planner" && styles.tabActive]}
      >
        <Text
          style={[
            styles.label,
            active === "planner" && styles.labelActive,
          ]}
        >
          {isArabic ? "مخطط الوجبات" : "Meal Planner"}
        </Text>
        {active === "planner" && <View style={styles.underline} />}
      </Pressable>
      <Pressable
        onPress={active === "groceries" ? undefined : onGroceries}
        style={[styles.tab, active === "groceries" && styles.tabActive]}
      >
        <Text
          style={[
            styles.label,
            active === "groceries" && styles.labelActive,
          ]}
        >
          {isArabic ? "قائمة التسوق" : "Groceries"}
        </Text>
        {active === "groceries" && <View style={styles.underline} />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    gap: spacing.lg,
  },
  tab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: 4,
    position: "relative",
  },
  tabActive: {
    /* underline positioned absolutely below */
  },
  label: {
    fontFamily: font.body,
    fontSize: 15,
    color: colors.dim,
  },
  labelActive: {
    color: colors.ink,
    fontFamily: font.bodyBold,
  },
  underline: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -1,
    height: 2,
    backgroundColor: colors.gold,
  },
});
