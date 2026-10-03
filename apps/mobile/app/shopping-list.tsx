import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { PlanTabs } from "@/components/PlanTabs";
import { ApiError, api } from "@/lib/api";
import * as haptics from "@/lib/haptics";
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
  custom: "Added by you",
};

const CATEGORY_LABELS_AR: Record<string, string> = {
  produce: "خضار وفواكه",
  protein: "بروتين",
  dairy: "ألبان",
  grain: "حبوب وخبز",
  pantry: "مؤن",
  spice: "بهارات",
  other: "أخرى",
  custom: "أضفتها أنت",
};

const CATEGORY_TINT: Record<string, string> = {
  produce: colors.mint,
  protein: colors.gold,
  dairy: colors.ink,
  grain: colors.gold,
  pantry: colors.dim,
  spice: colors.coral,
  other: colors.dim,
  custom: colors.mint,
};

// Per-week AsyncStorage keys so a user who starts a Monday shop can
// return mid-week without losing their check-offs. Switching weeks
// scopes to a fresh state intentionally.
const checkedKey = (week: string) => `se7a_shopping_checked_${week}`;
const customKey = (week: string) => `se7a_shopping_custom_${week}`;

export default function ShoppingList() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const { week_start: weekStartParam } = useLocalSearchParams<{
    week_start?: string;
  }>();
  const week_start = weekStartParam || mondayOfCurrentWeek();
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [noPlan, setNoPlan] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [customItems, setCustomItems] = useState<string[]>([]);
  const [newItem, setNewItem] = useState("");
  // Guard: don't persist on the first checked-state render (that
  // would overwrite the stored state with the empty default).
  const hydrated = useRef(false);

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

  // Hydrate persisted state when week changes
  useEffect(() => {
    hydrated.current = false;
    (async () => {
      try {
        const [rawChecked, rawCustom] = await Promise.all([
          AsyncStorage.getItem(checkedKey(week_start)),
          AsyncStorage.getItem(customKey(week_start)),
        ]);
        setChecked(rawChecked ? JSON.parse(rawChecked) : {});
        setCustomItems(rawCustom ? JSON.parse(rawCustom) : []);
      } catch {
        setChecked({});
        setCustomItems([]);
      }
      hydrated.current = true;
    })();
  }, [week_start]);

  // Persist checked state on every change (post-hydrate)
  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(checkedKey(week_start), JSON.stringify(checked)).catch(
      () => {}
    );
  }, [checked, week_start]);

  // Persist custom items on every change (post-hydrate)
  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(
      customKey(week_start),
      JSON.stringify(customItems)
    ).catch(() => {});
  }, [customItems, week_start]);

  const toggle = (key: string) => {
    haptics.selection();
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const addCustom = () => {
    const name = newItem.trim();
    if (!name) return;
    // Dedupe case-insensitively against existing custom items so a
    // double-tap doesn't produce "Milk" twice.
    const existing = customItems.map((n) => n.toLowerCase());
    if (existing.includes(name.toLowerCase())) {
      setNewItem("");
      return;
    }
    setCustomItems((prev) => [...prev, name]);
    setNewItem("");
  };

  const removeCustom = (name: string) => {
    setCustomItems((prev) => prev.filter((n) => n !== name));
    setChecked((prev) => {
      const next = { ...prev };
      delete next[`custom:${name}`];
      return next;
    });
  };

  const resetChecks = () => {
    Alert.alert(
      isArabic ? "صفّر القائمة؟" : "Reset the list?",
      isArabic
        ? "ستتم إزالة علامات الاختيار. العناصر المضافة تبقى."
        : "All check-offs clear. Your custom items stay.",
      [
        { text: isArabic ? "إلغاء" : "Cancel", style: "cancel" },
        {
          text: isArabic ? "صفّر" : "Reset",
          style: "destructive",
          onPress: () => setChecked({}),
        },
      ]
    );
  };

  const shareList = async () => {
    if (!data) return;
    const labels = isArabic ? CATEGORY_LABELS_AR : CATEGORY_LABELS_EN;
    const lines: string[] = [];
    lines.push(isArabic ? "قائمة التسوق" : "Shopping list");
    lines.push(`${isArabic ? "أسبوع" : "Week"} ${week_start}`);
    lines.push("");
    for (const group of data.groups) {
      lines.push(`— ${labels[group.category] ?? group.category} —`);
      for (const it of group.items) {
        const key = `${group.category}:${it.name}`;
        const done = checked[key] ? "✓" : "□";
        lines.push(`  ${done} ${it.name} (${it.quantity_summary})`);
      }
      lines.push("");
    }
    if (customItems.length > 0) {
      lines.push(`— ${labels.custom} —`);
      for (const name of customItems) {
        const key = `custom:${name}`;
        const done = checked[key] ? "✓" : "□";
        lines.push(`  ${done} ${name}`);
      }
    }
    try {
      await Share.share({
        message: lines.join("\n"),
        title: isArabic ? "قائمة التسوق" : "Shopping list",
      });
    } catch {
      /* user cancelled */
    }
  };

  const labels = isArabic ? CATEGORY_LABELS_AR : CATEGORY_LABELS_EN;

  // Everything counted — plan items + custom items. Keeps the
  // "N / total collected" number honest once the user adds their
  // own things.
  const totalCount = useMemo(
    () => (data?.total_items ?? 0) + customItems.length,
    [data?.total_items, customItems.length]
  );
  const totalChecked = useMemo(
    () => Object.values(checked).filter(Boolean).length,
    [checked]
  );
  const canReset = totalChecked > 0;
  const canShare = !!data && (data.groups.length > 0 || customItems.length > 0);

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
      ) : !data || (data.groups.length === 0 && customItems.length === 0) ? (
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
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>
                {isArabic ? "تم جمعه" : "COLLECTED"}
              </Text>
              <Text style={styles.summaryNum}>
                {totalChecked}
                <Text style={styles.summarySlash}> / {totalCount}</Text>
              </Text>
            </View>
            <View style={styles.summaryActions}>
              <Pressable
                onPress={shareList}
                disabled={!canShare}
                style={[
                  styles.actionBtn,
                  !canShare && { opacity: 0.4 },
                ]}
              >
                <Ionicons
                  name="share-outline"
                  size={16}
                  color={colors.gold}
                />
                <Text style={styles.actionBtnLabel}>
                  {isArabic ? "شارك" : "Share"}
                </Text>
              </Pressable>
              <Pressable
                onPress={resetChecks}
                disabled={!canReset}
                style={[
                  styles.actionBtn,
                  !canReset && { opacity: 0.4 },
                ]}
              >
                <Ionicons name="refresh" size={16} color={colors.gold} />
                <Text style={styles.actionBtnLabel}>
                  {isArabic ? "صفّر" : "Reset"}
                </Text>
              </Pressable>
            </View>
          </View>

          {data?.groups.map((group) => (
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
                      <Text style={styles.itemQty}>
                        {item.quantity_summary}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}

          {customItems.length > 0 && (
            <View style={styles.groupCard}>
              <Text style={[styles.groupTitle, { color: CATEGORY_TINT.custom }]}>
                {labels.custom!.toUpperCase()}
              </Text>
              {customItems.map((name) => {
                const key = `custom:${name}`;
                const isOn = !!checked[key];
                return (
                  <View key={key} style={styles.itemRow}>
                    <Pressable
                      onPress={() => toggle(key)}
                      style={{ flexDirection: "row", flex: 1, alignItems: "center", gap: spacing.sm }}
                    >
                      <View
                        style={[styles.checkbox, isOn && styles.checkboxOn]}
                      >
                        {isOn && <Text style={styles.checkMark}>✓</Text>}
                      </View>
                      <Text
                        style={[styles.itemName, isOn && styles.itemNameDone]}
                      >
                        {name}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => removeCustom(name)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={
                        isArabic ? "احذف العنصر" : "Remove item"
                      }
                    >
                      <Ionicons
                        name="close"
                        size={16}
                        color={colors.dim}
                      />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.addCard}>
            <Text style={styles.addLabel}>
              {isArabic ? "أضف عنصرًا" : "Add an item"}
            </Text>
            <View style={styles.addRow}>
              <TextInput
                value={newItem}
                onChangeText={setNewItem}
                onSubmitEditing={addCustom}
                placeholder={
                  isArabic
                    ? "مثال: ورق مطبخ"
                    : "e.g. paper towels"
                }
                placeholderTextColor={colors.dim}
                style={styles.addInput}
                returnKeyType="done"
                maxLength={80}
              />
              <Pressable
                onPress={addCustom}
                disabled={!newItem.trim()}
                style={[
                  styles.addBtn,
                  !newItem.trim() && { opacity: 0.4 },
                ]}
              >
                <Ionicons name="add" size={20} color={colors.bg} />
              </Pressable>
            </View>
          </View>

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
  summaryRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "stretch",
  },
  summaryCard: {
    flex: 1,
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
  summaryActions: {
    gap: spacing.xs,
    justifyContent: "space-between",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: "rgba(246,183,60,0.10)",
  },
  actionBtnLabel: {
    fontFamily: font.bodyBold,
    fontSize: 12,
    color: colors.gold,
    letterSpacing: 0.3,
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
  addCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  addLabel: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    letterSpacing: 1.4,
  },
  addRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
  addInput: {
    flex: 1,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 14,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
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

function mondayOfCurrentWeek(): string {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
