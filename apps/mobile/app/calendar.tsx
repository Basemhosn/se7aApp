import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { api } from "@/lib/api";
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

const WEEKDAY_HEAD = ["M", "T", "W", "T", "F", "S", "S"];

export default function Calendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [byDate, setByDate] = useState<Map<string, DaySummary>>(new Map());
  const [loading, setLoading] = useState(true);
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ days: DaySummary[] }>(
        `/api/calendar/month?year=${year}&month=${month}`
      );
      setByDate(new Map(res.days.map((d) => [d.date, d])));
    } catch {
      setByDate(new Map());
    }
    setLoading(false);
  }, [year, month]);

  useEffect(() => {
    load();
  }, [load]);

  const openDay = async (date: string) => {
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
  };

  const prev = () => {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else setMonth((m) => m - 1);
  };
  const next = () => {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else setMonth((m) => m + 1);
  };
  const jumpToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
  };

  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const todayKey = fmtDate(today);

  return (
    <Screen>
      <View style={styles.head}>
        <BackButton />
      </View>

      <View style={styles.monthRow}>
        <Pressable onPress={prev} style={styles.navBtn}>
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Pressable onPress={jumpToday} style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.kicker}>CALENDAR</Text>
          <Text style={styles.h1}>
            {MONTHS[month - 1]} {year}
          </Text>
        </Pressable>
        <Pressable onPress={next} style={styles.navBtn}>
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_HEAD.map((d, i) => (
          <Text key={i} style={styles.weekdayText}>
            {d}
          </Text>
        ))}
      </View>

      {loading ? (
        <View style={{ paddingVertical: spacing.xl, alignItems: "center" }}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : (
        <View style={styles.grid}>
          {grid.map((cell, i) => {
            if (!cell) {
              return <View key={i} style={styles.cell} />;
            }
            const dateStr = fmtDateFrom(year, month, cell);
            const summary = byDate.get(dateStr);
            const isToday = dateStr === todayKey;
            return (
              <Pressable
                key={i}
                onPress={() => openDay(dateStr)}
                style={[styles.cell, isToday && styles.cellToday]}
              >
                <Text style={[styles.dayNum, isToday && styles.dayNumToday]}>
                  {cell}
                </Text>
                <View style={styles.dots}>
                  {summary?.meals ? (
                    <View style={[styles.dot, { backgroundColor: colors.gold }]} />
                  ) : null}
                  {summary?.workout ? (
                    <View style={[styles.dot, { backgroundColor: colors.mint }]} />
                  ) : null}
                  {summary?.weight_kg != null ? (
                    <View style={[styles.dot, { backgroundColor: colors.coral }]} />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.legend}>
        <Legend color={colors.gold} label="meals" />
        <Legend color={colors.mint} label="workout" />
        <Legend color={colors.coral} label="weigh-in" />
      </View>

      <Modal
        visible={!!pickedDate}
        animationType="slide"
        transparent
        onRequestClose={() => setPickedDate(null)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <View style={styles.modalHead}>
              <Text style={styles.modalDate}>{pickedDate && niceDate(pickedDate)}</Text>
              <Pressable onPress={() => setPickedDate(null)}>
                <Text style={styles.close}>✕</Text>
              </Pressable>
            </View>
            {detailLoading ? (
              <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.lg }} />
            ) : detail ? (
              <DayDetailView detail={detail} />
            ) : (
              <Text style={styles.emptyDay}>Nothing logged this day.</Text>
            )}
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function DayDetailView({ detail }: { detail: DayDetail }) {
  const totalKcalLow = detail.meals.reduce((s, m) => s + m.kcal_low, 0);
  const totalKcalHigh = detail.meals.reduce((s, m) => s + m.kcal_high, 0);
  const totalWater = detail.water.reduce((s, w) => s + w.ml, 0);
  const empty =
    detail.meals.length === 0 &&
    detail.workouts.length === 0 &&
    detail.weights.length === 0 &&
    detail.water.length === 0;

  if (empty) {
    return <Text style={styles.emptyDay}>Nothing logged this day.</Text>;
  }

  return (
    <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
      {detail.meals.length > 0 && (
        <View style={styles.detailSection}>
          <Text style={styles.detailKicker}>
            MEALS · {totalKcalLow}–{totalKcalHigh} KCAL
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
          <Text style={styles.detailKicker}>WORKOUTS</Text>
          {detail.workouts.map((w) => (
            <View key={w.id} style={styles.detailRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailName}>{w.session_name}</Text>
                <Text style={styles.detailSub}>
                  {w.exercises.length} exercises
                  {w.duration_min ? ` · ${w.duration_min} min` : ""}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
      {detail.weights.length > 0 && (
        <View style={styles.detailSection}>
          <Text style={styles.detailKicker}>WEIGH-IN</Text>
          {detail.weights.map((w) => (
            <View key={w.id} style={styles.detailRow}>
              <Text style={styles.detailName}>
                {w.weight_kg} kg
                {w.body_fat_pct != null ? ` · ${w.body_fat_pct}% BF` : ""}
              </Text>
            </View>
          ))}
        </View>
      )}
      {detail.water.length > 0 && (
        <View style={styles.detailSection}>
          <Text style={styles.detailKicker}>WATER · {totalWater / 1000} L</Text>
          <Text style={styles.detailSub}>{detail.water.length} entries</Text>
        </View>
      )}
    </ScrollView>
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
  weekdayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  weekdayText: {
    flex: 1,
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    textAlign: "center",
    letterSpacing: 1.2,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    padding: 4,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  cellToday: {
    backgroundColor: "rgba(246,183,60,0.10)",
    borderRadius: 8,
  },
  dayNum: {
    fontFamily: font.body,
    fontSize: 15,
    color: colors.ink,
  },
  dayNumToday: {
    color: colors.gold,
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
