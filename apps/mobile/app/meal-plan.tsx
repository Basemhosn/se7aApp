import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { BackButton } from "@/components/BackButton";
import {
  api,
  ProRequiredError,
  RateLimitedError,
  rateLimitMessage,
} from "@/lib/api";
import { colors, font, radius, spacing } from "@/lib/theme";

interface PlannedMeal {
  slot: "breakfast" | "lunch" | "dinner" | "snack";
  name: string;
  portion: string;
  kcal_low: number;
  kcal_high: number;
  protein_g_low: number;
  protein_g_high: number;
  carb_g_low: number;
  carb_g_high: number;
  fat_g_low: number;
  fat_g_high: number;
  ingredients: { name: string; qty: string }[];
  logged_meal_item_id?: number | null;
}

interface PlannedDay {
  day_of_week: number;
  meals: PlannedMeal[];
}

interface Plan {
  days: PlannedDay[];
  notes?: string[];
}

const DAY_LABELS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LABELS_AR = ["ن", "ث", "ر", "خ", "ج", "س", "ح"];

function mondayOf(date: Date): string {
  const d = new Date(date);
  const dow = d.getDay(); // 0 = Sunday
  const daysSinceMonday = (dow + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function MealPlan() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [weekStart, setWeekStart] = useState<string>(mondayOf(new Date()));
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [loggingKey, setLoggingKey] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [selectedDay, setSelectedDay] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await api<{ plan: Plan | null }>(
        `/api/meal-plan?week_start=${weekStart}`
      );
      setPlan(res.plan);
    } catch {
      setPlan(null);
    }
    setLoading(false);
  }, [weekStart]);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async () => {
    setGenerating(true);
    setErr("");
    try {
      const res = await api<{ plan: Plan }>("/api/meal-plan/generate", {
        method: "POST",
        body: JSON.stringify({ week_start: weekStart }),
      });
      setPlan(res.plan);
    } catch (e) {
      if (e instanceof ProRequiredError) {
        router.push({
          pathname: "/paywall",
          params: { feature: "meal_plan" },
        });
      } else if (e instanceof RateLimitedError) {
        const { title, body } = rateLimitMessage(e);
        Alert.alert(title, body);
      } else {
        setErr((e as Error).message || "Couldn't generate.");
      }
    }
    setGenerating(false);
  };

  const logMeal = async (dayOfWeek: number, slot: PlannedMeal["slot"]) => {
    const key = `${dayOfWeek}-${slot}`;
    setLoggingKey(key);
    try {
      await api("/api/meal-plan/log", {
        method: "POST",
        body: JSON.stringify({
          week_start: weekStart,
          day_of_week: dayOfWeek,
          slot,
        }),
      });
      await load();
    } catch (e) {
      Alert.alert(
        isArabic ? "تعذّر التسجيل" : "Couldn't log",
        (e as Error).message
      );
    }
    setLoggingKey(null);
  };

  const dayLabels = isArabic ? DAY_LABELS_AR : DAY_LABELS_EN;
  const today = new Date();
  const todayDow = (today.getDay() + 6) % 7;
  const displayDay = plan?.days.find((d) => d.day_of_week === selectedDay);
  const dayKcalLow = displayDay?.meals.reduce((s, m) => s + m.kcal_low, 0) ?? 0;
  const dayKcalHigh = displayDay?.meals.reduce((s, m) => s + m.kcal_high, 0) ?? 0;

  return (
    <Screen>
      <View style={styles.head}>
        <BackButton />
      </View>
      <Text style={styles.kicker}>
        {isArabic ? "خطة الأسبوع" : "WEEKLY PLAN"}
      </Text>
      <Text style={styles.h1}>
        {isArabic ? "أسبوعك مخطط له" : "Your week, planned."}
      </Text>
      <Text style={styles.sub}>
        {isArabic
          ? "خطة معدة بالذكاء الاصطناعي تصيب أهدافك اليومية، مع قائمة تسوق تلقائية."
          : "AI-planned meals that hit your daily targets, with an auto-generated shopping list."}
      </Text>

      {loading ? (
        <View style={{ paddingVertical: spacing.xl, alignItems: "center" }}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : !plan ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyH}>
            {isArabic ? "لا توجد خطة بعد" : "No plan yet"}
          </Text>
          <Text style={styles.emptyBody}>
            {isArabic
              ? "خذ ٣٠ ثانية واصنع خطة أسبوع كاملة تناسب ماكروك."
              : "Give SE7A 30 seconds and it'll build a full week that fits your macros."}
          </Text>
          <View style={{ height: spacing.md }} />
          <Btn
            label={
              generating
                ? isArabic
                  ? "جارٍ الإنشاء…"
                  : "Building your week…"
                : isArabic
                  ? "أنشئ خطتي"
                  : "Build my plan"
            }
            onPress={generate}
            loading={generating}
          />
          {!!err && <Text style={styles.err}>{err}</Text>}
        </View>
      ) : (
        <>
          <View style={styles.dayTabs}>
            {plan.days.map((d) => (
              <Pressable
                key={d.day_of_week}
                onPress={() => setSelectedDay(d.day_of_week)}
                style={[
                  styles.dayTab,
                  selectedDay === d.day_of_week && styles.dayTabOn,
                  todayDow === d.day_of_week && styles.dayTabToday,
                ]}
              >
                <Text
                  style={[
                    styles.dayTabLabel,
                    selectedDay === d.day_of_week && styles.dayTabLabelOn,
                  ]}
                >
                  {dayLabels[d.day_of_week]}
                </Text>
              </Pressable>
            ))}
          </View>

          {displayDay && (
            <>
              <View style={styles.dayTotalCard}>
                <Text style={styles.dayTotalKicker}>
                  {isArabic ? "إجمالي اليوم" : "DAY TOTAL"}
                </Text>
                <Text style={styles.dayTotalKcal}>
                  {dayKcalLow}–{dayKcalHigh}
                  <Text style={styles.dayTotalUnit}> kcal</Text>
                </Text>
              </View>

              {displayDay.meals.map((meal) => {
                const key = `${displayDay.day_of_week}-${meal.slot}`;
                const logged = !!meal.logged_meal_item_id;
                return (
                  <View
                    key={key}
                    style={[styles.mealCard, logged && styles.mealCardDone]}
                  >
                    <Text style={styles.mealSlot}>
                      {meal.slot.toUpperCase()}
                    </Text>
                    <Text style={styles.mealName}>{meal.name}</Text>
                    <Text style={styles.mealPortion}>{meal.portion}</Text>
                    <Text style={styles.mealKcal}>
                      {meal.kcal_low}–{meal.kcal_high}
                      <Text style={styles.mealKcalUnit}> kcal</Text>
                      <Text style={styles.mealMacros}>
                        {"  ·  "}P {meal.protein_g_low}–{meal.protein_g_high}
                      </Text>
                    </Text>
                    {logged ? (
                      <Text style={styles.doneBadge}>
                        ✓ {isArabic ? "مسجل" : "logged"}
                      </Text>
                    ) : (
                      <Pressable
                        onPress={() => logMeal(displayDay.day_of_week, meal.slot)}
                        disabled={loggingKey === key}
                        style={styles.logBtn}
                      >
                        <Text style={styles.logBtnLabel}>
                          {loggingKey === key
                            ? isArabic
                              ? "جارٍ التسجيل…"
                              : "Logging…"
                            : isArabic
                              ? "سجّل الأكلة"
                              : "Mark as eaten"}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </>
          )}

          {plan.notes && plan.notes.length > 0 && (
            <View style={styles.notesCard}>
              <Text style={styles.notesLabel}>
                {isArabic ? "ملاحظات" : "NOTES"}
              </Text>
              {plan.notes.map((n, i) => (
                <Text key={i} style={styles.notesBody}>
                  · {n}
                </Text>
              ))}
            </View>
          )}

          <Btn
            label={isArabic ? "قائمة التسوق" : "Shopping list"}
            variant="ghost"
            onPress={() =>
              router.push({
                pathname: "/shopping-list",
                params: { week_start: weekStart },
              })
            }
          />
          <Btn
            label={
              generating
                ? isArabic
                  ? "جارٍ التحديث…"
                  : "Rebuilding…"
                : isArabic
                  ? "خطة جديدة لهذا الأسبوع"
                  : "Rebuild this week"
            }
            variant="ghost"
            onPress={generate}
            loading={generating}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { marginTop: spacing.sm },
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
  dayTabs: {
    flexDirection: "row",
    gap: 4,
  },
  dayTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
  },
  dayTabOn: {
    borderColor: colors.gold,
    backgroundColor: "rgba(246,183,60,0.10)",
  },
  dayTabToday: {
    borderColor: colors.mint,
  },
  dayTabLabel: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
  },
  dayTabLabelOn: {
    color: colors.gold,
  },
  dayTotalCard: {
    backgroundColor: colors.panel2,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  dayTotalKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
  },
  dayTotalKcal: {
    fontFamily: font.displayBold,
    fontSize: 22,
    color: colors.ink,
    marginTop: 2,
  },
  dayTotalUnit: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
  },
  mealCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  mealCardDone: {
    borderColor: colors.mint,
    backgroundColor: "rgba(93,202,165,0.04)",
  },
  mealSlot: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  mealName: {
    fontFamily: font.displayBold,
    fontSize: 17,
    color: colors.ink,
    marginTop: 2,
  },
  mealPortion: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
  },
  mealKcal: {
    fontFamily: font.displayBold,
    fontSize: 15,
    color: colors.gold,
    marginTop: 6,
  },
  mealKcalUnit: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
  },
  mealMacros: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
  },
  logBtn: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: "rgba(246,183,60,0.10)",
  },
  logBtnLabel: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1,
  },
  doneBadge: {
    marginTop: spacing.sm,
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.mint,
    letterSpacing: 1,
  },
  notesCard: {
    backgroundColor: colors.panel2,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  notesLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
  },
  notesBody: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 19,
  },
  err: { color: colors.coral, fontFamily: font.body, fontSize: 13 },
});
