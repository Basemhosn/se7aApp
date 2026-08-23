import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { TrendChart } from "@/components/TrendChart";
import {
  ProjectionChart,
  type ProjectionResponse,
} from "@/components/ProjectionChart";
import { AdherenceRing } from "@/components/AdherenceRing";
import { api } from "@/lib/api";
import { markDayDirty } from "@/lib/calendarCache";
import { colors, font, radius, spacing } from "@/lib/theme";

interface TrendResponse {
  days: number;
  points: {
    weight_kg: number;
    body_fat_pct: number | null;
    logged_at: string;
  }[];
}

interface AdherenceResponse {
  days_window: number;
  days_logged: number;
  percentage: number;
  comparison: string;
}

interface Pr {
  exercise: string;
  best_weight_kg: number;
  best_reps: number;
  est_1rm_kg: number;
  achieved_at: string;
  set_count_ever: number;
}

interface PrsResponse {
  period: "all" | "month" | "week";
  count: number;
  prs: Pr[];
}

interface StreakResponse {
  current_days: number;
  longest_days: number;
  days_this_week: number;
  todays_status: "logged" | "not_yet";
}

interface ProgressPhoto {
  id: number;
  taken_at: string;
  angle: "front" | "side" | "back";
  url: string | null;
}
interface PhotosResponse {
  photos: ProgressPhoto[];
  count: number;
}

type MField = "waist_cm" | "hip_cm" | "chest_cm" | "arm_cm" | "thigh_cm" | "neck_cm";
interface MeasurementsResponse {
  measurements: {
    id: number;
    taken_at: string;
    waist_cm: number | null;
    hip_cm: number | null;
    chest_cm: number | null;
    arm_cm: number | null;
    thigh_cm: number | null;
    neck_cm: number | null;
  }[];
  count: number;
  deltas: Record<MField, number | null> | null;
}

const RANGES = [
  { days: 30, label: "30D" },
  { days: 60, label: "60D" },
  { days: 90, label: "90D" },
];

export default function Progress() {
  const { t } = useTranslation();
  const [trend, setTrend] = useState<TrendResponse | null>(null);
  const [adherence, setAdherence] = useState<AdherenceResponse | null>(null);
  const [prs, setPrs] = useState<PrsResponse | null>(null);
  const [streak, setStreak] = useState<StreakResponse | null>(null);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementsResponse | null>(null);
  const [days, setDays] = useState(30);
  const [projection, setProjection] = useState<ProjectionResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [weight, setWeight] = useState("");
  const [bf, setBf] = useState("");
  const [logging, setLogging] = useState(false);
  const [logErr, setLogErr] = useState("");

  const [goalWeightInput, setGoalWeightInput] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    try {
      const tzOffsetMin = -new Date().getTimezoneOffset();
      const [tr, adh, prRes, streakRes, photosRes, mRes, projRes] =
        await Promise.all([
          api<TrendResponse>(`/api/weight/trend?days=${d}`),
          api<AdherenceResponse>("/api/progress/adherence?days=7").catch(
            () => null
          ),
          api<PrsResponse>("/api/workouts/prs?period=all").catch(() => null),
          api<StreakResponse>(
            `/api/streaks?tz_offset_min=${tzOffsetMin}`
          ).catch(() => null),
          api<PhotosResponse>("/api/progress/photos?limit=4").catch(() => ({
            photos: [] as ProgressPhoto[],
            count: 0,
          })),
          api<MeasurementsResponse>("/api/measurements?limit=10").catch(
            () => null
          ),
          api<ProjectionResponse>(
            "/api/weight/projection?lookback_days=56&forward_days=90"
          ).catch(() => null),
        ]);
      setTrend(tr);
      setAdherence(adh);
      setPrs(prRes);
      setStreak(streakRes);
      setPhotos(photosRes.photos);
      setMeasurements(mRes);
      setProjection(projRes);
      if (projRes?.goal.weight_kg != null) {
        setGoalWeightInput(String(projRes.goal.weight_kg));
      }
    } catch {
      /* empty */
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(days);
    }, [days, load])
  );

  const saveGoalWeight = async () => {
    const raw = goalWeightInput.trim();
    const parsed = raw === "" ? null : Number(raw);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed <= 0)) return;
    setSavingGoal(true);
    try {
      await api("/api/profile/prefs", {
        method: "POST",
        body: JSON.stringify({ goal_weight_kg: parsed }),
      });
      await load(days);
    } catch {
      /* silent — user can retry */
    }
    setSavingGoal(false);
  };

  const logWeight = async () => {
    const w = Number(weight);
    if (!w || w <= 0) return;
    setLogging(true);
    setLogErr("");
    try {
      await api("/api/weight", {
        method: "POST",
        body: JSON.stringify({
          weight_kg: w,
          body_fat_pct: bf ? Number(bf) : undefined,
        }),
      });
      markDayDirty();
      setWeight("");
      setBf("");
      await load(days);
    } catch (e) {
      setLogErr((e as Error).message || t("progress.couldnt_log"));
    }
    setLogging(false);
  };

  return (
    <Screen>
      <View style={styles.head}>
        <Text style={styles.title}>{t("progress.title")}</Text>
        <Text style={styles.sub}>{t("progress.sub")}</Text>
      </View>

      {adherence && (
        <View style={styles.heroRow}>
          <AdherenceRing
            value={adherence.days_logged}
            outOf={adherence.days_window}
            kicker={t("progress.adherence_kicker")}
            tint={colors.mint}
            size={180}
          />
          <View style={styles.heroSide}>
            <MiniStat
              label="STREAK"
              value={streak ? String(streak.current_days) : "—"}
              unit={
                streak && streak.current_days === 1 ? "day" : "days"
              }
              tint={colors.gold}
              icon="flame"
            />
            <MiniStat
              label={days === 30 ? "30-DAY Δ" : `${days}-DAY Δ`}
              value={weightDelta(trend?.points)}
              unit="kg"
              tint={weightDeltaTint(trend?.points)}
              icon="trending-down"
            />
            <MiniStat
              label="LATEST"
              value={
                trend && trend.points.length > 0
                  ? String(trend.points[trend.points.length - 1]!.weight_kg)
                  : "—"
              }
              unit="kg"
              tint={colors.ink}
              icon="fitness"
            />
          </View>
        </View>
      )}

      {adherence && (
        <Text style={styles.compareLine}>{adherence.comparison}.</Text>
      )}

      {prs && prs.prs.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.prKicker}>YOUR PRs</Text>
          <Text style={styles.cardTitle}>Personal records</Text>
          <Text style={styles.cardSub}>
            Top {Math.min(5, prs.prs.length)} of {prs.count} tracked lifts.
          </Text>
          {prs.prs.slice(0, 5).map((pr) => (
            <View key={pr.exercise} style={styles.prRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.prName}>{pr.exercise}</Text>
                <Text style={styles.prMeta}>
                  {pr.best_weight_kg} kg × {pr.best_reps}
                  {"  ·  "}est. 1RM {pr.est_1rm_kg} kg
                </Text>
              </View>
              <Text style={styles.prDate}>{shortDate(pr.achieved_at)}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>{t("progress.weight_trend")}</Text>
          <View style={styles.rangeRow}>
            {RANGES.map((r) => (
              <Pressable
                key={r.days}
                onPress={() => setDays(r.days)}
                style={[styles.rangeChip, days === r.days && styles.rangeChipOn]}
              >
                <Text
                  style={[
                    styles.rangeText,
                    days === r.days && styles.rangeTextOn,
                  ]}
                >
                  {r.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        {loading ? (
          <ActivityIndicator color={colors.gold} style={{ marginVertical: spacing.lg }} />
        ) : (
          <TrendChart points={trend?.points ?? []} />
        )}
      </View>

      {projection && !projection.insufficient && projection.regression && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {t("progress_cards.projection.title")}
          </Text>
          <Text style={styles.cardSub}>
            {formatProjectionSub(projection, t)}
          </Text>
          <View style={{ marginTop: spacing.sm }}>
            <ProjectionChart data={projection} />
          </View>
          <View style={styles.projStatsRow}>
            <ProjStat
              label={t("progress_cards.projection.stat_pace")}
              value={`${
                projection.regression.slope_kg_per_week > 0 ? "+" : ""
              }${projection.regression.slope_kg_per_week.toFixed(2)}`}
              unit={t("progress_cards.projection.stat_pace_unit")}
              tint={
                projection.regression.slope_kg_per_week === 0
                  ? colors.dim
                  : projection.regression.slope_kg_per_week < 0
                    ? colors.gold
                    : colors.mint
              }
            />
            <ProjStat
              label={t("progress_cards.projection.stat_r2")}
              value={projection.regression.r_squared.toFixed(2)}
              unit={t("progress_cards.projection.stat_r2_unit")}
              tint={colors.ink}
            />
            {projection.goal.on_pace_pct != null && (
              <ProjStat
                label={t("progress_cards.projection.stat_on_pace")}
                value={`${projection.goal.on_pace_pct}`}
                unit="%"
                tint={
                  projection.goal.on_pace_pct >= 80
                    ? colors.gold
                    : projection.goal.on_pace_pct >= 40
                      ? colors.ink
                      : colors.coral
                }
              />
            )}
            {projection.goal.eta_days != null && (
              <ProjStat
                label={t("progress_cards.projection.stat_eta")}
                value={String(Math.round(projection.goal.eta_days / 7))}
                unit={t("progress_cards.projection.stat_eta_unit")}
                tint={colors.mint}
              />
            )}
          </View>
          <View style={styles.goalRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>
                {t("progress_cards.projection.target_label")}
              </Text>
              <TextInput
                value={goalWeightInput}
                onChangeText={setGoalWeightInput}
                keyboardType="numeric"
                placeholder={t("progress_cards.projection.target_placeholder")}
                placeholderTextColor={colors.dim}
                style={styles.input}
              />
            </View>
            <View style={{ justifyContent: "flex-end" }}>
              <Btn
                label={
                  savingGoal
                    ? t("progress_cards.projection.target_cta_saving")
                    : t("progress_cards.projection.target_cta_save")
                }
                onPress={saveGoalWeight}
                disabled={savingGoal}
                variant="ghost"
              />
            </View>
          </View>
        </View>
      )}

      <TopFoods days={days} />

      <Nutrients days={days} />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("progress.log_weighin")}</Text>
        <Text style={styles.cardSub}>
          {t("progress.log_weighin_sub")}
        </Text>
        <View style={styles.formRow}>
          <View style={{ flex: 2 }}>
            <Text style={styles.label}>{t("progress.weight_label")}</Text>
            <TextInput
              value={weight}
              onChangeText={setWeight}
              keyboardType="numeric"
              placeholder="75"
              placeholderTextColor={colors.dim}
              style={styles.input}
            />
          </View>
          <View style={{ flex: 2 }}>
            <Text style={styles.label}>{t("progress.bf_label")}</Text>
            <TextInput
              value={bf}
              onChangeText={setBf}
              keyboardType="numeric"
              placeholder="—"
              placeholderTextColor={colors.dim}
              style={styles.input}
            />
          </View>
        </View>
        {!!logErr && <Text style={styles.err}>{logErr}</Text>}
        <Btn
          label={logging ? t("progress.logging") : t("progress.log_weighin_cta")}
          onPress={logWeight}
          loading={logging}
          disabled={!weight || Number(weight) <= 0}
        />
      </View>

      <Pressable
        onPress={() => router.push("/progress-photos")}
        style={styles.previewCard}
      >
        <View style={styles.previewHeadRow}>
          <View>
            <Text style={[styles.kicker, { color: colors.gold }]}>
              PROGRESS PHOTOS
            </Text>
            <Text style={styles.linkTitle}>
              {photos.length === 0
                ? "Watch yourself change"
                : `${photos.length} photo${photos.length === 1 ? "" : "s"}`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.gold} />
        </View>
        {photos.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, paddingTop: 6 }}
          >
            {photos.map((p) =>
              p.url ? (
                <Image
                  key={p.id}
                  source={{ uri: p.url }}
                  style={styles.previewThumb}
                />
              ) : null
            )}
          </ScrollView>
        ) : (
          <Text style={styles.linkSub}>
            Weekly front/side/back photos, private, side-by-side compare.
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => router.push("/measurements")}
        style={styles.previewCard}
      >
        <View style={styles.previewHeadRow}>
          <View>
            <Text style={[styles.kicker, { color: colors.mint }]}>
              TAPE MEASURE
            </Text>
            <Text style={styles.linkTitle}>
              {measurements && measurements.count > 0
                ? `${measurements.count} entr${measurements.count === 1 ? "y" : "ies"}`
                : "Measurements"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.mint} />
        </View>
        {measurements &&
        measurements.deltas &&
        Object.values(measurements.deltas).some((v) => v !== null) ? (
          <View style={styles.deltaRow}>
            {(
              [
                ["waist_cm", "Waist"],
                ["hip_cm", "Hip"],
                ["chest_cm", "Chest"],
                ["arm_cm", "Arm"],
              ] as const
            ).map(([key, label]) => {
              const delta = measurements.deltas?.[key];
              if (delta === null || delta === undefined) return null;
              return (
                <View key={key} style={styles.deltaCell}>
                  <Text style={styles.deltaLabel}>{label.toUpperCase()}</Text>
                  <Text
                    style={[
                      styles.deltaValue,
                      {
                        color:
                          delta < 0
                            ? colors.mint
                            : delta > 0
                              ? colors.coral
                              : colors.dim,
                      },
                    ]}
                  >
                    {delta > 0 ? "+" : ""}
                    {delta}
                    <Text style={styles.deltaUnit}> cm</Text>
                  </Text>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.linkSub}>
            Waist / hip / arm / chest / thigh / neck. Deltas vs your first entry.
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => router.push("/scan/body")}
        style={styles.linkCard}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: colors.coral }]}>{t("progress.body_scan_kicker")}</Text>
          <Text style={styles.linkTitle}>{t("progress.body_scan_title")}</Text>
          <Text style={styles.linkSub}>
            {t("progress.body_scan_sub")}
          </Text>
        </View>
        <Text style={[styles.linkArrow, { color: colors.coral }]}>→</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/calendar")}
        style={styles.linkCard}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: colors.gold }]}>{t("progress.calendar_kicker")}</Text>
          <Text style={styles.linkTitle}>{t("progress.calendar_title")}</Text>
          <Text style={styles.linkSub}>
            {t("progress.calendar_sub")}
          </Text>
        </View>
        <Text style={[styles.linkArrow, { color: colors.gold }]}>→</Text>
      </Pressable>
    </Screen>
  );
}

function MiniStat({
  label,
  value,
  unit,
  tint,
  icon,
}: {
  label: string;
  value: string;
  unit: string;
  tint: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.miniStat}>
      <View style={styles.miniIconRow}>
        <Ionicons name={icon} size={14} color={tint} />
        <Text style={[styles.miniLabel, { color: tint }]}>{label}</Text>
      </View>
      <Text style={styles.miniValue}>
        {value}
        <Text style={styles.miniUnit}> {unit}</Text>
      </Text>
    </View>
  );
}

function weightDelta(
  points: TrendResponse["points"] | undefined
): string {
  if (!points || points.length < 2) return "—";
  const first = Number(points[0]!.weight_kg);
  const last = Number(points[points.length - 1]!.weight_kg);
  const d = Math.round((last - first) * 10) / 10;
  return `${d > 0 ? "+" : ""}${d}`;
}

function weightDeltaTint(
  points: TrendResponse["points"] | undefined
): string {
  if (!points || points.length < 2) return colors.dim;
  const d =
    Number(points[points.length - 1]!.weight_kg) - Number(points[0]!.weight_kg);
  if (d < -0.05) return colors.mint;
  if (d > 0.05) return colors.coral;
  return colors.dim;
}

type TopFoodsMacro = "kcal" | "protein" | "carb" | "fat";

interface TopFoodsResponse {
  days: number;
  macro: TopFoodsMacro;
  unit: string;
  total_all: number;
  foods: Array<{
    name: string;
    total_low: number;
    total_high: number;
    times_logged: number;
    last_logged_at: string;
    avg_per_serving_low: number;
    avg_per_serving_high: number;
    share_pct: number;
  }>;
}

const TOP_MACRO_META: Record<
  TopFoodsMacro,
  { labelKey: string; tint: string }
> = {
  kcal: { labelKey: "progress_cards.top_foods.macro_calories", tint: colors.gold },
  protein: { labelKey: "progress_cards.top_foods.macro_protein", tint: colors.mint },
  carb: { labelKey: "progress_cards.top_foods.macro_carbs", tint: colors.coral },
  fat: { labelKey: "progress_cards.top_foods.macro_fat", tint: "#8b7dd6" },
};

/**
 * "What's driving your calories/protein/carbs/fat?" card. Same time
 * window as the parent Progress screen (30/60/90D chips) so users see
 * the offenders that match the trend they're looking at.
 */
function TopFoods({ days }: { days: number }) {
  const { t } = useTranslation();
  const [macro, setMacro] = useState<TopFoodsMacro>("kcal");
  const [data, setData] = useState<TopFoodsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<TopFoodsResponse>(
      `/api/insights/top-foods?days=${days}&macro=${macro}&limit=5`
    )
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, macro]);

  const meta = TOP_MACRO_META[macro];
  const macroLabel = t(meta.labelKey);

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>
          {t("progress_cards.top_foods.title", {
            macro: macroLabel.toLowerCase(),
          })}
        </Text>
      </View>
      <Text style={styles.cardSub}>
        {t("progress_cards.top_foods.sub", { days })}
      </Text>
      <View style={styles.rangeRow}>
        {(Object.keys(TOP_MACRO_META) as TopFoodsMacro[]).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMacro(m)}
            style={[styles.rangeChip, macro === m && styles.rangeChipOn]}
          >
            <Text
              style={[
                styles.rangeText,
                macro === m && styles.rangeTextOn,
              ]}
            >
              {t(TOP_MACRO_META[m].labelKey).toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>
      {loading ? (
        <ActivityIndicator
          color={colors.gold}
          style={{ marginVertical: spacing.md }}
        />
      ) : !data || data.foods.length === 0 ? (
        <Text style={styles.topFoodsEmpty}>
          {t("progress_cards.top_foods.empty")}
        </Text>
      ) : (
        <>
          {data.foods.map((f, i) => (
            <View key={i} style={styles.topFoodRow}>
              <View style={styles.topFoodRank}>
                <Text
                  style={[styles.topFoodRankText, { color: meta.tint }]}
                >
                  {i + 1}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.topFoodName}>{f.name}</Text>
                <Text style={styles.topFoodMeta}>
                  {t("progress_cards.top_foods.row_meta", {
                    count: f.times_logged,
                    low: Math.round(f.avg_per_serving_low),
                    high: Math.round(f.avg_per_serving_high),
                    unit: data.unit,
                  })}
                </Text>
              </View>
              <View style={styles.topFoodShare}>
                <Text
                  style={[styles.topFoodShareVal, { color: meta.tint }]}
                >
                  {f.share_pct}%
                </Text>
                <Text style={styles.topFoodShareUnit}>
                  {t("progress_cards.top_foods.share")}
                </Text>
              </View>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

interface NutrientRow {
  key: string;
  label: string;
  unit: string;
  avg_low: number;
  avg_high: number;
  target: number | null;
  polarity: "over_warn" | "want_hit" | "neutral";
  pct_of_target: number | null;
}

interface NutrientsResponse {
  days: number;
  nutrients: NutrientRow[];
}

/**
 * Nutrients card — daily-average of every tracked nutrient over the
 * parent Progress window (7/30/90D). Ranges preserved. Coloring:
 * coral for over-target on over-warn nutrients (sodium/sugar/sat fat),
 * mint for hitting the target on want-hit nutrients (protein/fiber),
 * neutral otherwise. Rows with no per-item data (all zeros) render
 * as "—" so a legacy-only week doesn't misread as a real zero intake.
 */
function Nutrients({ days }: { days: number }) {
  const { t } = useTranslation();
  const [data, setData] = useState<NutrientsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Localized nutrient labels by key — falls back to the server label
  // when a nutrient we don't have a translation for shows up (future-
  // proofs the endpoint adding new nutrients without a mobile bump).
  const nutrientLabel = (key: string, fallback: string): string => {
    const map: Record<string, string> = {
      kcal: t("progress_cards.nutrients.name_calories"),
      protein_g: t("progress_cards.nutrients.name_protein"),
      carb_g: t("progress_cards.nutrients.name_carbs"),
      fat_g: t("progress_cards.nutrients.name_fat"),
      fiber_g: t("progress_cards.nutrients.name_fiber"),
      sugar_g: t("progress_cards.nutrients.name_sugar"),
      sodium_mg: t("progress_cards.nutrients.name_sodium"),
      saturated_fat_g: t("progress_cards.nutrients.name_sat_fat"),
    };
    return map[key] ?? fallback;
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<NutrientsResponse>(`/api/insights/nutrients?days=${days}`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        {t("progress_cards.nutrients.title")}
      </Text>
      <Text style={styles.cardSub}>
        {t("progress_cards.nutrients.sub", { days })}
      </Text>
      {loading ? (
        <ActivityIndicator
          color={colors.gold}
          style={{ marginVertical: spacing.md }}
        />
      ) : !data || data.nutrients.length === 0 ? (
        <Text style={styles.topFoodsEmpty}>
          {t("progress_cards.nutrients.empty")}
        </Text>
      ) : (
        <>
          <View style={styles.nutrientHeaderRow}>
            <Text style={[styles.nutrientHeaderCell, { flex: 2 }]}>
              {t("progress_cards.nutrients.col_nutrient")}
            </Text>
            <Text style={styles.nutrientHeaderCell}>
              {t("progress_cards.nutrients.col_avg")}
            </Text>
            <Text style={styles.nutrientHeaderCell}>
              {t("progress_cards.nutrients.col_target")}
            </Text>
            <Text style={styles.nutrientHeaderCell}>
              {t("progress_cards.nutrients.col_pct")}
            </Text>
          </View>
          {data.nutrients.map((n) => {
            const hasData = n.avg_high > 0;
            const overTarget =
              n.target !== null && n.avg_high > n.target;
            const hitTarget =
              n.target !== null && n.avg_high >= n.target;
            const tint =
              !hasData
                ? colors.dim
                : n.polarity === "over_warn" && overTarget
                  ? colors.coral
                  : n.polarity === "want_hit" && hitTarget
                    ? colors.mint
                    : n.polarity === "want_hit" &&
                        n.target !== null &&
                        n.avg_high < n.target * 0.5
                      ? colors.coral
                      : colors.ink;
            return (
              <View key={n.key} style={styles.nutrientRow}>
                <Text style={[styles.nutrientName, { flex: 2 }]}>
                  {nutrientLabel(n.key, n.label)}
                </Text>
                <Text style={[styles.nutrientAvg, { color: tint }]}>
                  {hasData
                    ? `${fmtNutrient(n.avg_low, n.unit)}–${fmtNutrient(n.avg_high, n.unit)}`
                    : "—"}
                </Text>
                <Text style={styles.nutrientTarget}>
                  {n.target !== null ? fmtNutrient(n.target, n.unit) : "—"}
                </Text>
                <Text style={[styles.nutrientPct, { color: tint }]}>
                  {n.pct_of_target !== null && hasData
                    ? `${n.pct_of_target}%`
                    : "—"}
                </Text>
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}

function fmtNutrient(n: number, unit: string): string {
  if (unit === "mg") return String(Math.round(n));
  return n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
}

function ProjStat({
  label,
  value,
  unit,
  tint,
}: {
  label: string;
  value: string;
  unit: string;
  tint: string;
}) {
  return (
    <View style={styles.projStat}>
      <Text style={[styles.projStatLabel, { color: tint }]}>{label}</Text>
      <Text style={styles.projStatValue}>
        {value}
        <Text style={styles.projStatUnit}> {unit}</Text>
      </Text>
    </View>
  );
}

function formatProjectionSub(
  p: ProjectionResponse,
  t: (key: string, opts?: Record<string, string | number>) => string
): string {
  const slope = p.regression?.slope_kg_per_week ?? 0;
  const dir: "losing" | "gaining" | "holding" =
    slope < -0.05 ? "losing" : slope > 0.05 ? "gaining" : "holding";
  const currentKg = p.current?.weight_kg ?? null;
  const rate = Math.abs(slope).toFixed(2);
  const key =
    currentKg !== null
      ? `progress_cards.projection.sub_${dir}`
      : `progress_cards.projection.sub_${dir}_no_weight`;
  // "holding" branch doesn't render {{rate}} — the copy is intentionally
  // absent — but passing rate through is harmless because i18next skips
  // unknown placeholders.
  return t(key, { rate, weight: currentKg ?? 0 });
}

const styles = StyleSheet.create({
  head: { marginTop: spacing.sm, gap: 4 },
  title: {
    fontFamily: font.displayBold,
    fontSize: 32,
    color: colors.ink,
  },
  sub: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
  },
  kicker: {
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1.4,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  heroSide: {
    flex: 1,
    gap: spacing.sm,
    paddingLeft: spacing.sm,
  },
  miniStat: { gap: 2 },
  miniIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  miniLabel: {
    fontFamily: font.mono,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  miniValue: {
    fontFamily: font.displayBold,
    fontSize: 18,
    color: colors.ink,
    marginTop: 2,
  },
  miniUnit: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
  },
  compareLine: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
    lineHeight: 18,
    marginTop: -spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  previewCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  previewHeadRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  previewThumb: {
    width: 76,
    height: 100,
    borderRadius: radius.sm,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  deltaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    paddingTop: 4,
  },
  deltaCell: { minWidth: 60, gap: 2 },
  deltaLabel: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.dim,
    letterSpacing: 1.2,
  },
  deltaValue: {
    fontFamily: font.displayBold,
    fontSize: 16,
  },
  deltaUnit: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
  },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontFamily: font.displayBold,
    fontSize: 18,
    color: colors.ink,
  },
  cardSub: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
  },
  rangeRow: { flexDirection: "row", gap: 4 },
  rangeChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
  },
  rangeChipOn: { borderColor: colors.gold, backgroundColor: "rgba(246,183,60,0.10)" },
  rangeText: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    letterSpacing: 0.8,
  },
  rangeTextOn: { color: colors.gold },
  formRow: { flexDirection: "row", gap: spacing.sm },
  projStatsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  projStat: {
    minWidth: 68,
  },
  projStatLabel: {
    fontFamily: font.mono,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  projStatValue: {
    fontFamily: font.displayBold,
    fontSize: 18,
    color: colors.ink,
    marginTop: 2,
  },
  projStatUnit: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 0.6,
  },
  goalRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    alignItems: "flex-end",
  },
  topFoodsEmpty: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    marginVertical: spacing.md,
    textAlign: "center",
  },
  topFoodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  topFoodRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  topFoodRankText: {
    fontFamily: font.displayBold,
    fontSize: 13,
  },
  topFoodName: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.ink,
  },
  topFoodMeta: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  topFoodShare: {
    alignItems: "flex-end",
    minWidth: 42,
  },
  topFoodShareVal: {
    fontFamily: font.displayBold,
    fontSize: 15,
  },
  topFoodShareUnit: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.dim,
    letterSpacing: 0.8,
  },
  nutrientHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    marginTop: spacing.sm,
  },
  nutrientHeaderCell: {
    flex: 1,
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.dim,
    letterSpacing: 1.2,
    textAlign: "right",
  },
  nutrientRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  nutrientName: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.ink,
  },
  nutrientAvg: {
    flex: 1,
    fontFamily: font.mono,
    fontSize: 12,
    textAlign: "right",
  },
  nutrientTarget: {
    flex: 1,
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
    textAlign: "right",
  },
  nutrientPct: {
    flex: 1,
    fontFamily: font.displayBold,
    fontSize: 13,
    textAlign: "right",
  },
  label: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 16,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  err: { color: colors.coral, fontFamily: font.body, fontSize: 13 },
  linkCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  linkTitle: {
    fontFamily: font.displayBold,
    fontSize: 17,
    color: colors.ink,
    marginTop: 4,
  },
  linkSub: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    marginTop: 2,
    lineHeight: 19,
  },
  linkArrow: {
    fontFamily: font.displayBold,
    fontSize: 22,
  },
  adherenceCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.mint,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 4,
  },
  adherenceKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.mint,
    letterSpacing: 1.4,
  },
  adherenceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    marginTop: 4,
  },
  adherenceNum: {
    fontFamily: font.displayBold,
    fontSize: 44,
    color: colors.ink,
    lineHeight: 48,
  },
  adherenceOf: {
    fontFamily: font.body,
    fontSize: 16,
    color: colors.dim,
  },
  adherencePct: {
    fontFamily: font.mono,
    fontSize: 14,
    color: colors.dim,
  },
  adherenceCompare: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    lineHeight: 20,
    marginTop: 8,
  },
  prKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  prRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: spacing.sm,
  },
  prName: {
    fontFamily: font.displayBold,
    fontSize: 15,
    color: colors.ink,
  },
  prMeta: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    marginTop: 2,
  },
  prDate: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
  },
});

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
