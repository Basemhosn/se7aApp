import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { BackButton } from "@/components/BackButton";
import { SelectCard } from "@/components/OnboardingUI";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthContext";
import { track } from "@/lib/analytics";
import type { ActivityLevel, Goal } from "@/types";
import { colors, font, radius, spacing } from "@/lib/theme";

type HalalPref = "halal" | "no_preference";

interface ProfileRow {
  display_name: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity_level: ActivityLevel | null;
  goal: Goal | null;
  goal_rate_kg_per_week: number | null;
  goal_weight_kg: number | null;
  units: "metric" | "imperial" | null;
  onboarding_meta: Record<string, unknown> | null;
  allergies: string[] | null;
  excluded_ingredients: string[] | null;
}

interface EditPayload {
  display_name?: string | null;
  height_cm?: number;
  activity_level?: ActivityLevel;
  goal?: Goal;
  goal_rate_kg_per_week?: number;
  goal_weight_kg?: number | null;
  halal_pref?: HalalPref | null;
  allergies?: string[];
  excluded_ingredients?: string[];
}

export default function EditProfile() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [original, setOriginal] = useState<ProfileRow | null>(null);

  const [name, setName] = useState("");
  const [heightCm, setHeightCm] = useState<number | null>(null);
  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [goalWeight, setGoalWeight] = useState<number | null>(null);
  const [halal, setHalal] = useState<HalalPref | null>(null);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "display_name, height_cm, weight_kg, activity_level, goal, goal_rate_kg_per_week, goal_weight_kg, units, onboarding_meta, allergies, excluded_ingredients"
        )
        .eq("user_id", user.id)
        .maybeSingle();
      if (error || !data) {
        setErr(error?.message ?? "Couldn't load profile.");
        setLoading(false);
        return;
      }
      const row = data as ProfileRow;
      setOriginal(row);
      setName(row.display_name ?? "");
      setHeightCm(row.height_cm != null ? Number(row.height_cm) : null);
      setActivity(row.activity_level);
      setGoal(row.goal);
      setRate(
        row.goal_rate_kg_per_week != null
          ? Number(row.goal_rate_kg_per_week)
          : null
      );
      setGoalWeight(
        row.goal_weight_kg != null ? Number(row.goal_weight_kg) : null
      );
      const meta = row.onboarding_meta ?? {};
      const h = meta.halal_pref;
      setHalal(h === "halal" || h === "no_preference" ? h : null);
      setAllergies(Array.isArray(row.allergies) ? row.allergies : []);
      setExcluded(
        Array.isArray(row.excluded_ingredients) ? row.excluded_ingredients : []
      );
      setLoading(false);
    })();
  }, [user]);

  const payload = useMemo<EditPayload>(() => {
    if (!original) return {};
    const patch: EditPayload = {};
    const trimmedName = name.trim();
    const originalName = (original.display_name ?? "").trim();
    if (trimmedName !== originalName) {
      patch.display_name = trimmedName === "" ? null : trimmedName;
    }
    if (
      heightCm != null &&
      Number(original.height_cm ?? -1) !== heightCm
    ) {
      patch.height_cm = heightCm;
    }
    if (activity && activity !== original.activity_level) {
      patch.activity_level = activity;
    }
    if (goal && goal !== original.goal) {
      patch.goal = goal;
    }
    if (
      rate != null &&
      Number(original.goal_rate_kg_per_week ?? Number.NaN) !== rate
    ) {
      patch.goal_rate_kg_per_week = rate;
    }
    if (goalWeight !== (original.goal_weight_kg ?? null)) {
      patch.goal_weight_kg = goalWeight;
    }
    const origHalal = (original.onboarding_meta ?? {}).halal_pref ?? null;
    if (halal !== origHalal) {
      patch.halal_pref = halal;
    }
    const origAllergies = original.allergies ?? [];
    if (!arraysEqual(allergies, origAllergies)) {
      patch.allergies = allergies;
    }
    const origExcluded = original.excluded_ingredients ?? [];
    if (!arraysEqual(excluded, origExcluded)) {
      patch.excluded_ingredients = excluded;
    }
    return patch;
  }, [
    original,
    name,
    heightCm,
    activity,
    goal,
    rate,
    goalWeight,
    halal,
    allergies,
    excluded,
  ]);

  const dirty = Object.keys(payload).length > 0;

  // Rate options depend on the currently-selected goal so the label
  // ("moderate cut" vs "moderate bulk") matches direction. When goal
  // flips from cut→bulk we auto-flip the sign of the rate too.
  useEffect(() => {
    if (!goal || rate == null) return;
    if (goal === "maintain" && rate !== 0) setRate(0);
    else if (goal === "bulk" && rate < 0) setRate(Math.abs(rate));
    else if ((goal === "cut" || goal === "recomp") && rate > 0) setRate(-rate);
  }, [goal]); // rate intentionally omitted — one-shot adjust when goal changes

  const rateOpts = useCallback((): { v: number; label: string; sub: string }[] => {
    if (goal === "maintain") {
      return [
        {
          v: 0,
          label: t("onboarding.rate.hold"),
          sub: t("onboarding.rate.hold_sub"),
        },
      ];
    }
    const isBulk = goal === "bulk";
    const sign = isBulk ? 1 : -1;
    return [
      {
        v: 0.25 * sign,
        label: t("onboarding.rate.steady"),
        sub: t("onboarding.rate.steady_sub"),
      },
      {
        v: 0.5 * sign,
        label: t("onboarding.rate.moderate"),
        sub: t("onboarding.rate.moderate_sub"),
      },
      {
        v: 0.75 * sign,
        label: t("onboarding.rate.aggressive"),
        sub: t("onboarding.rate.aggressive_sub"),
      },
    ];
  }, [goal, t]);

  const promptHeight = () => {
    const current = heightCm ?? 175;
    Alert.prompt(
      isArabic ? "الطول (سم)" : "Height (cm)",
      isArabic ? `الحالي: ${current} سم` : `Current: ${current} cm`,
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.save"),
          onPress: (val) => {
            const n = Number((val ?? "").trim());
            if (Number.isFinite(n) && n > 100 && n < 250) {
              setHeightCm(Math.round(n));
            }
          },
        },
      ],
      "plain-text",
      String(current)
    );
  };

  const promptGoalWeight = () => {
    Alert.prompt(
      isArabic ? "الوزن المستهدف (كغ)" : "Target weight (kg)",
      isArabic
        ? "الرقم الذي تعمل نحوه. اتركه فارغ لإزالته."
        : "The weight you're working toward. Leave blank to clear.",
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: isArabic ? "إزالة" : "Clear",
          style: "destructive",
          onPress: () => setGoalWeight(null),
        },
        {
          text: t("common.save"),
          onPress: (val) => {
            const s = (val ?? "").trim();
            if (s === "") {
              setGoalWeight(null);
              return;
            }
            const n = Number(s);
            if (Number.isFinite(n) && n > 20 && n < 400) {
              setGoalWeight(Math.round(n * 10) / 10);
            }
          },
        },
      ],
      "plain-text",
      goalWeight != null ? String(goalWeight) : ""
    );
  };

  const save = async () => {
    if (!dirty || saving) return;
    setErr("");
    setSaving(true);
    try {
      await api("/api/profile/edit", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      track("profile_edited", {
        fields: Object.keys(payload).join(","),
      });
      router.back();
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  };

  const activityOpts: {
    v: ActivityLevel;
    label: string;
    sub: string;
    icon: keyof typeof Ionicons.glyphMap;
  }[] = [
    {
      v: "sedentary",
      label: t("onboarding.activity.sedentary"),
      sub: t("onboarding.activity.sedentary_sub"),
      icon: "bed-outline",
    },
    {
      v: "light",
      label: t("onboarding.activity.light"),
      sub: t("onboarding.activity.light_sub"),
      icon: "walk-outline",
    },
    {
      v: "moderate",
      label: t("onboarding.activity.moderate"),
      sub: t("onboarding.activity.moderate_sub"),
      icon: "footsteps-outline",
    },
    {
      v: "active",
      label: t("onboarding.activity.active"),
      sub: t("onboarding.activity.active_sub"),
      icon: "bicycle-outline",
    },
    {
      v: "very_active",
      label: t("onboarding.activity.very_active"),
      sub: t("onboarding.activity.very_active_sub"),
      icon: "flame-outline",
    },
  ];

  const goalOpts: {
    v: Goal;
    label: string;
    sub: string;
    icon: keyof typeof Ionicons.glyphMap;
  }[] = [
    {
      v: "cut",
      label: t("onboarding.goal.cut"),
      sub: t("onboarding.goal.cut_sub"),
      icon: "trending-down-outline",
    },
    {
      v: "recomp",
      label: t("onboarding.goal.recomp"),
      sub: t("onboarding.goal.recomp_sub"),
      icon: "swap-horizontal-outline",
    },
    {
      v: "maintain",
      label: t("onboarding.goal.maintain"),
      sub: t("onboarding.goal.maintain_sub"),
      icon: "pause-outline",
    },
    {
      v: "bulk",
      label: t("onboarding.goal.bulk"),
      sub: t("onboarding.goal.bulk_sub"),
      icon: "trending-up-outline",
    },
  ];

  if (loading) {
    return (
      <Screen>
        <View style={styles.head}>
          <BackButton />
        </View>
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.gold} />
        </View>
      </Screen>
    );
  }

  const footer = (
    <>
      {!!err && <Text style={styles.err}>{err}</Text>}
      <Btn
        label={saving ? t("common.saving") : t("common.save")}
        onPress={save}
        loading={saving}
        disabled={!dirty || saving}
      />
    </>
  );

  return (
    <Screen footer={footer}>
      <View style={styles.head}>
        <BackButton />
      </View>
      <Text style={styles.title}>
        {isArabic ? "تعديل الملف الشخصي" : "Edit profile"}
      </Text>
      <Text style={styles.sub}>
        {isArabic
          ? "أي تغيير في الهدف أو النشاط يعيد حساب سعراتك اليومية."
          : "Changing your goal or activity re-computes your daily targets."}
      </Text>

      <Section title={isArabic ? "الأساسيات" : "Basics"}>
        <View style={styles.field}>
          <Text style={styles.label}>{isArabic ? "الاسم" : "Name"}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={
              isArabic ? "كيف تحب أن نناديك" : "What should we call you?"
            }
            placeholderTextColor={colors.dim}
            autoCapitalize="words"
            style={styles.input}
            maxLength={60}
          />
        </View>
      </Section>

      <Section title={isArabic ? "الجسم" : "Body"}>
        <Pressable onPress={promptHeight} style={styles.row}>
          <Text style={styles.rowLabel}>{isArabic ? "الطول" : "Height"}</Text>
          <View style={styles.rowRight}>
            <Text style={styles.rowValue}>
              {heightCm != null
                ? `${heightCm} cm`
                : isArabic
                  ? "غير محدد"
                  : "Not set"}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.dim} />
          </View>
        </Pressable>
        <View style={[styles.row, { borderBottomWidth: 0 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>
              {isArabic ? "الوزن الحالي" : "Current weight"}
            </Text>
            <Text style={styles.rowHint}>
              {isArabic
                ? "سجّل وزناً جديداً من تبويب التقدّم."
                : "Log a new weight from the Progress tab."}
            </Text>
          </View>
          <Text style={styles.rowValue}>
            {original?.weight_kg != null
              ? `${Number(original.weight_kg).toFixed(1)} kg`
              : "—"}
          </Text>
        </View>
      </Section>

      <Section title={isArabic ? "الهدف" : "Goal"}>
        <View style={styles.cardStack}>
          {goalOpts.map((o) => (
            <SelectCard
              key={o.v}
              icon={o.icon}
              label={o.label}
              sublabel={o.sub}
              selected={goal === o.v}
              onPress={() => setGoal(o.v)}
            />
          ))}
        </View>

        {goal && goal !== "maintain" && (
          <>
            <Text style={styles.subhead}>
              {isArabic ? "المعدل الأسبوعي" : "Weekly rate"}
            </Text>
            <View style={styles.cardStack}>
              {rateOpts().map((o) => (
                <SelectCard
                  key={o.v}
                  label={o.label}
                  sublabel={o.sub}
                  selected={rate === o.v}
                  onPress={() => setRate(o.v)}
                />
              ))}
            </View>
          </>
        )}

        <Pressable
          onPress={promptGoalWeight}
          style={[styles.row, styles.rowInCard]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>
              {isArabic ? "الوزن المستهدف" : "Target weight"}
            </Text>
            <Text style={styles.rowHint}>
              {isArabic
                ? "اختياري — يظهر كخط في مخطط الإسقاط."
                : "Optional — shows as a line on the projection chart."}
            </Text>
          </View>
          <View style={styles.rowRight}>
            <Text style={styles.rowValue}>
              {goalWeight != null
                ? `${goalWeight} kg`
                : isArabic
                  ? "غير محدد"
                  : "Not set"}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.dim} />
          </View>
        </Pressable>
      </Section>

      <Section title={isArabic ? "النشاط" : "Activity"}>
        <View style={styles.cardStack}>
          {activityOpts.map((o) => (
            <SelectCard
              key={o.v}
              icon={o.icon}
              label={o.label}
              sublabel={o.sub}
              selected={activity === o.v}
              onPress={() => setActivity(o.v)}
            />
          ))}
        </View>
      </Section>

      <Section title={isArabic ? "النظام الغذائي" : "Diet"}>
        <View style={styles.cardStack}>
          <SelectCard
            icon="restaurant-outline"
            label={t("onboarding.halal.halal")}
            sublabel={t("onboarding.halal.halal_sub")}
            selected={halal === "halal"}
            onPress={() => setHalal("halal")}
          />
          <SelectCard
            icon="checkmark-circle-outline"
            label={t("onboarding.halal.no_pref")}
            sublabel={t("onboarding.halal.no_pref_sub")}
            selected={halal === "no_preference"}
            onPress={() => setHalal("no_preference")}
          />
        </View>
      </Section>

      <Section
        title={isArabic ? "الحساسية والاستثناءات" : "Allergies & exclusions"}
      >
        <TagInputRow
          label={isArabic ? "الحساسية (لا نأكلها أبداً)" : "Allergies (never)"}
          placeholder={
            isArabic ? "مثال: مكسرات، ألبان" : "e.g. nuts, dairy"
          }
          values={allergies}
          onChange={setAllergies}
        />
        <TagInputRow
          label={
            isArabic ? "استثناءات (لا نفضلها)" : "Excluded (prefer not)"
          }
          placeholder={
            isArabic ? "مثال: لحم غنم، كزبرة" : "e.g. lamb, cilantro"
          }
          values={excluded}
          onChange={setExcluded}
        />
      </Section>

      <Pressable
        onPress={() => router.push("/onboarding")}
        hitSlop={8}
        style={styles.redoLink}
      >
        <Text style={styles.redoLabel}>
          {isArabic
            ? "أعد الإعداد الكامل (السن، الجنس، تاريخ الميلاد)"
            : "Redo full setup (sex, birthdate, more)"}
        </Text>
      </Pressable>
    </Screen>
  );
}

/**
 * Compact chip-list input: shows current tags as removable pills and
 * a text field for adding more. Enter or comma commits. Used for
 * allergies + excluded ingredients — both are string arrays where the
 * exact wording matters (so the AI prompt sees "shellfish" verbatim,
 * not a fuzzy enum).
 */
function TagInputRow({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const v = draft.trim();
    if (!v) return;
    const set = new Set(values.map((s) => s.toLowerCase()));
    if (set.has(v.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
  };
  return (
    <View style={styles.tagRow}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.tagPills}>
        {values.map((v) => (
          <Pressable
            key={v}
            onPress={() => onChange(values.filter((x) => x !== v))}
            style={styles.tagPill}
          >
            <Text style={styles.tagPillText}>{v}</Text>
            <Ionicons name="close" size={12} color={colors.gold} />
          </Pressable>
        ))}
      </View>
      <View style={styles.tagInputWrap}>
        <TextInput
          value={draft}
          onChangeText={(v) => {
            if (v.endsWith(",")) {
              setDraft(v.slice(0, -1));
              // Defer to next tick so `values` reads the fresh state.
              setTimeout(commit, 0);
            } else {
              setDraft(v);
            }
          }}
          onSubmitEditing={commit}
          placeholder={placeholder}
          placeholderTextColor={colors.dim}
          returnKeyType="done"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.tagInput}
        />
        <Pressable onPress={commit} hitSlop={6} style={styles.tagAddBtn}>
          <Ionicons name="add" size={16} color={colors.gold} />
        </Pressable>
      </View>
    </View>
  );
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
  return true;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionH}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { marginTop: spacing.sm },
  title: {
    fontFamily: font.displayBold,
    fontSize: 30,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  sub: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
    lineHeight: 20,
    marginTop: 4,
  },
  section: { marginTop: spacing.lg, gap: spacing.sm },
  sectionH: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.4,
  },
  subhead: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.4,
    marginTop: spacing.md,
  },
  cardStack: { gap: spacing.xs },
  field: { gap: spacing.xs },
  label: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
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
  tagRow: { gap: spacing.xs },
  tagPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tagPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.gold + "55",
    backgroundColor: colors.gold + "10",
  },
  tagPillText: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.ink,
  },
  tagInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  tagInput: {
    flex: 1,
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 15,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  tagAddBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
  },
  rowInCard: { marginTop: spacing.sm },
  rowLabel: { fontFamily: font.body, fontSize: 15, color: colors.ink },
  rowHint: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    marginTop: 2,
  },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowValue: { fontFamily: font.mono, fontSize: 12, color: colors.dim },
  err: {
    color: colors.coral,
    fontFamily: font.body,
    fontSize: 13,
    marginBottom: spacing.xs,
  },
  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  redoLink: {
    marginTop: spacing.xl,
    alignSelf: "center",
    paddingVertical: spacing.md,
  },
  redoLabel: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    textDecorationLine: "underline",
  },
});
