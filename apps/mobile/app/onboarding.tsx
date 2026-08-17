import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { Wordmark } from "@/components/Wordmark";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthContext";
import type { ActivityLevel, Goal, Sex } from "@/types";
import {
  rankPrograms,
  type Equipment,
  type Experience,
  type Program,
  type Scored,
} from "@/lib/programs";
import { colors, font, radius, spacing } from "@/lib/theme";

const DEFAULT_RATE: Record<Goal, number> = {
  cut: -0.5,
  recomp: -0.25,
  maintain: 0,
  bulk: 0.25,
};

const STEPS = [
  "welcome",
  "sex",
  "birthdate",
  "size",
  "activity",
  "goal",
  "rate",
  "experience",
  "equipment",
  "days",
  "rest_day",
  "injuries",
  "reveal",
] as const;
type Step = (typeof STEPS)[number];

export default function Onboarding() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("welcome");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [name, setName] = useState("");
  const [sex, setSex] = useState<Sex | null>(null);
  const [birthdate, setBirthdate] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [rate, setRate] = useState<number>(-0.5);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [restDayDelta, setRestDayDelta] = useState<number>(0);
  const [injuryText, setInjuryText] = useState("");

  const [ranked, setRanked] = useState<Scored[] | null>(null);
  const [pickedProgram, setPickedProgram] = useState<Program | null>(null);
  const [returning, setReturning] = useState(false);

  // Prefill from existing profile so returning users don't re-enter
  // everything. Runs once on mount; new users (no onboarded_at) get no-op.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !user) return;
    prefilled.current = true;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!profile || !profile.onboarded_at) return;
      setReturning(true);
      if (profile.display_name) setName(profile.display_name);
      if (profile.sex) setSex(profile.sex as Sex);
      if (profile.birthdate) setBirthdate(profile.birthdate);
      if (profile.height_cm != null) setHeight(String(profile.height_cm));
      if (profile.weight_kg != null) setWeight(String(profile.weight_kg));
      if (profile.activity_level)
        setActivity(profile.activity_level as ActivityLevel);
      if (profile.goal) setGoal(profile.goal as Goal);
      if (profile.goal_rate_kg_per_week != null)
        setRate(Number(profile.goal_rate_kg_per_week));
      if (profile.training_experience)
        setExperience(profile.training_experience as Experience);
      if (profile.equipment_access)
        setEquipment(profile.equipment_access as Equipment);
      if (profile.days_per_week != null) setDays(profile.days_per_week);
      if (profile.rest_day_kcal_delta != null)
        setRestDayDelta(profile.rest_day_kcal_delta);
      if (Array.isArray(profile.injuries) && profile.injuries.length > 0) {
        setInjuryText((profile.injuries as string[]).join(", "));
      }
    })();
  }, [user]);

  const stepIndex = STEPS.indexOf(step);
  const progress = (stepIndex / (STEPS.length - 1)) * 100;

  const canAdvance = (() => {
    switch (step) {
      case "welcome": return true;
      case "sex": return !!sex;
      case "birthdate": return /^\d{4}-\d{2}-\d{2}$/.test(birthdate);
      case "size": return Number(height) > 0 && Number(weight) > 0;
      case "activity": return !!activity;
      case "goal": return !!goal;
      case "rate": return !Number.isNaN(rate);
      case "experience": return !!experience;
      case "equipment": return !!equipment;
      case "days": return !!days;
      case "rest_day": return true; // always advances — default 0
      case "injuries": return true; // optional
      case "reveal": return !!pickedProgram;
      default: return false;
    }
  })();

  const back = () => {
    setErr("");
    const i = STEPS.indexOf(step);
    if (i > 0) setStep(STEPS[i - 1]!);
  };

  const advance = async () => {
    setErr("");
    if (!canAdvance) return;
    const i = STEPS.indexOf(step);
    const next = STEPS[i + 1];
    if (!next) return;

    // Between "injuries" and "reveal": submit profile + fetch catalog.
    if (step === "injuries") {
      setBusy(true);
      try {
        const injuries = injuryText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        await api("/api/profile", {
          method: "POST",
          body: JSON.stringify({
            display_name: name.trim() || undefined,
            sex,
            birthdate,
            height_cm: Number(height),
            weight_kg: Number(weight),
            activity_level: activity,
            goal,
            goal_rate_kg_per_week: rate,
            units: "metric",
            training_experience: experience,
            equipment_access: equipment,
            days_per_week: days,
            injuries,
            rest_day_kcal_delta: restDayDelta,
          }),
        });
        const catalog = await api<{ programs: Program[] }>(
          "/api/workouts/catalog"
        );
        const scored = rankPrograms(catalog.programs, {
          experience: experience!,
          equipment: equipment!,
          days_per_week: days!,
          goal: goal!,
        });
        setRanked(scored);
        setPickedProgram(scored[0]?.program ?? null);
      } catch (e) {
        setErr((e as Error).message || t("onboarding.couldnt_compute"));
        setBusy(false);
        return;
      }
      setBusy(false);
    }

    setStep(next);
  };

  const finish = async () => {
    if (!pickedProgram) return;
    setBusy(true);
    setErr("");
    try {
      await api("/api/workouts/pick", {
        method: "POST",
        body: JSON.stringify({ program_id: pickedProgram.id }),
      });
      // First-time users get pushed straight into a plate scan for the
      // AHA moment. Returning users (redoing plan) go back to Home.
      router.replace(returning ? "/" : "/scan/plate");
    } catch (e) {
      setErr((e as Error).message || t("onboarding.couldnt_save_plan"));
      setBusy(false);
    }
  };

  const footer = (
    <>
      {!!err && <Text style={styles.err}>{err}</Text>}
      <View style={styles.footerRow}>
        {stepIndex > 0 && step !== "reveal" ? (
          <View style={{ flex: 1 }}>
            <Btn label={t("common.back")} variant="ghost" onPress={back} disabled={busy} />
          </View>
        ) : null}
        <View style={{ flex: 2 }}>
          {step === "reveal" ? (
            <Btn
              label={busy ? t("common.saving") : t("onboarding.cta_start_plan")}
              onPress={finish}
              loading={busy}
              disabled={!canAdvance}
            />
          ) : (
            <Btn
              label={
                busy
                  ? t("onboarding.cta_building")
                  : step === "welcome"
                    ? t("onboarding.welcome_cta_new")
                    : step === "injuries"
                      ? t("onboarding.cta_show_plan")
                      : t("onboarding.cta_continue")
              }
              onPress={advance}
              loading={busy}
              disabled={!canAdvance}
            />
          )}
        </View>
      </View>
    </>
  );

  return (
    <Screen footer={footer}>
      <View style={styles.head}>
        <Wordmark size={20} />
      </View>

      {step !== "welcome" && (
        <View style={styles.progressWrap}>
          <View style={[styles.progressBar, { width: `${progress}%` }]} />
        </View>
      )}

      {step === "welcome" && (
        <WelcomeStep name={user?.email?.split("@")[0]} returning={returning} />
      )}

      {step === "sex" && (
        <StepBody
          kicker={t("onboarding.sex.kicker")}
          h1={t("onboarding.sex.title")}
          hint={t("onboarding.sex.hint")}
        >
          <BigChoice
            options={[
              { v: "male", label: t("onboarding.sex.male") },
              { v: "female", label: t("onboarding.sex.female") },
            ]}
            value={sex}
            onChange={(v) => setSex(v as Sex)}
          />
        </StepBody>
      )}

      {step === "birthdate" && (
        <StepBody
          kicker={t("onboarding.birthdate.kicker")}
          h1={t("onboarding.birthdate.title")}
          hint={t("onboarding.birthdate.hint")}
        >
          <TextInput
            value={birthdate}
            onChangeText={setBirthdate}
            placeholder="1995-06-11"
            placeholderTextColor={colors.dim}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            style={styles.bigInput}
          />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t("onboarding.birthdate.name_placeholder", { email: user?.email?.split("@")[0] ?? "" })}
            placeholderTextColor={colors.dim}
            style={styles.input}
          />
        </StepBody>
      )}

      {step === "size" && (
        <StepBody
          kicker={t("onboarding.size.kicker")}
          h1={t("onboarding.size.title")}
          hint={t("onboarding.size.hint")}
        >
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{t("onboarding.size.height_label")}</Text>
              <TextInput
                value={height}
                onChangeText={setHeight}
                keyboardType="numeric"
                placeholder="175"
                placeholderTextColor={colors.dim}
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{t("onboarding.size.weight_label")}</Text>
              <TextInput
                value={weight}
                onChangeText={setWeight}
                keyboardType="numeric"
                placeholder="75"
                placeholderTextColor={colors.dim}
                style={styles.input}
              />
            </View>
          </View>
        </StepBody>
      )}

      {step === "activity" && (
        <StepBody
          kicker={t("onboarding.activity.kicker")}
          h1={t("onboarding.activity.title")}
          hint={t("onboarding.activity.hint")}
        >
          <BigChoice
            options={[
              { v: "sedentary", label: t("onboarding.activity.sedentary"), sub: t("onboarding.activity.sedentary_sub") },
              { v: "light", label: t("onboarding.activity.light"), sub: t("onboarding.activity.light_sub") },
              { v: "moderate", label: t("onboarding.activity.moderate"), sub: t("onboarding.activity.moderate_sub") },
              { v: "active", label: t("onboarding.activity.active"), sub: t("onboarding.activity.active_sub") },
              { v: "very_active", label: t("onboarding.activity.very_active"), sub: t("onboarding.activity.very_active_sub") },
            ]}
            value={activity}
            onChange={(v) => setActivity(v as ActivityLevel)}
          />
        </StepBody>
      )}

      {step === "goal" && (
        <StepBody
          kicker={t("onboarding.goal.kicker")}
          h1={t("onboarding.goal.title")}
          hint={t("onboarding.goal.hint")}
        >
          <BigChoice
            options={[
              { v: "cut", label: t("onboarding.goal.cut"), sub: t("onboarding.goal.cut_sub") },
              { v: "recomp", label: t("onboarding.goal.recomp"), sub: t("onboarding.goal.recomp_sub") },
              { v: "maintain", label: t("onboarding.goal.maintain"), sub: t("onboarding.goal.maintain_sub") },
              { v: "bulk", label: t("onboarding.goal.bulk"), sub: t("onboarding.goal.bulk_sub") },
            ]}
            value={goal}
            onChange={(v) => {
              const g = v as Goal;
              setGoal(g);
              setRate(DEFAULT_RATE[g]);
            }}
          />
        </StepBody>
      )}

      {step === "rate" && (
        <StepBody
          kicker={t("onboarding.rate.kicker")}
          h1={t("onboarding.rate.title")}
          hint={t("onboarding.rate.hint")}
        >
          <View style={styles.chipRow}>
            {rateOptions(goal ?? "maintain", t).map((r) => (
              <Pressable
                key={r.v}
                onPress={() => setRate(r.v)}
                style={[styles.chip, Math.abs(rate - r.v) < 0.001 && styles.chipOn]}
              >
                <Text
                  style={[
                    styles.chipText,
                    Math.abs(rate - r.v) < 0.001 && styles.chipTextOn,
                  ]}
                >
                  {r.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.sub}>
            {rateDescription(rate, t)}
          </Text>
        </StepBody>
      )}

      {step === "experience" && (
        <StepBody
          kicker={t("onboarding.experience.kicker")}
          h1={t("onboarding.experience.title")}
          hint={t("onboarding.experience.hint")}
        >
          <BigChoice
            options={[
              { v: "beginner", label: t("onboarding.experience.beginner"), sub: t("onboarding.experience.beginner_sub") },
              { v: "intermediate", label: t("onboarding.experience.intermediate"), sub: t("onboarding.experience.intermediate_sub") },
              { v: "advanced", label: t("onboarding.experience.advanced"), sub: t("onboarding.experience.advanced_sub") },
            ]}
            value={experience}
            onChange={(v) => setExperience(v as Experience)}
          />
        </StepBody>
      )}

      {step === "equipment" && (
        <StepBody
          kicker={t("onboarding.equipment.kicker")}
          h1={t("onboarding.equipment.title")}
          hint={t("onboarding.equipment.hint")}
        >
          <BigChoice
            options={[
              { v: "gym", label: t("onboarding.equipment.gym"), sub: t("onboarding.equipment.gym_sub") },
              { v: "home", label: t("onboarding.equipment.home"), sub: t("onboarding.equipment.home_sub") },
              { v: "bodyweight", label: t("onboarding.equipment.bodyweight"), sub: t("onboarding.equipment.bodyweight_sub") },
              { v: "both", label: t("onboarding.equipment.both"), sub: t("onboarding.equipment.both_sub") },
            ]}
            value={equipment}
            onChange={(v) => setEquipment(v as Equipment)}
          />
        </StepBody>
      )}

      {step === "days" && (
        <StepBody
          kicker={t("onboarding.days.kicker")}
          h1={t("onboarding.days.title")}
          hint={t("onboarding.days.hint")}
        >
          <View style={styles.chipRow}>
            {[2, 3, 4, 5, 6].map((n) => (
              <Pressable
                key={n}
                onPress={() => setDays(n)}
                style={[
                  styles.dayChip,
                  days === n && styles.dayChipOn,
                ]}
              >
                <Text
                  style={[styles.dayChipText, days === n && styles.dayChipTextOn]}
                >
                  {n}
                </Text>
              </Pressable>
            ))}
          </View>
        </StepBody>
      )}

      {step === "rest_day" && (
        <StepBody
          kicker={t("onboarding.rest_day.kicker")}
          h1={t("onboarding.rest_day.title")}
          hint={t("onboarding.rest_day.hint")}
        >
          <BigChoice
            options={[
              { v: "0", label: t("onboarding.rest_day.same"), sub: t("onboarding.rest_day.same_sub") },
              { v: "-200", label: t("onboarding.rest_day.minus_200"), sub: t("onboarding.rest_day.minus_200_sub") },
              { v: "-300", label: t("onboarding.rest_day.minus_300"), sub: t("onboarding.rest_day.minus_300_sub") },
              { v: "-500", label: t("onboarding.rest_day.minus_500"), sub: t("onboarding.rest_day.minus_500_sub") },
            ]}
            value={String(restDayDelta)}
            onChange={(v) => setRestDayDelta(Number(v))}
          />
        </StepBody>
      )}

      {step === "injuries" && (
        <StepBody
          kicker={t("onboarding.injuries.kicker")}
          h1={t("onboarding.injuries.title")}
          hint={t("onboarding.injuries.hint")}
        >
          <TextInput
            value={injuryText}
            onChangeText={setInjuryText}
            placeholder={t("onboarding.injuries.placeholder")}
            placeholderTextColor={colors.dim}
            autoCapitalize="none"
            style={styles.input}
            multiline
          />
        </StepBody>
      )}

      {step === "reveal" && ranked && pickedProgram && (
        <PlanReveal
          ranked={ranked}
          picked={pickedProgram}
          onPick={setPickedProgram}
          goal={goal!}
          t={t}
        />
      )}
    </Screen>
  );
}

function WelcomeStep({
  name,
  returning,
}: {
  name?: string;
  returning: boolean;
}) {
  return (
    <View style={{ gap: spacing.md, paddingTop: spacing.xxl }}>
      <Text style={styles.kicker}>
        {returning ? "REDO YOUR PLAN" : "YOUR PLAN"}
      </Text>
      <Text style={styles.hero}>
        {returning
          ? `Life changed, ${name ?? "hey"}?`
          : name
            ? `Hey ${name}.`
            : "Let's build your plan."}
      </Text>
      <Text style={styles.heroSub}>
        {returning
          ? "Your current answers are prefilled — just change what's different and tap through the rest."
          : "Eleven quick questions. We compute your calorie + macro targets and pick a workout plan that fits your week."}
      </Text>
      <Text style={[styles.sub, { marginTop: spacing.md }]}>
        {returning
          ? "Fast — usually 20 seconds if not much has changed."
          : "~90 seconds. You can change any of it any time."}
      </Text>
    </View>
  );
}

function StepBody({
  kicker,
  h1,
  hint,
  children,
}: {
  kicker: string;
  h1: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: spacing.md, paddingTop: spacing.md }}>
      <Text style={styles.kicker}>{kicker}</Text>
      <Text style={styles.h1}>{h1}</Text>
      <Text style={styles.sub}>{hint}</Text>
      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>{children}</View>
    </View>
  );
}

function BigChoice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { v: T; label: string; sub?: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      {options.map((o) => {
        const on = o.v === value;
        return (
          <Pressable
            key={o.v}
            onPress={() => onChange(o.v)}
            style={[styles.card, on && styles.cardOn]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardLabel, on && styles.cardLabelOn]}>
                {o.label}
              </Text>
              {o.sub && <Text style={styles.cardSub}>{o.sub}</Text>}
            </View>
            <View style={[styles.radio, on && styles.radioOn]}>
              {on && <View style={styles.radioDot} />}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function PlanReveal({
  ranked,
  picked,
  onPick,
  goal,
  t,
}: {
  ranked: Scored[];
  picked: Program;
  onPick: (p: Program) => void;
  goal: Goal;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const others = ranked.slice(1, 3).map((r) => r.program);
  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.kicker}>{t("onboarding.reveal.kicker")}</Text>
      <Text style={styles.h1}>{t("onboarding.reveal.title")}</Text>
      <Text style={styles.sub}>
        {t("onboarding.reveal.sub", { goal })}
      </Text>

      <View style={styles.pickCard}>
        <Text style={styles.pickKicker}>{t("onboarding.reveal.recommended")}</Text>
        <Text style={styles.pickName}>{picked.name}</Text>
        <Text style={styles.pickMeta}>
          {t("onboarding.reveal.meta", {
            days: picked.days_per_week,
            exp: picked.target_experience,
            eq: picked.target_equipment,
          })}
        </Text>
        <Text style={styles.pickDesc}>{picked.description}</Text>
      </View>

      {others.length > 0 && (
        <>
          <Text style={styles.kicker}>{t("onboarding.reveal.or_pick_another")}</Text>
          {others.map((p) => {
            const on = p.id === picked.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => onPick(p)}
                style={[styles.altCard, on && styles.altCardOn]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.altName}>{p.name}</Text>
                  <Text style={styles.altMeta}>
                    {p.days_per_week} d/w · {p.target_experience}
                  </Text>
                </View>
                {on && <Text style={styles.altOn}>{t("onboarding.reveal.picked")}</Text>}
              </Pressable>
            );
          })}
        </>
      )}
    </View>
  );
}

type TFn = (key: string, opts?: Record<string, unknown>) => string;

function rateOptions(g: Goal, t: TFn): { v: number; label: string }[] {
  if (g === "cut") {
    return [
      { v: -0.25, label: t("onboarding.rate.cut_slow") },
      { v: -0.5, label: t("onboarding.rate.cut_standard") },
      { v: -0.75, label: t("onboarding.rate.cut_aggressive") },
      { v: -1.0, label: t("onboarding.rate.cut_very_fast") },
    ];
  }
  if (g === "bulk") {
    return [
      { v: 0.15, label: t("onboarding.rate.bulk_slow") },
      { v: 0.25, label: t("onboarding.rate.bulk_standard") },
      { v: 0.4, label: t("onboarding.rate.bulk_fast") },
    ];
  }
  if (g === "recomp") {
    return [
      { v: -0.15, label: t("onboarding.rate.recomp_slight_def") },
      { v: -0.25, label: t("onboarding.rate.recomp_small_cut") },
      { v: 0, label: t("onboarding.rate.recomp_true") },
    ];
  }
  return [{ v: 0, label: t("onboarding.rate.maintain_zero") }];
}

function rateDescription(rate: number, t: TFn): string {
  const abs = Math.abs(rate);
  if (abs === 0) return t("onboarding.rate.desc_maintenance");
  if (abs <= 0.25)
    return t("onboarding.rate.desc_slow", {
      dir: t(rate < 0 ? "onboarding.rate.loss" : "onboarding.rate.gain"),
    });
  if (abs <= 0.5) return t("onboarding.rate.desc_standard");
  if (abs <= 0.75) return t("onboarding.rate.desc_aggressive");
  return t("onboarding.rate.desc_very_fast");
}

const styles = StyleSheet.create({
  head: { marginTop: spacing.sm },
  progressWrap: {
    height: 4,
    backgroundColor: colors.panel2,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: colors.gold,
    borderRadius: 2,
  },
  kicker: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  hero: {
    fontFamily: font.displayBold,
    fontSize: 44,
    color: colors.ink,
    lineHeight: 48,
  },
  heroSub: {
    fontFamily: font.body,
    fontSize: 16,
    color: colors.ink,
    lineHeight: 24,
  },
  h1: {
    fontFamily: font.displayBold,
    fontSize: 26,
    color: colors.ink,
    lineHeight: 32,
  },
  sub: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 14,
    lineHeight: 21,
  },
  row: { flexDirection: "row", gap: spacing.md },
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
  bigInput: {
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    color: colors.ink,
    fontFamily: font.mono,
    fontSize: 22,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    textAlign: "center",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  cardOn: {
    borderColor: colors.gold,
    backgroundColor: "rgba(246,183,60,0.06)",
  },
  cardLabel: {
    fontFamily: font.displayBold,
    fontSize: 18,
    color: colors.ink,
  },
  cardLabelOn: { color: colors.gold },
  cardSub: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    marginTop: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: colors.gold },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.gold,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
  },
  chipOn: {
    borderColor: colors.gold,
    backgroundColor: "rgba(246,183,60,0.10)",
  },
  chipText: { fontFamily: font.body, fontSize: 13, color: colors.ink },
  chipTextOn: { color: colors.gold },
  dayChip: {
    width: 52,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
    alignItems: "center",
    justifyContent: "center",
  },
  dayChipOn: {
    borderColor: colors.gold,
    backgroundColor: "rgba(246,183,60,0.10)",
  },
  dayChipText: {
    fontFamily: font.displayBold,
    fontSize: 22,
    color: colors.ink,
  },
  dayChipTextOn: { color: colors.gold },
  pickCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 6,
  },
  pickKicker: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  pickName: {
    fontFamily: font.displayBold,
    fontSize: 22,
    color: colors.ink,
  },
  pickMeta: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
    marginTop: 2,
  },
  pickDesc: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 21,
    marginTop: 6,
  },
  altCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  altCardOn: { borderColor: colors.gold },
  altName: {
    fontFamily: font.body,
    fontSize: 15,
    color: colors.ink,
  },
  altMeta: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    marginTop: 2,
  },
  altOn: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
  },
  footerRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  err: { color: colors.coral, fontFamily: font.body, fontSize: 13 },
});
