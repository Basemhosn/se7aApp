import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { BackButton } from "@/components/BackButton";
import { PlanTabs } from "@/components/PlanTabs";
import { markDayDirty } from "@/lib/calendarCache";
import { useFoodImage } from "@/lib/useFoodImage";
import {
  api,
  ProRequiredError,
  RateLimitedError,
  rateLimitMessage,
} from "@/lib/api";
import { colors, font, radius, spacing } from "@/lib/theme";

type Slot = "breakfast" | "lunch" | "dinner" | "snack";

interface PlannedMeal {
  slot: Slot;
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

const DAY_LABELS_EN = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const DAY_LABELS_AR = [
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
  "الأحد",
];

const SLOT_META: Record<
  Slot,
  { icon: keyof typeof Ionicons.glyphMap; tint: string; en: string; ar: string }
> = {
  breakfast: { icon: "sunny", tint: colors.gold, en: "BREAKFAST", ar: "الفطور" },
  lunch: { icon: "restaurant", tint: colors.coral, en: "LUNCH", ar: "الغداء" },
  dinner: { icon: "moon", tint: "#8b7dd6", en: "DINNER", ar: "العشاء" },
  snack: { icon: "leaf", tint: colors.mint, en: "SNACK", ar: "وجبة خفيفة" },
};

function mondayOf(date: Date): string {
  const d = new Date(date);
  const dow = d.getDay();
  const daysSinceMonday = (dow + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDayHeader(dow: number, weekStart: string, isArabic: boolean): string {
  const dayName = (isArabic ? DAY_LABELS_AR : DAY_LABELS_EN)[dow] ?? "";
  const [y, m, d] = weekStart.split("-").map(Number);
  const monday = new Date(y!, (m ?? 1) - 1, d ?? 1);
  monday.setDate(monday.getDate() + dow);
  const dayNum = monday.getDate();
  const monthShort = monday.toLocaleString(isArabic ? "ar" : "en", {
    month: "short",
  });
  return isArabic ? `${dayName} · ${dayNum} ${monthShort}` : `${dayName}, ${monthShort} ${dayNum}`;
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

  const logMeal = async (dayOfWeek: number, slot: Slot) => {
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
      markDayDirty();
      await load();
    } catch (e) {
      Alert.alert(
        isArabic ? "تعذّر التسجيل" : "Couldn't log",
        (e as Error).message
      );
    }
    setLoggingKey(null);
  };

  const today = new Date();
  const todayDow = (today.getDay() + 6) % 7;

  return (
    <Screen>
      <View style={styles.head}>
        <BackButton />
        <Text style={styles.title}>{isArabic ? "الخطة" : "Plan"}</Text>
        <View style={{ width: 30 }} />
      </View>

      <PlanTabs
        active="planner"
        onGroceries={() =>
          router.push({
            pathname: "/shopping-list",
            params: { week_start: weekStart },
          })
        }
      />

      {plan && (
        <View style={styles.actionRow}>
          <ActionBtn
            icon="refresh"
            label={
              generating
                ? isArabic
                  ? "…"
                  : "…"
                : isArabic
                  ? "خطة جديدة"
                  : "Rebuild"
            }
            onPress={generate}
            disabled={generating}
          />
          <ActionBtn
            icon="cart-outline"
            label={isArabic ? "قائمة التسوق" : "Groceries"}
            onPress={() =>
              router.push({
                pathname: "/shopping-list",
                params: { week_start: weekStart },
              })
            }
          />
        </View>
      )}

      {loading ? (
        <View style={{ paddingVertical: spacing.xl, alignItems: "center" }}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : !plan ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="calendar" size={40} color={colors.gold} />
          </View>
          <Text style={styles.emptyH}>
            {isArabic ? "لا خطة لهذا الأسبوع" : "No plan yet"}
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
                  : "Create meal plan"
            }
            onPress={generate}
            loading={generating}
          />
          {!!err && <Text style={styles.err}>{err}</Text>}
        </View>
      ) : (
        <>
          {plan.days.map((day) => {
            const dayKcalLow = day.meals.reduce(
              (s, m) => s + m.kcal_low,
              0
            );
            const dayKcalHigh = day.meals.reduce(
              (s, m) => s + m.kcal_high,
              0
            );
            const isToday = day.day_of_week === todayDow;
            return (
              <View key={day.day_of_week} style={styles.daySection}>
                <View style={styles.dayHead}>
                  <Text style={[styles.dayName, isToday && styles.dayNameToday]}>
                    {formatDayHeader(day.day_of_week, weekStart, isArabic)}
                    {isToday && (
                      <Text style={styles.todayPill}>
                        {isArabic ? "  · اليوم" : "  · today"}
                      </Text>
                    )}
                  </Text>
                  <Text style={styles.dayKcal}>
                    {dayKcalLow}–{dayKcalHigh} kcal
                  </Text>
                </View>
                {day.meals.map((meal) => {
                  const key = `${day.day_of_week}-${meal.slot}`;
                  const logged = !!meal.logged_meal_item_id;
                  const meta = SLOT_META[meal.slot];
                  return (
                    <MealCard
                      key={key}
                      meal={meal}
                      meta={meta}
                      logged={logged}
                      logging={loggingKey === key}
                      isArabic={isArabic}
                      onLog={() => logMeal(day.day_of_week, meal.slot)}
                    />
                  );
                })}
              </View>
            );
          })}

          {plan.notes && plan.notes.length > 0 && (
            <View style={styles.notesCard}>
              <Text style={styles.notesLabel}>
                {isArabic ? "ملاحظات" : "COACH NOTES"}
              </Text>
              {plan.notes.map((n, i) => (
                <Text key={i} style={styles.notesBody}>
                  · {n}
                </Text>
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

function ActionBtn({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.actionBtn, disabled && { opacity: 0.5 }]}
    >
      <Ionicons name={icon} size={18} color={colors.gold} />
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function MealCard({
  meal,
  meta,
  logged,
  logging,
  isArabic,
  onLog,
}: {
  meal: PlannedMeal;
  meta: (typeof SLOT_META)[Slot];
  logged: boolean;
  logging: boolean;
  isArabic: boolean;
  onLog: () => void;
}) {
  const photoUrl = useFoodImage(meal.name);
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = !!photoUrl && !photoFailed;

  return (
    <View style={[styles.mealCard, logged && styles.mealCardDone]}>
      {showPhoto ? (
        <Image
          source={{ uri: photoUrl! }}
          style={styles.mealPhoto}
          onError={() => setPhotoFailed(true)}
        />
      ) : (
        <View
          style={[
            styles.mealBadge,
            { backgroundColor: withAlpha(meta.tint, 0.12) },
          ]}
        >
          <Ionicons name={meta.icon} size={30} color={meta.tint} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.mealSlot, { color: meta.tint }]}>
          {isArabic ? meta.ar : meta.en}
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
            onPress={onLog}
            disabled={logging}
            style={styles.logBtn}
          >
            <Text style={styles.logBtnLabel}>
              {logging
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
    </View>
  );
}

function withAlpha(hexOrRgb: string, alpha: number): string {
  // Handle 6-digit hex only; RC returns are always simple palette values.
  if (hexOrRgb.startsWith("#") && hexOrRgb.length === 7) {
    const r = parseInt(hexOrRgb.slice(1, 3), 16);
    const g = parseInt(hexOrRgb.slice(3, 5), 16);
    const b = parseInt(hexOrRgb.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return hexOrRgb;
}

const styles = StyleSheet.create({
  head: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontFamily: font.displayBold,
    fontSize: 22,
    color: colors.ink,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
  },
  actionLabel: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.ink,
  },
  emptyCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
    gap: 6,
    marginTop: spacing.md,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(246,183,60,0.10)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyH: {
    fontFamily: font.displayBold,
    fontSize: 22,
    color: colors.ink,
  },
  emptyBody: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
    lineHeight: 21,
    textAlign: "center",
  },
  daySection: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  dayHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  dayName: {
    fontFamily: font.displayBold,
    fontSize: 18,
    color: colors.ink,
  },
  dayNameToday: {
    color: colors.gold,
  },
  todayPill: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.2,
  },
  dayKcal: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
  },
  mealCard: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  mealCardDone: {
    borderColor: colors.mint,
    backgroundColor: "rgba(93,202,165,0.04)",
  },
  mealBadge: {
    width: 68,
    height: 68,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  mealPhoto: {
    width: 68,
    height: 68,
    borderRadius: radius.md,
    backgroundColor: colors.panel2,
  },
  mealSlot: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 1.4,
  },
  mealName: {
    fontFamily: font.displayBold,
    fontSize: 16,
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
    fontSize: 14,
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
    marginTop: spacing.md,
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
