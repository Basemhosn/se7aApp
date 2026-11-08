import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { api } from "@/lib/api";
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * Home-tab getting-started checklist for new users. Replaces the
 * 4-slide tutorial — items auto-check from real app usage (first
 * scan, first chat message, first meal plan). The card self-hides
 * when everything is done, when the user explicitly dismisses, or
 * after 30 days from onboarding.
 *
 * Fetches on mount AND on every focus of Home so completing an item
 * (e.g. scanning a plate) checks itself as soon as the user comes
 * back. Server computes the `show` flag so the client doesn't have
 * to duplicate the window / all-done logic.
 */

type ItemKey =
  | "scan_plate"
  | "scan_menu"
  | "body_scan"
  | "coach"
  | "meal_plan";

interface ChecklistResponse {
  items: Record<ItemKey, boolean>;
  dismissed_at: string | null;
  show: boolean;
}

type IoniconName = keyof typeof Ionicons.glyphMap;

interface ItemDef {
  key: ItemKey;
  icon: IoniconName;
  title: string;
  titleAr: string;
  route: string;
}

const ITEMS: ItemDef[] = [
  {
    key: "scan_plate",
    icon: "scan-outline",
    title: "Scan a plate",
    titleAr: "امسح طبقاً",
    route: "/scan/plate",
  },
  {
    key: "coach",
    icon: "chatbubbles-outline",
    title: "Ask the coach",
    titleAr: "اسأل المدرب",
    route: "/(tabs)/coach",
  },
  {
    key: "scan_menu",
    icon: "restaurant-outline",
    title: "Scan a menu",
    titleAr: "امسح قائمة طعام",
    route: "/scan/menu",
  },
  {
    key: "meal_plan",
    icon: "calendar-outline",
    title: "Generate a meal plan",
    titleAr: "أنشئ خطة وجبات",
    route: "/meal-plan",
  },
  {
    key: "body_scan",
    icon: "body-outline",
    title: "Try a body scan",
    titleAr: "جرب فحص الجسم",
    route: "/scan/body",
  },
];

export function OnboardingChecklist({ isArabic }: { isArabic: boolean }) {
  const [state, setState] = useState<ChecklistResponse | null>(null);
  const [dismissing, setDismissing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<ChecklistResponse>("/api/onboarding/checklist");
      setState(res);
    } catch {
      // Silent — checklist is a nice-to-have, not critical. If the
      // endpoint errors (404 before API deploys, network blip), just
      // don't render the card.
      setState(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const dismiss = useCallback(async () => {
    setDismissing(true);
    try {
      await api("/api/onboarding/checklist/dismiss", { method: "POST" });
      setState((s) => (s ? { ...s, show: false } : s));
    } catch (e) {
      Alert.alert(
        isArabic ? "خطأ" : "Error",
        (e as Error)?.message ?? "could not dismiss"
      );
    } finally {
      setDismissing(false);
    }
  }, [isArabic]);

  if (!state?.show) return null;

  const completed = Object.values(state.items).filter(Boolean).length;
  const total = ITEMS.length;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>
            {isArabic ? "ابدأ هنا" : "GET STARTED"}
          </Text>
          <Text style={styles.title}>
            {isArabic
              ? `أكمل ${completed} من ${total}`
              : `${completed} of ${total} complete`}
          </Text>
        </View>
        <Pressable
          onPress={dismiss}
          disabled={dismissing}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={isArabic ? "إخفاء" : "Dismiss"}
        >
          <Ionicons name="close" size={18} color={colors.dim} />
        </Pressable>
      </View>
      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.round((completed / total) * 100)}%` },
          ]}
        />
      </View>
      <View style={styles.items}>
        {ITEMS.map((item) => {
          const done = state.items[item.key];
          return (
            <Pressable
              key={item.key}
              style={styles.item}
              onPress={() => router.push(item.route as never)}
              accessibilityRole="button"
              accessibilityLabel={isArabic ? item.titleAr : item.title}
            >
              <View
                style={[
                  styles.checkCircle,
                  done && styles.checkCircleDone,
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark" size={14} color={colors.bg} />
                ) : (
                  <Ionicons name={item.icon} size={14} color={colors.dim} />
                )}
              </View>
              <Text
                style={[
                  styles.itemText,
                  done && styles.itemTextDone,
                ]}
              >
                {isArabic ? item.titleAr : item.title}
              </Text>
              {!done ? (
                <Ionicons
                  name={isArabic ? "chevron-back" : "chevron-forward"}
                  size={16}
                  color={colors.dim}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: spacing.sm,
  },
  kicker: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.gold,
    marginBottom: 2,
  },
  title: {
    fontFamily: font.displayBold,
    fontSize: 16,
    color: colors.ink,
  },
  progressBar: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.line,
    overflow: "hidden",
    marginBottom: spacing.md,
  },
  progressFill: {
    height: 3,
    backgroundColor: colors.gold,
    borderRadius: 2,
  },
  items: {
    gap: 2,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleDone: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  itemText: {
    flex: 1,
    fontFamily: font.body,
    fontSize: 15,
    color: colors.ink,
  },
  itemTextDone: {
    color: colors.dim,
    textDecorationLine: "line-through",
  },
});
