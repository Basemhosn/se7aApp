import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
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

/**
 * Progress tab (2026-09-07 revamp).
 *
 * Refactored from a single 1350-line vertical scroll into three
 * segmented sub-tabs so users can jump straight to what they came
 * for. Nothing was removed; every endpoint + interactive control
 * survived, just re-homed to the appropriate sub-tab:
 *
 *   Body      · weight trend + projection + weighin form + photos +
 *               measurements + body scan link
 *   Nutrition · adherence ring + comparison + top-foods + nutrients +
 *               calendar link
 *   Training  · streak card + PRs
 *
 * The 30/60/90D range chip persists across all three sub-tabs so a
 * user comparing food + weight trends over the same window doesn't
 * have to re-select the range each time.
 */

// ── Types (identical to prior file) ─────────────────────────────────

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

type SubTab = "body" | "nutrition" | "training";

export default function Progress() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [subTab, setSubTab] = useState<SubTab>("body");
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
  const [refreshing, setRefreshing] = useState(false);

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
      /* silent */
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
    <SafeAreaView style={styles.shell} edges={["top", "bottom"]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load(days);
              setRefreshing(false);
            }}
            tintColor={colors.gold}
          />
        }
      >
        <View style={styles.headRow}>
          <Text style={styles.headTitle}>{t("progress.title")}</Text>
          <Pressable
            style={styles.headAvatar}
            onPress={() => router.push("/settings")}
          >
            <Ionicons name="person-outline" size={18} color={colors.ink} />
          </Pressable>
        </View>

        {/* Segmented sub-tab control */}
        <View style={styles.segRow}>
          <SegBtn
            label={isArabic ? "الجسم" : "Body"}
            active={subTab === "body"}
            onPress={() => setSubTab("body")}
          />
          <SegBtn
            label={isArabic ? "التغذية" : "Nutrition"}
            active={subTab === "nutrition"}
            onPress={() => setSubTab("nutrition")}
          />
          <SegBtn
            label={isArabic ? "التمرين" : "Training"}
            active={subTab === "training"}
            onPress={() => setSubTab("training")}
          />
        </View>

        {/* Range chips — persist across sub-tabs */}
        <View style={styles.rangeRow}>
          {RANGES.map((r) => (
            <Pressable
              key={r.days}
              onPress={() => setDays(r.days)}
              style={[
                styles.rangeChip,
                days === r.days && styles.rangeChipOn,
              ]}
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

        {subTab === "body" ? (
          <BodySubtab
            trend={trend}
            projection={projection}
            photos={photos}
            measurements={measurements}
            weight={weight}
            bf={bf}
            logging={logging}
            logErr={logErr}
            goalWeightInput={goalWeightInput}
            savingGoal={savingGoal}
            days={days}
            loading={loading}
            isArabic={isArabic}
            t={t}
            onWeightChange={setWeight}
            onBfChange={setBf}
            onGoalWeightChange={setGoalWeightInput}
            onLogWeight={logWeight}
            onSaveGoal={saveGoalWeight}
          />
        ) : subTab === "nutrition" ? (
          <NutritionSubtab
            adherence={adherence}
            days={days}
            isArabic={isArabic}
            t={t}
          />
        ) : (
          <TrainingSubtab
            streak={streak}
            prs={prs}
            trend={trend}
            days={days}
            isArabic={isArabic}
            t={t}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────────────────────────────
// Segmented control

function SegBtn({
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
      style={[styles.segBtn, active && styles.segBtnActive]}
      onPress={onPress}
    >
      <Text
        style={[styles.segBtnText, active && styles.segBtnTextActive]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ────────────────────────────────────────────────────────────────────
// Body sub-tab

function BodySubtab({
  trend,
  projection,
  photos,
  measurements,
  weight,
  bf,
  logging,
  logErr,
  goalWeightInput,
  savingGoal,
  days,
  loading,
  isArabic,
  t,
  onWeightChange,
  onBfChange,
  onGoalWeightChange,
  onLogWeight,
  onSaveGoal,
}: {
  trend: TrendResponse | null;
  projection: ProjectionResponse | null;
  photos: ProgressPhoto[];
  measurements: MeasurementsResponse | null;
  weight: string;
  bf: string;
  logging: boolean;
  logErr: string;
  goalWeightInput: string;
  savingGoal: boolean;
  days: number;
  loading: boolean;
  isArabic: boolean;
  t: (key: string, opts?: Record<string, string | number>) => string;
  onWeightChange: (v: string) => void;
  onBfChange: (v: string) => void;
  onGoalWeightChange: (v: string) => void;
  onLogWeight: () => void;
  onSaveGoal: () => void;
}) {
  const latestKg =
    trend && trend.points.length > 0
      ? trend.points[trend.points.length - 1]!.weight_kg
      : null;
  const deltaLabel = weightDelta(trend?.points);
  const deltaTint = weightDeltaTint(trend?.points);

  return (
    <View style={styles.subtabWrap}>
      {/* Hero: latest weight + delta */}
      <View style={styles.heroCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroKicker}>
            {isArabic ? "الوزن الحالي" : "CURRENT WEIGHT"}
          </Text>
          <Text style={styles.heroValue}>
            {latestKg != null ? `${latestKg}` : "—"}
            <Text style={styles.heroUnit}> kg</Text>
          </Text>
          <Text style={[styles.heroDelta, { color: deltaTint }]}>
            {deltaLabel === "—"
              ? isArabic
                ? "لا تغيير بعد"
                : "No change yet"
              : `${deltaLabel} kg · ${days}d`}
          </Text>
        </View>
      </View>

      {/* Weight trend chart */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("progress.weight_trend")}</Text>
        {loading ? (
          <ActivityIndicator
            color={colors.gold}
            style={{ marginVertical: spacing.lg }}
          />
        ) : (
          <TrendChart points={trend?.points ?? []} />
        )}
      </View>

      {/* Projection */}
      {projection && !projection.insufficient && projection.regression ? (
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
                onChangeText={onGoalWeightChange}
                keyboardType="numeric"
                placeholder={t(
                  "progress_cards.projection.target_placeholder"
                )}
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
                onPress={onSaveGoal}
                disabled={savingGoal}
                variant="ghost"
              />
            </View>
          </View>
        </View>
      ) : null}

      {/* Log weighin form */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("progress.log_weighin")}</Text>
        <Text style={styles.cardSub}>{t("progress.log_weighin_sub")}</Text>
        <View style={styles.formRow}>
          <View style={{ flex: 2 }}>
            <Text style={styles.label}>{t("progress.weight_label")}</Text>
            <TextInput
              value={weight}
              onChangeText={onWeightChange}
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
              onChangeText={onBfChange}
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
          onPress={onLogWeight}
          loading={logging}
          disabled={!weight || Number(weight) <= 0}
        />
      </View>

      {/* Photos preview */}
      <Pressable
        onPress={() => router.push("/progress-photos")}
        style={styles.previewCard}
      >
        <View style={styles.previewHeadRow}>
          <View>
            <Text style={[styles.kicker, { color: colors.gold }]}>
              {isArabic ? "صور التقدم" : "PROGRESS PHOTOS"}
            </Text>
            <Text style={styles.linkTitle}>
              {photos.length === 0
                ? isArabic
                  ? "شاهد تغيّرك"
                  : "Watch yourself change"
                : `${photos.length} ${
                    isArabic
                      ? "صورة"
                      : `photo${photos.length === 1 ? "" : "s"}`
                  }`}
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
            {isArabic
              ? "صور أمامية / جانبية / خلفية أسبوعية، خاصة، مقارنة جنبًا إلى جنب."
              : "Weekly front/side/back photos, private, side-by-side compare."}
          </Text>
        )}
      </Pressable>

      {/* Measurements preview */}
      <Pressable
        onPress={() => router.push("/measurements")}
        style={styles.previewCard}
      >
        <View style={styles.previewHeadRow}>
          <View>
            <Text style={[styles.kicker, { color: colors.mint }]}>
              {isArabic ? "قياس الشريط" : "TAPE MEASURE"}
            </Text>
            <Text style={styles.linkTitle}>
              {measurements && measurements.count > 0
                ? `${measurements.count} ${
                    isArabic
                      ? "قياس"
                      : `entr${measurements.count === 1 ? "y" : "ies"}`
                  }`
                : isArabic
                  ? "القياسات"
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
            {isArabic
              ? "الخصر / الورك / الذراع / الصدر / الفخذ / الرقبة."
              : "Waist / hip / arm / chest / thigh / neck. Deltas vs your first entry."}
          </Text>
        )}
      </Pressable>

      {/* Body scan link */}
      <Pressable
        onPress={() => router.push("/scan/body")}
        style={styles.linkCard}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: colors.coral }]}>
            {t("progress.body_scan_kicker")}
          </Text>
          <Text style={styles.linkTitle}>{t("progress.body_scan_title")}</Text>
          <Text style={styles.linkSub}>{t("progress.body_scan_sub")}</Text>
        </View>
        <Text style={[styles.linkArrow, { color: colors.coral }]}>→</Text>
      </Pressable>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// Nutrition sub-tab

function NutritionSubtab({
  adherence,
  days,
  isArabic,
  t,
}: {
  adherence: AdherenceResponse | null;
  days: number;
  isArabic: boolean;
  t: (key: string, opts?: Record<string, string | number>) => string;
}) {
  return (
    <View style={styles.subtabWrap}>
      {/* Adherence hero */}
      {adherence ? (
        <View style={styles.adherenceHero}>
          <AdherenceRing
            value={adherence.days_logged}
            outOf={adherence.days_window}
            kicker={t("progress.adherence_kicker")}
            tint={colors.mint}
            size={180}
          />
          <Text style={styles.compareLine}>{adherence.comparison}.</Text>
        </View>
      ) : null}

      <TopFoods days={days} />
      <Nutrients days={days} />

      {/* Calendar link */}
      <Pressable
        onPress={() => router.push("/calendar")}
        style={styles.linkCard}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: colors.gold }]}>
            {t("progress.calendar_kicker")}
          </Text>
          <Text style={styles.linkTitle}>{t("progress.calendar_title")}</Text>
          <Text style={styles.linkSub}>{t("progress.calendar_sub")}</Text>
        </View>
        <Text style={[styles.linkArrow, { color: colors.gold }]}>→</Text>
      </Pressable>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// Training sub-tab

function TrainingSubtab({
  streak,
  prs,
  trend,
  days,
  isArabic,
  t,
}: {
  streak: StreakResponse | null;
  prs: PrsResponse | null;
  trend: TrendResponse | null;
  days: number;
  isArabic: boolean;
  t: (key: string, opts?: Record<string, string | number>) => string;
}) {
  return (
    <View style={styles.subtabWrap}>
      {/* Streak card */}
      {streak ? (
        <View style={styles.card}>
          <Text style={[styles.kicker, { color: colors.gold }]}>
            {isArabic ? "السلسلة" : "STREAK"}
          </Text>
          <View style={styles.streakRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.streakBig}>
                {streak.current_days}
                <Text style={styles.streakUnit}>
                  {" "}
                  {streak.current_days === 1
                    ? t("progress.unit_day")
                    : t("progress.unit_days")}
                </Text>
              </Text>
              <Text style={styles.streakMeta}>
                {isArabic
                  ? `${streak.days_this_week}/7 هذا الأسبوع · أفضل ${streak.longest_days}`
                  : `${streak.days_this_week}/7 this week · best ${streak.longest_days}`}
              </Text>
            </View>
            <View style={styles.streakFlame}>
              <Ionicons name="flame" size={36} color={colors.gold} />
            </View>
          </View>
        </View>
      ) : null}

      {/* PRs card */}
      {prs && prs.prs.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.prKicker}>{t("progress.prs_kicker")}</Text>
          <Text style={styles.cardTitle}>{t("progress.prs_title")}</Text>
          <Text style={styles.cardSub}>
            {t("progress.prs_sub", {
              shown: Math.min(5, prs.prs.length),
              total: prs.count,
            })}
          </Text>
          {prs.prs.slice(0, 5).map((pr) => (
            <View key={pr.exercise} style={styles.prRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.prName}>{pr.exercise}</Text>
                <Text style={styles.prMeta}>
                  {pr.best_weight_kg} kg × {pr.best_reps}
                  {"  ·  "}
                  {t("progress.prs_meta_est_1rm", { value: pr.est_1rm_kg })}
                </Text>
              </View>
              <Text style={styles.prDate}>{shortDate(pr.achieved_at)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Ionicons name="barbell-outline" size={24} color={colors.dim} />
          <Text style={styles.emptyTitle}>
            {isArabic ? "لا PRs بعد" : "No PRs yet"}
          </Text>
          <Text style={styles.emptyBody}>
            {isArabic
              ? "سجّل تمارينك لتظهر PRs هنا."
              : "Log workouts to see your PRs here."}
          </Text>
        </View>
      )}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────
// TopFoods (unchanged shape, just re-homed under Nutrition sub-tab)

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
      <Text style={styles.cardTitle}>
        {t("progress_cards.top_foods.title", {
          macro: macroLabel.toLowerCase(),
        })}
      </Text>
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
                <Text style={[styles.topFoodRankText, { color: meta.tint }]}>
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
                <Text style={[styles.topFoodShareVal, { color: meta.tint }]}>
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

// ────────────────────────────────────────────────────────────────────
// Nutrients (unchanged shape)

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

function Nutrients({ days }: { days: number }) {
  const { t } = useTranslation();
  const [data, setData] = useState<NutrientsResponse | null>(null);
  const [loading, setLoading] = useState(true);

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
            const overTarget = n.target !== null && n.avg_high > n.target;
            const hitTarget = n.target !== null && n.avg_high >= n.target;
            const tint = !hasData
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

// ────────────────────────────────────────────────────────────────────
// Helpers

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
  return t(key, { rate, weight: currentKg ?? 0 });
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ────────────────────────────────────────────────────────────────────
// Styles

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
    gap: spacing.md,
  },
  // Header
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  headTitle: {
    color: colors.ink,
    fontFamily: font.displayBold,
    fontSize: 28,
  },
  headAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  // Segmented control
  segRow: {
    flexDirection: "row",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    padding: 3,
    gap: 2,
  },
  segBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  segBtnActive: {
    backgroundColor: colors.gold,
  },
  segBtnText: {
    color: colors.dim,
    fontFamily: font.bodyBold,
    fontSize: 13,
  },
  segBtnTextActive: {
    color: colors.bg,
  },
  // Range chips
  rangeRow: { flexDirection: "row", gap: 4 },
  rangeChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
  },
  rangeChipOn: {
    borderColor: colors.gold,
    backgroundColor: "rgba(246,183,60,0.10)",
  },
  rangeText: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    letterSpacing: 0.8,
  },
  rangeTextOn: { color: colors.gold },
  // Sub-tab wrapper
  subtabWrap: {
    gap: spacing.md,
  },
  // Body hero (latest weight + delta)
  heroCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  heroKicker: {
    color: colors.dim,
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  heroValue: {
    color: colors.ink,
    fontFamily: font.displayBold,
    fontSize: 44,
    lineHeight: 48,
    marginTop: 4,
  },
  heroUnit: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 16,
  },
  heroDelta: {
    fontFamily: font.mono,
    fontSize: 13,
    marginTop: 4,
    letterSpacing: 0.4,
  },
  // Adherence hero (Nutrition sub-tab)
  adherenceHero: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.md,
  },
  compareLine: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    lineHeight: 19,
    textAlign: "center",
  },
  // Cards
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: font.displayBold,
    fontSize: 17,
    color: colors.ink,
  },
  cardSub: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
  },
  kicker: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 1.4,
  },
  // Streak in Training
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  streakBig: {
    color: colors.gold,
    fontFamily: font.displayBold,
    fontSize: 44,
    lineHeight: 48,
  },
  streakUnit: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 14,
  },
  streakMeta: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 12,
    marginTop: 4,
  },
  streakFlame: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.gold + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  // Projection
  projStatsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  projStat: { minWidth: 68 },
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
  // Form
  formRow: { flexDirection: "row", gap: spacing.sm },
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
  // Preview cards
  previewCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
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
  linkTitle: {
    fontFamily: font.displayBold,
    fontSize: 15,
    color: colors.ink,
    marginTop: 4,
  },
  linkSub: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
    marginTop: 2,
    lineHeight: 17,
  },
  linkCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  linkArrow: {
    fontFamily: font.displayBold,
    fontSize: 22,
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
  // TopFoods
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
  // Nutrients
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
  // PRs
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
  // Empty state
  emptyCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.xs,
  },
  emptyTitle: {
    color: colors.ink,
    fontFamily: font.displayBold,
    fontSize: 15,
    marginTop: 4,
  },
  emptyBody: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 17,
  },
});
