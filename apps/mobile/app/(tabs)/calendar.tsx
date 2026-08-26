import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { api } from "@/lib/api";
import { consumeDirtyMonths } from "@/lib/calendarCache";
import { colors, font, radius, spacing } from "@/lib/theme";

interface DaySummary {
  date: string;
  kcal_low: number;
  kcal_high: number;
  meals: number;
  workout: boolean;
  weight_kg: number | null;
  water_ml: number;
}

interface MealItem {
  id: number;
  name: string;
  meal_slot: string | null;
  kcal_low: number;
  kcal_high: number;
  confidence: string | null;
}

interface WorkoutItem {
  id: number;
  session_name: string;
  duration_min: number | null;
  exercises: unknown[];
}

interface DayDetail {
  date: string;
  meals: MealItem[];
  workouts: WorkoutItem[];
  weights: { id: number; weight_kg: number; body_fat_pct: number | null }[];
  water: { id: number; ml: number }[];
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function Calendar() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ open?: string }>();
  const weekdayHead = t("common.day_names", { returnObjects: true }) as string[];
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [byDate, setByDate] = useState<Map<string, DaySummary>>(new Map());
  const [loading, setLoading] = useState(true);
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Session cache of which (year, month) pairs we've already fetched.
  // Held in a ref so mutations don't cause re-renders; the byDate Map
  // is the derived state readers actually consume.
  const fetchedMonths = useRef<Set<string>>(new Set()).current;

  const loadMonth = useCallback(
    async (y: number, m: number) => {
      const key = monthKey(y, m);
      if (fetchedMonths.has(key)) return;
      // Add optimistically to prevent duplicate in-flight requests when
      // two effects fire the same load simultaneously (mount + focus).
      fetchedMonths.add(key);
      try {
        const res = await api<{ days: DaySummary[] }>(
          `/api/calendar/month?year=${y}&month=${m}`
        );
        setByDate((prev) => {
          const next = new Map(prev);
          for (const d of res.days) next.set(d.date, d);
          return next;
        });
      } catch {
        // Allow retry — remove from cache set so a later call can try again.
        fetchedMonths.delete(key);
      }
    },
    [fetchedMonths]
  );

  // On month change: ensure the visible month is fetched, and pre-fetch
  // the adjacent months so a swipe to them shows dots immediately.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const currentKey = monthKey(year, month);
      if (!fetchedMonths.has(currentKey)) {
        setLoading(true);
        await loadMonth(year, month);
        if (!cancelled) setLoading(false);
      }
      // Adjacent months are fire-and-forget — they hydrate the cache in
      // the background while the user is looking at the current month.
      const [py, pm] = prevYM(year, month);
      const [ny, nm] = nextYM(year, month);
      loadMonth(py, pm);
      loadMonth(ny, nm);
    })();
    return () => {
      cancelled = true;
    };
  }, [year, month, loadMonth, fetchedMonths]);

  // On tab focus: invalidate every month that some mutation elsewhere
  // marked dirty, then re-fetch each. Falls back to invalidating just
  // the current visible month if nothing was signaled — safety net for
  // any mutation site we forgot to instrument.
  useFocusEffect(
    useCallback(() => {
      const dirtyMonths = consumeDirtyMonths();
      const currentKey = monthKey(year, month);
      const toInvalidate = new Set<string>(dirtyMonths);
      toInvalidate.add(currentKey);
      for (const key of toInvalidate) {
        fetchedMonths.delete(key);
        const [y, m] = key.split("-").map(Number) as [number, number];
        loadMonth(y, m);
      }
    }, [year, month, loadMonth, fetchedMonths])
  );

  const openDay = useCallback(async (date: string) => {
    setPickedDate(date);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await api<DayDetail>(`/api/calendar/day?date=${date}`);
      setDetail(res);
    } catch {
      setDetail(null);
    }
    setDetailLoading(false);
  }, []);

  // Deep-link support: /calendar?open=YYYY-MM-DD auto-navigates the
  // grid to that day's month and opens its detail modal. Fires once per
  // change of the param — clicking around the calendar afterwards uses
  // the same openDay callback.
  const openParam = params.open;
  const openedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!openParam || openedForRef.current === openParam) return;
    openedForRef.current = openParam;
    const [yy, mm] = openParam.split("-").map(Number);
    if (yy && mm) {
      setYear(yy);
      setMonth(mm);
    }
    openDay(openParam);
  }, [openParam, openDay]);

  const prev = useCallback(() => {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else setMonth((m) => m - 1);
  }, [month]);
  const next = useCallback(() => {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else setMonth((m) => m + 1);
  }, [month]);

  // Swipe-to-navigate with a full page-turn animation. See the block
  // below for how the release is committed.
  //
  // Critical: PanResponder is created ONCE on mount. If we let it
  // recreate every time `month` changes (which flows through prev/next
  // → commitSwipe → useMemo deps), the animation completion callback
  // that resets `isAnimating` can end up orphaned on the old closure,
  // leaving the flag stuck at true and swipes dead. Callbacks read
  // prev/next through refs so the closure stays valid regardless.
  const translateX = useRef(new Animated.Value(0)).current;
  const isAnimating = useRef(false);
  const prevRef = useRef(prev);
  const nextRef = useRef(next);
  useEffect(() => {
    prevRef.current = prev;
    nextRef.current = next;
  }, [prev, next]);

  const SCREEN_WIDTH = Dimensions.get("window").width;
  const SWIPE_THRESHOLD_PX = 60;
  const SWIPE_VELOCITY = 0.35;

  const panResponder = useMemo(() => {
    const finishAnimation = () => {
      isAnimating.current = false;
    };

    const snapBack = () => {
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        speed: 20,
        bounciness: 6,
      }).start(finishAnimation);
    };

    const commitSwipe = (direction: 1 | -1) => {
      // direction: +1 = prev (swipe right), -1 = next (swipe left).
      // Durations tuned for iOS "feel snappy" (~340ms total) — 200/220
      // felt sluggish on smaller devices.
      if (isAnimating.current) return;
      isAnimating.current = true;
      translateX.stopAnimation(); // defensive
      Animated.timing(translateX, {
        toValue: direction * SCREEN_WIDTH,
        duration: 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) {
          // Animation interrupted — reset flag and bail so a subsequent
          // swipe isn't blocked forever.
          isAnimating.current = false;
          return;
        }
        if (direction === 1) prevRef.current();
        else nextRef.current();
        translateX.setValue(-direction * SCREEN_WIDTH);
        Animated.timing(translateX, {
          toValue: 0,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(finishAnimation);
      });
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        !isAnimating.current &&
        Math.abs(g.dx) > Math.abs(g.dy) * 1.2 &&
        Math.abs(g.dx) > 5,
      onPanResponderMove: (_, g) => {
        translateX.setValue(
          Math.max(-SCREEN_WIDTH, Math.min(SCREEN_WIDTH, g.dx))
        );
      },
      onPanResponderRelease: (_, g) => {
        const goPrev = g.dx > SWIPE_THRESHOLD_PX || g.vx > SWIPE_VELOCITY;
        const goNext = g.dx < -SWIPE_THRESHOLD_PX || g.vx < -SWIPE_VELOCITY;
        if (goPrev) commitSwipe(1);
        else if (goNext) commitSwipe(-1);
        else snapBack();
      },
      onPanResponderTerminate: () => snapBack(),
    });
    // Deps are stable — translateX is a ref, SCREEN_WIDTH is a module-
    // level derived constant. Intentionally do NOT include prev/next so
    // the responder isn't torn down on every month change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const jumpToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
  };

  // Deterministic 7-column layout: split the flat grid into rows of 7.
  // (Previously used width: 100/7% cells that occasionally wrapped the
  // Sunday column onto its own line because of iOS sub-percent rounding.)
  const weeks = useMemo(() => {
    const flat = buildMonthGrid(year, month);
    const rows: (number | null)[][] = [];
    for (let i = 0; i < flat.length; i += 7) rows.push(flat.slice(i, i + 7));
    return rows;
  }, [year, month]);
  const todayKey = fmtDate(today);
  const isThisMonth =
    year === today.getFullYear() && month === today.getMonth() + 1;

  // Month-level derived stats from the loaded summaries.
  const monthStats = useMemo(() => {
    const daysInMonth = new Date(year, month, 0).getDate();
    let logged = 0;
    let workouts = 0;
    const weights: { at: string; kg: number }[] = [];
    for (const [dateStr, s] of byDate) {
      if (!dateStr.startsWith(`${year}-${String(month).padStart(2, "0")}`))
        continue;
      if ((s.meals ?? 0) > 0) logged += 1;
      if (s.workout) workouts += 1;
      if (s.weight_kg != null) weights.push({ at: dateStr, kg: Number(s.weight_kg) });
    }
    weights.sort((a, b) => a.at.localeCompare(b.at));
    const weightDelta =
      weights.length >= 2
        ? Math.round((weights[weights.length - 1]!.kg - weights[0]!.kg) * 10) / 10
        : null;
    return { daysInMonth, logged, workouts, weightDelta };
  }, [byDate, year, month]);

  return (
    <Screen>
      {/* Swipe zone wraps the whole calendar content so the gesture is
          discoverable from the month header, stats, or grid — not just
          the grid. Only the grid Animated.View below actually slides
          during the transition; header + stats stay put. */}
      <View {...panResponder.panHandlers} style={{ gap: spacing.lg }}>
      <View style={styles.monthRow}>
        <Pressable onPress={prev} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.kicker}>{t("calendar.title_prefix")}</Text>
          <Text style={styles.h1}>
            {MONTHS[month - 1]} {year}
          </Text>
        </View>
        <Pressable onPress={next} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={20} color={colors.ink} />
        </Pressable>
      </View>

      {!isThisMonth && (
        <Pressable onPress={jumpToday} style={styles.todayPill}>
          <Ionicons name="return-up-back" size={14} color={colors.gold} />
          <Text style={styles.todayPillLabel}>{t("calendar.jump_today")}</Text>
        </Pressable>
      )}

      <View style={styles.statsStrip}>
        <StatCell
          icon="checkmark-circle"
          tint={colors.mint}
          value={`${monthStats.logged}`}
          unit={t("calendar.stat_days_unit", { total: monthStats.daysInMonth })}
          label={t("calendar.stat_logged")}
        />
        <View style={styles.statDivider} />
        <StatCell
          icon="barbell"
          tint={colors.gold}
          value={`${monthStats.workouts}`}
          unit={
            monthStats.workouts === 1
              ? t("calendar.stat_workout")
              : t("calendar.stat_workouts")
          }
          label={t("calendar.stat_lifted")}
        />
        <View style={styles.statDivider} />
        <StatCell
          icon="fitness"
          tint={
            monthStats.weightDelta == null
              ? colors.dim
              : monthStats.weightDelta < 0
                ? colors.mint
                : monthStats.weightDelta > 0
                  ? colors.coral
                  : colors.dim
          }
          value={
            monthStats.weightDelta == null
              ? "—"
              : `${monthStats.weightDelta > 0 ? "+" : ""}${monthStats.weightDelta}`
          }
          unit="kg"
          label="WEIGHT Δ"
        />
      </View>

      <Animated.View
        style={[styles.swipeWrap, { transform: [{ translateX }] }]}
      >
        <View style={styles.weekdayRow}>
          {weekdayHead.map((d, i) => (
            <Text key={i} style={styles.weekdayText}>
              {d}
            </Text>
          ))}
        </View>

        {loading && byDate.size === 0 ? (
          <View style={{ paddingVertical: spacing.xl, alignItems: "center" }}>
            <ActivityIndicator color={colors.gold} />
          </View>
        ) : (
          <View style={styles.grid}>
            {weeks.map((week, wi) => (
              <View key={wi} style={styles.weekRow}>
                {week.map((cell, ci) => {
                  if (!cell) {
                    return <View key={ci} style={styles.cell} />;
                  }
                  const dateStr = fmtDateFrom(year, month, cell);
                  const summary = byDate.get(dateStr);
                  const isToday = dateStr === todayKey;
                  const hasMeals = !!summary?.meals;
                  const hasWorkout = !!summary?.workout;
                  const hasWeight = summary?.weight_kg != null;
                  return (
                    <Pressable
                      key={ci}
                      onPress={() => openDay(dateStr)}
                      style={styles.cell}
                    >
                      <View
                        style={[
                          styles.dayCircle,
                          isToday && styles.dayCircleToday,
                          hasMeals && !isToday && styles.dayCircleActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayNum,
                            isToday && styles.dayNumToday,
                            hasMeals && !isToday && styles.dayNumActive,
                          ]}
                        >
                          {cell}
                        </Text>
                      </View>
                      <View style={styles.dots}>
                        {hasMeals ? (
                          <View style={[styles.dot, { backgroundColor: colors.gold }]} />
                        ) : null}
                        {hasWorkout ? (
                          <View style={[styles.dot, { backgroundColor: colors.mint }]} />
                        ) : null}
                        {hasWeight ? (
                          <View style={[styles.dot, { backgroundColor: colors.coral }]} />
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </Animated.View>

      <View style={styles.legend}>
        <Legend color={colors.gold} label={t("calendar.legend_meals")} />
        <Legend color={colors.mint} label={t("calendar.legend_workout")} />
        <Legend color={colors.coral} label={t("calendar.legend_weighin")} />
      </View>
      </View>

      <Modal
        visible={!!pickedDate}
        animationType="slide"
        transparent
        onRequestClose={() => setPickedDate(null)}
      >
        <Pressable
          style={styles.modalBg}
          onPress={() => setPickedDate(null)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.dragHandle} />
            <View style={styles.modalHead}>
              <Text style={styles.modalDate}>{pickedDate && niceDate(pickedDate)}</Text>
              <Pressable
                onPress={() => setPickedDate(null)}
                hitSlop={12}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={18} color={colors.dim} />
              </Pressable>
            </View>
            {detailLoading ? (
              <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.lg }} />
            ) : detail ? (
              <DayDetailView detail={detail} />
            ) : (
              <Text style={styles.emptyDay}>{t("calendar.empty_day")}</Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function DayDetailView({ detail }: { detail: DayDetail }) {
  const { t } = useTranslation();
  const totalKcalLow = detail.meals.reduce((s, m) => s + m.kcal_low, 0);
  const totalKcalHigh = detail.meals.reduce((s, m) => s + m.kcal_high, 0);
  const totalWater = detail.water.reduce((s, w) => s + w.ml, 0);
  const empty =
    detail.meals.length === 0 &&
    detail.workouts.length === 0 &&
    detail.weights.length === 0 &&
    detail.water.length === 0;

  if (empty) {
    return <Text style={styles.emptyDay}>{t("calendar.empty_day")}</Text>;
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator
      contentContainerStyle={{ paddingBottom: spacing.md }}
    >
      {detail.meals.length > 0 && (
        <View style={styles.detailSection}>
          <Text style={styles.detailKicker}>
            {t("calendar.meals_kcal", { low: totalKcalLow, high: totalKcalHigh })}
          </Text>
          {detail.meals.map((m) => (
            <View key={m.id} style={styles.detailRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailName}>{m.name}</Text>
                <Text style={styles.detailSub}>
                  {m.meal_slot ? `${m.meal_slot} · ` : ""}
                  {m.confidence ?? ""}
                </Text>
              </View>
              <Text style={styles.detailKcal}>
                {m.kcal_low}–{m.kcal_high}
              </Text>
            </View>
          ))}
        </View>
      )}
      {detail.workouts.length > 0 && (
        <View style={styles.detailSection}>
          <Text style={styles.detailKicker}>{t("calendar.workouts")}</Text>
          {detail.workouts.map((w) => (
            <View key={w.id} style={styles.detailRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailName}>{w.session_name}</Text>
                <Text style={styles.detailSub}>
                  {t("calendar.n_exercises", { count: w.exercises.length })}
                  {w.duration_min ? ` · ${w.duration_min} ${t("common.min")}` : ""}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
      {detail.weights.length > 0 && (
        <View style={styles.detailSection}>
          <Text style={styles.detailKicker}>{t("calendar.weighin")}</Text>
          {detail.weights.map((w) => (
            <View key={w.id} style={styles.detailRow}>
              <Text style={styles.detailName}>
                {w.weight_kg} {t("common.kg")}
                {w.body_fat_pct != null ? ` · ${w.body_fat_pct}% BF` : ""}
              </Text>
            </View>
          ))}
        </View>
      )}
      {detail.water.length > 0 && (
        <View style={styles.detailSection}>
          <Text style={styles.detailKicker}>{t("calendar.water", { liters: totalWater / 1000 })}</Text>
          <Text style={styles.detailSub}>{t("calendar.n_entries", { count: detail.water.length })}</Text>
        </View>
      )}
    </ScrollView>
  );
}

function StatCell({
  icon,
  tint,
  value,
  unit,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  value: string;
  unit: string;
  label: string;
}) {
  return (
    <View style={styles.statCell}>
      <View style={styles.statIconRow}>
        <Ionicons name={icon} size={12} color={tint} />
        <Text style={[styles.statLabel, { color: tint }]}>{label}</Text>
      </View>
      <Text style={styles.statValue}>
        {value}
        <Text style={styles.statUnit}> {unit}</Text>
      </Text>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function buildMonthGrid(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month - 1, 1);
  const jsDow = firstDay.getDay(); // 0 Sun ... 6 Sat
  const mondayOffset = (jsDow + 6) % 7; // convert to Monday-start
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < mondayOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function fmtDateFrom(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthKey(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}

function prevYM(y: number, m: number): [number, number] {
  return m === 1 ? [y - 1, 12] : [y, m - 1];
}

function nextYM(y: number, m: number): [number, number] {
  return m === 12 ? [y + 1, 1] : [y, m + 1];
}

function niceDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

const styles = StyleSheet.create({
  head: { marginTop: spacing.sm },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  navText: {
    fontFamily: font.displayBold,
    fontSize: 22,
    color: colors.ink,
  },
  todayPill: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: "rgba(246,183,60,0.08)",
  },
  todayPillLabel: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 0.6,
  },
  statsStrip: {
    flexDirection: "row",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    justifyContent: "space-between",
    alignItems: "center",
  },
  statCell: { flex: 1, gap: 2 },
  statIconRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  statLabel: {
    fontFamily: font.mono,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  statValue: {
    fontFamily: font.displayBold,
    fontSize: 18,
    color: colors.ink,
    marginTop: 2,
  },
  statUnit: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
  },
  statDivider: {
    width: 1,
    alignSelf: "stretch",
    marginVertical: 2,
    marginHorizontal: spacing.sm,
    backgroundColor: colors.line,
  },
  dayCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCircleToday: {
    backgroundColor: colors.gold,
  },
  dayCircleActive: {
    borderWidth: 1,
    borderColor: colors.line,
  },
  dayNumActive: {
    fontFamily: font.displayBold,
  },
  dragHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: spacing.sm,
    marginTop: -spacing.xs,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.panel2,
    alignItems: "center",
    justifyContent: "center",
  },
  kicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  h1: {
    fontFamily: font.displayBold,
    fontSize: 22,
    color: colors.ink,
  },
  swipeWrap: {
    gap: spacing.xs,
  },
  weekdayRow: {
    flexDirection: "row",
  },
  weekdayText: {
    flex: 1,
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    textAlign: "center",
    letterSpacing: 1.2,
    paddingVertical: 4,
  },
  grid: {
    flexDirection: "column",
  },
  weekRow: {
    flexDirection: "row",
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    padding: 4,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  dayNum: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.ink,
  },
  dayNumToday: {
    color: colors.bg,
    fontFamily: font.displayBold,
  },
  dots: {
    flexDirection: "row",
    gap: 2,
    minHeight: 6,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1,
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.panel,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
    borderColor: colors.line,
    gap: spacing.md,
    maxHeight: "85%",
  },
  modalHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalDate: {
    fontFamily: font.displayBold,
    fontSize: 20,
    color: colors.ink,
  },
  close: {
    fontFamily: font.mono,
    fontSize: 18,
    color: colors.dim,
  },
  detailSection: {
    gap: 4,
    marginBottom: spacing.md,
  },
  detailKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: "row",
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  detailName: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.ink,
  },
  detailSub: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    marginTop: 2,
  },
  detailKcal: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
  },
  emptyDay: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
    marginTop: spacing.md,
  },
});
