import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { PlanTabs } from "@/components/PlanTabs";
import { ApiError, api } from "@/lib/api";
import { colors, font, radius, spacing } from "@/lib/theme";

interface Item {
  name: string;
  quantity_summary: string;
  category: string;
}

interface Group {
  category: string;
  items: Item[];
}

interface Response {
  week_start: string;
  total_items: number;
  groups: Group[];
}

const CATEGORY_LABELS_EN: Record<string, string> = {
  produce: "Produce",
  protein: "Protein",
  dairy: "Dairy",
  grain: "Grains & breads",
  pantry: "Pantry",
  spice: "Spices",
  other: "Other",
};

const CATEGORY_LABELS_AR: Record<string, string> = {
  produce: "خضار وفواكه",
  protein: "بروتين",
  dairy: "ألبان",
  grain: "حبوب وخبز",
  pantry: "مؤن",
  spice: "بهارات",
  other: "أخرى",
};

const CATEGORY_TINT: Record<string, string> = {
  produce: colors.mint,
  protein: colors.gold,
  dairy: colors.ink,
  grain: colors.gold,
  pantry: colors.dim,
  spice: colors.coral,
  other: colors.dim,
};

export default function ShoppingList() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const { week_start } = useLocalSearchParams<{ week_start?: string }>();
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [noPlan, setNoPlan] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!week_start) {
      setErr(isArabic ? "أسبوع غير محدد" : "No week specified");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr("");
    setNoPlan(false);
    try {
      const res = await api<Response>(
        `/api/meal-plan/shopping-list?week_start=${week_start}`
      );
      setData(res);
    } catch (e) {
      // 404 = plan not yet generated. Not an error — a real empty state.
      if (e instanceof ApiError && e.status === 404) {
        setNoPlan(true);
      } else {
        setErr(
          (e as Error).message ||
            (isArabic ? "تعذّر التحميل" : "Couldn't load the list.")
        );
      }
    }
    setLoading(false);
  }, [week_start, isArabic]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (key: string) => {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const labels = isArabic ? CATEGORY_LABELS_AR : CATEGORY_LABELS_EN;
  const totalChecked = Object.values(checked).filter(Boolean).length;

  return (
    <Screen>
      <View style={styles.head}>
        <BackButton />
        <Text style={styles.pageTitle}>{isArabic ? "الخطة" : "Plan"}</Text>
        <View style={{ width: 30 }} />
      </View>
      <PlanTabs
        active="groceries"
        onPlanner={() =>
          router.push({
            pathname: "/meal-plan",
            params: week_start ? { week_start } : {},
          })
        }
      />
      <Text style={styles.sub}>
        {isArabic
          ? "كل مكونات خطة الأسبوع، مرتبة حسب ممرات السوبرماركت."
          : "All ingredients from your weekly plan, sorted by grocery aisle."}
      </Text>

      {loading ? (
        <View style={{ paddingVertical: spacing.xl, alignItems: "center" }}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : noPlan ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyH}>
            {isArabic ? "لا خطة بعد" : "No plan yet"}
          </Text>
          <Text style={styles.emptyBody}>
            {isArabic
              ? "أنشئ خطة أسبوعية أولاً — ستظهر قائمة التسوق هنا تلقائياً."
              : "Generate a weekly meal plan first — the shopping list builds itself from those ingredients."}
          </Text>
          <View style={{ height: spacing.md }} />
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/meal-plan",
                params: { week_start },
              })
            }
            style={styles.goPlanBtn}
          >
            <Text style={styles.goPlanBtnLabel}>
              {isArabic ? "افتح مخطط الوجبات" : "Open Meal Planner"}
            </Text>
          </Pressable>
        </View>
      ) : err ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyH}>
            {isArabic ? "لم نتمكن من إنشاء القائمة" : "Couldn't build the list"}
          </Text>
          <Text style={styles.emptyBody}>{err}</Text>
        </View>
      ) : !data || data.groups.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyH}>
            {isArabic ? "لا شيء بعد" : "Nothing here yet"}
          </Text>
          <Text style={styles.emptyBody}>
            {isArabic
              ? "خطتك لا تحتوي على مكونات لعرضها."
              : "Your plan doesn't have any ingredients to show."}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>
              {isArabic ? "المجموع" : "TOTAL ITEMS"}
            </Text>
            <Text style={styles.summaryNum}>
              {totalChecked}
              <Text style={styles.summarySlash}> / {data.total_items}</Text>
            </Text>
            <Text style={styles.summarySub}>
              {isArabic ? "مُجمّع" : "collected"}
            </Text>
          </View>

          {data.groups.map((group) => (
            <View key={group.category} style={styles.groupCard}>
              <Text
                style={[
                  styles.groupTitle,
                  { color: CATEGORY_TINT[group.category] ?? colors.ink },
                ]}
              >
                {(labels[group.category] ?? group.category).toUpperCase()}
              </Text>
              {group.items.map((item) => {
                const key = `${group.category}:${item.name}`;
                const isOn = !!checked[key];
                return (
                  <Pressable
                    key={key}
                    onPress={() => toggle(key)}
                    style={styles.itemRow}
                  >
                    <View
                      style={[styles.checkbox, isOn && styles.checkboxOn]}
                    >
                      {isOn && <Text style={styles.checkMark}>✓</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.itemName, isOn && styles.itemNameDone]}
                      >
                        {item.name}
                      </Text>
                      <Text style={styles.itemQty}>{item.quantity_summary}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}

          <Text style={styles.footNote}>
            {isArabic
              ? "الكميات تقريبية — العلامة × N تعني أن المكوّن يظهر في N وجبات."
              : "Quantities are approximate — “× N meals” means the ingredient appears in that many meals."}
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pageTitle: {
    fontFamily: font.displayBold,
    fontSize: 22,
    color: colors.ink,
  },
  kicker: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  h1: {
    fontFamily: font.displayBold,
    fontSize: 28,
    color: colors.ink,
  },
  sub: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
    lineHeight: 21,
  },
  emptyCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
    gap: 6,
  },
  emptyH: {
    fontFamily: font.displayBold,
    fontSize: 20,
    color: colors.ink,
  },
  emptyBody: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
    lineHeight: 21,
    textAlign: "center",
  },
  goPlanBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: "rgba(246,183,60,0.10)",
  },
  goPlanBtnLabel: {
    fontFamily: font.displayBold,
    fontSize: 14,
    color: colors.gold,
    letterSpacing: 0.5,
  },
  summaryCard: {
    backgroundColor: colors.panel2,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  summaryLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
  },
  summaryNum: {
    fontFamily: font.displayBold,
    fontSize: 24,
    color: colors.gold,
    marginTop: 2,
  },
  summarySlash: {
    fontFamily: font.mono,
    fontSize: 14,
    color: colors.dim,
  },
  summarySub: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
  },
  groupCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  groupTitle: {
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1.4,
    marginBottom: 4,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: {
    borderColor: colors.gold,
    backgroundColor: "rgba(246,183,60,0.15)",
  },
  checkMark: {
    fontFamily: font.displayBold,
    fontSize: 14,
    color: colors.gold,
    lineHeight: 16,
  },
  itemName: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.ink,
  },
  itemNameDone: {
    color: colors.dim,
    textDecorationLine: "line-through",
  },
  itemQty: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    marginTop: 2,
  },
  footNote: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
    lineHeight: 18,
    textAlign: "center",
    paddingHorizontal: spacing.md,
  },
});
