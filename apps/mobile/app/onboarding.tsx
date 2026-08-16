import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
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
        setErr((e as Error).message || "Couldn't compute your plan — try again.");
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
      setErr((e as Error).message || "Couldn't save your plan — try again.");
      setBusy(false);
    }
  };

  const footer = (
    <>
      {!!err && <Text style={styles.err}>{err}</Text>}
      <View style={styles.footerRow}>
        {stepIndex > 0 && step !== "reveal" ? (
          <View style={{ flex: 1 }}>
            <Btn label="Back" variant="ghost" onPress={back} disabled={busy} />
          </View>
        ) : null}
        <View style={{ flex: 2 }}>
          {step === "reveal" ? (
            <Btn
              label={busy ? "Saving…" : "Start this plan"}
              onPress={finish}
              loading={busy}
              disabled={!canAdvance}
            />
          ) : (
            <Btn
              label={
                busy
                  ? "Building your plan…"
                  : step === "welcome"
                    ? "Let's build it"
                    : step === "injuries"
                      ? "Show me my plan"
                      : "Continue"
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
          kicker="ABOUT YOU · 1 OF 11"
          h1="What's your sex assigned at birth?"
          hint="Used only for BMR math — SE7A doesn't care about identity here, it cares about metabolic rate."
        >
          <BigChoice
            options={[
              { v: "male", label: "Male" },
              { v: "female", label: "Female" },
            ]}
            value={sex}
            onChange={(v) => setSex(v as Sex)}
          />
        </StepBody>
      )}

      {step === "birthdate" && (
        <StepBody
          kicker="ABOUT YOU · 2 OF 11"
          h1="Your birthdate?"
          hint="Metabolism shifts with age. Format: YYYY-MM-DD. You must be 16+."
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
            placeholder={`Display name (optional) — ${user?.email?.split("@")[0] ?? ""}`}
            placeholderTextColor={colors.dim}
            style={styles.input}
          />
        </StepBody>
      )}

      {step === "size" && (
        <StepBody
          kicker="ABOUT YOU · 3 OF 11"
          h1="Height and weight."
          hint="In centimeters and kilograms. Whatever the scale says today — we'll recalibrate as it changes."
        >
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>HEIGHT (CM)</Text>
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
              <Text style={styles.label}>WEIGHT (KG)</Text>
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
          kicker="ABOUT YOU · 4 OF 11"
          h1="How active are you day-to-day?"
          hint="Not counting workouts. Just your regular life — desk vs on-feet vs manual labor."
        >
          <BigChoice
            options={[
              { v: "sedentary", label: "Sedentary", sub: "Desk work, little walking" },
              { v: "light", label: "Light", sub: "Some walking, standing job" },
              { v: "moderate", label: "Moderate", sub: "On feet most of the day" },
              { v: "active", label: "Active", sub: "Physical job, always moving" },
              { v: "very_active", label: "Very active", sub: "Manual labor, athlete" },
            ]}
            value={activity}
            onChange={(v) => setActivity(v as ActivityLevel)}
          />
        </StepBody>
      )}

      {step === "goal" && (
        <StepBody
          kicker="YOUR GOAL · 5 OF 11"
          h1="What are we chasing?"
          hint="You can change this any time. Body composition shifts happen over months, not weeks."
        >
          <BigChoice
            options={[
              { v: "cut", label: "Cut", sub: "Lose fat, keep muscle" },
              { v: "recomp", label: "Recomp", sub: "Slow lean gain / slow loss" },
              { v: "maintain", label: "Maintain", sub: "Hold current composition" },
              { v: "bulk", label: "Bulk", sub: "Add muscle, accept some fat" },
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
          kicker="YOUR GOAL · 6 OF 11"
          h1="How fast?"
          hint="Aggressive rates work short-term. Sustainable rates work long-term. Negative = losing, positive = gaining."
        >
          <View style={styles.chipRow}>
            {rateOptions(goal ?? "maintain").map((r) => (
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
            {rateDescription(rate)}
          </Text>
        </StepBody>
      )}

      {step === "experience" && (
        <StepBody
          kicker="YOUR TRAINING · 7 OF 11"
          h1="How much lifting experience?"
          hint="Be honest — if you overestimate, we'll prescribe volume that grinds you down. Underestimate is easier to correct."
        >
          <BigChoice
            options={[
              { v: "beginner", label: "Beginner", sub: "Less than a year of consistent training" },
              { v: "intermediate", label: "Intermediate", sub: "1–3 years, know the main lifts" },
              { v: "advanced", label: "Advanced", sub: "3+ years, chasing PRs and specificity" },
            ]}
            value={experience}
            onChange={(v) => setExperience(v as Experience)}
          />
        </StepBody>
      )}

      {step === "equipment" && (
        <StepBody
          kicker="YOUR TRAINING · 8 OF 11"
          h1="What do you have access to?"
          hint="Programs are picked to match. Home + gym works for a lot of people."
        >
          <BigChoice
            options={[
              { v: "gym", label: "Full gym", sub: "Barbells, racks, machines" },
              { v: "home", label: "Home setup", sub: "Dumbbells, bands, maybe a bench" },
              { v: "bodyweight", label: "Bodyweight only", sub: "You + gravity + maybe a pull-up bar" },
              { v: "both", label: "Both", sub: "Gym some days, home others" },
            ]}
            value={equipment}
            onChange={(v) => setEquipment(v as Equipment)}
          />
        </StepBody>
      )}

      {step === "days" && (
        <StepBody
          kicker="YOUR TRAINING · 9 OF 11"
          h1="Days per week you can realistically commit?"
          hint="Consistency > intensity. A 3-day plan you actually do beats a 6-day plan you don't."
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
          kicker="YOUR TRAINING · 10 OF 11"
          h1="Rest days different?"
          hint="On days without a workout, eat less. Common for cutting — helps you land the weekly deficit without under-eating on training days. Skip if you'd rather keep it simple."
        >
          <BigChoice
            options={[
              { v: "0", label: "Same as lift days", sub: "No cycling. Simplest." },
              { v: "-200", label: "-200 kcal", sub: "Small adjustment." },
              { v: "-300", label: "-300 kcal", sub: "Common for a cut." },
              { v: "-500", label: "-500 kcal", sub: "Aggressive. Only for lean-outs." },
            ]}
            value={String(restDayDelta)}
            onChange={(v) => setRestDayDelta(Number(v))}
          />
        </StepBody>
      )}

      {step === "injuries" && (
        <StepBody
          kicker="YOUR TRAINING · 11 OF 11"
          h1="Anything to work around?"
          hint="Comma-separated. Examples: lower back, right shoulder, knees. Leave blank if nothing."
        >
          <TextInput
            value={injuryText}
            onChangeText={setInjuryText}
            placeholder="lower back, right knee"
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
}: {
  ranked: Scored[];
  picked: Program;
  onPick: (p: Program) => void;
  goal: Goal;
}) {
  const others = ranked.slice(1, 3).map((r) => r.program);
  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.kicker}>YOUR PLAN</Text>
      <Text style={styles.h1}>Here&apos;s where we start.</Text>
      <Text style={styles.sub}>
        Based on your goal ({goal}), experience, equipment, and days per
        week. You can switch plans any time from your dashboard.
      </Text>

      <View style={styles.pickCard}>
        <Text style={styles.pickKicker}>RECOMMENDED</Text>
        <Text style={styles.pickName}>{picked.name}</Text>
        <Text style={styles.pickMeta}>
          {picked.days_per_week} days / week · {picked.target_experience} · {picked.target_equipment}
        </Text>
        <Text style={styles.pickDesc}>{picked.description}</Text>
      </View>

      {others.length > 0 && (
        <>
          <Text style={styles.kicker}>OR PICK ANOTHER</Text>
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
                {on && <Text style={styles.altOn}>✓ picked</Text>}
              </Pressable>
            );
          })}
        </>
      )}
    </View>
  );
}

function rateOptions(g: Goal): { v: number; label: string }[] {
  if (g === "cut") {
    return [
      { v: -0.25, label: "Slow (0.25 kg/wk)" },
      { v: -0.5, label: "Standard (0.5)" },
      { v: -0.75, label: "Aggressive (0.75)" },
      { v: -1.0, label: "Very fast (1.0)" },
    ];
  }
  if (g === "bulk") {
    return [
      { v: 0.15, label: "Slow (0.15)" },
      { v: 0.25, label: "Standard (0.25)" },
      { v: 0.4, label: "Fast (0.4)" },
    ];
  }
  if (g === "recomp") {
    return [
      { v: -0.15, label: "Slight deficit" },
      { v: -0.25, label: "Small cut" },
      { v: 0, label: "True recomp" },
    ];
  }
  return [{ v: 0, label: "0 (maintenance)" }];
}

function rateDescription(rate: number): string {
  const abs = Math.abs(rate);
  if (abs === 0) return "Maintenance calories. Body composition holds.";
  if (abs <= 0.25) return `Slow ${rate < 0 ? "loss" : "gain"}. Easiest to sustain, minimal muscle risk / minimal fat gain.`;
  if (abs <= 0.5) return `Standard rate. Recommended for most people.`;
  if (abs <= 0.75) return `Aggressive. Works short-term; harder to sustain past 8 weeks.`;
  return `Very fast. Only appropriate for short cuts with lots of fat to lose. Not recommended long-term.`;
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
