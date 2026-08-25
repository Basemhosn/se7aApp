import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type {
  PurchasesOffering,
  PurchasesPackage,
} from "@/lib/rc";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { Wordmark } from "@/components/Wordmark";
import { useEntitlement } from "@/lib/EntitlementContext";
import { fetchOffering, purchasePackage } from "@/lib/rc";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/auth/AuthContext";
import { identify, track } from "@/lib/analytics";
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
  "trial_offer",
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

  const { ent, optimisticProFromRc } = useEntitlement();
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [trialBusy, setTrialBusy] = useState(false);

  const [ranked, setRanked] = useState<Scored[] | null>(null);
  const [pickedProgram, setPickedProgram] = useState<Program | null>(null);
  const [returning, setReturning] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

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
      case "trial_offer": return true; // both actions live on this step
      default: return false;
    }
  })();

  // Fetch the RC offering once we're on (or about to be on) the trial
  // step so the two package prices land before the user glances at them.
  useEffect(() => {
    if (step !== "trial_offer" || offering) return;
    let cancelled = false;
    (async () => {
      const off = await fetchOffering();
      if (!cancelled) setOffering(off);
    })();
    return () => {
      cancelled = true;
    };
  }, [step, offering]);

  const back = () => {
    setErr("");
    const i = STEPS.indexOf(step);
    if (i > 0) setStep(STEPS[i - 1]!);
  };

  // Reveal step's CTA normally advances to the trial_offer step. For
  // users who are already Pro (reopening onboarding to redo their plan),
  // we skip the paywall step and finish immediately.
  const revealCta = () => {
    if (ent.is_pro) {
      finish();
    } else {
      setStep("trial_offer");
    }
  };

  const startTrial = async () => {
    if (!offering) return;
    // Prefer annual (that's where the trial typically lives), fall back
    // to monthly if the RC dashboard only configured a monthly trial.
    const pkg =
      offering.availablePackages.find((p) =>
        p.product.identifier.toLowerCase().includes("annual")
      ) ??
      offering.availablePackages.find((p) => p.packageType === "ANNUAL") ??
      offering.availablePackages[0];
    if (!pkg) return;
    setTrialBusy(true);
    setErr("");
    const res = await purchasePackage(pkg as PurchasesPackage);
    setTrialBusy(false);
    if (res.cancelled) return; // stay on the trial step
    if (res.info === null) {
      setErr(res.error || "Couldn't start trial — try again.");
      return;
    }
    await optimisticProFromRc();
    await finish();
  };

  const skipTrial = async () => {
    await finish();
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
        const profileRes = await api<{
          ok: boolean;
          warnings?: string[];
        }>("/api/profile", {
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
        setWarnings(profileRes.warnings ?? []);
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
      if (user?.id) identify(user.id, { goal, sex, experience });
      track(returning ? "program_changed" : "onboarding_completed", {
        goal,
        experience,
        equipment,
        days_per_week: days,
        program_id: pickedProgram.id,
      });
      // First-time users get pushed straight into a plate scan for the
      // AHA moment. Returning users (redoing plan) go back to Home.
      router.replace(returning ? "/" : "/scan/plate");
    } catch (e) {
      setErr((e as Error).message || t("onboarding.couldnt_save_plan"));
      setBusy(false);
    }
  };

  const footer = step === "trial_offer" ? (
    <>
      {!!err && <Text style={styles.err}>{err}</Text>}
      <Btn
        label={
          trialBusy
            ? t("onboarding.trial_working")
            : offering
              ? t("onboarding.trial_cta")
              : t("onboarding.trial_loading")
        }
        onPress={startTrial}
        loading={trialBusy || busy}
        disabled={!offering}
      />
      <Pressable
        onPress={skipTrial}
        disabled={busy || trialBusy}
        hitSlop={8}
        style={styles.skipLink}
      >
        <Text style={styles.skipLinkText}>{t("onboarding.skip_free")}</Text>
      </Pressable>
    </>
  ) : (
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
              onPress={revealCta}
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
        {step !== "welcome" && stepIndex > 0 ? (
          <Pressable
            onPress={back}
            hitSlop={12}
            disabled={busy}
            style={styles.headBack}
          >
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </Pressable>
        ) : (
          <View style={{ width: 30 }} />
        )}
        <Wordmark size={18} />
        {step !== "welcome" ? (
          <Text style={styles.stepCount}>
            {stepIndex} / {STEPS.length - 1}
          </Text>
        ) : (
          <View style={{ width: 30 }} />
        )}
      </View>

      {step !== "welcome" && (
        <View style={styles.pillRow}>
          {STEPS.slice(1).map((s, i) => {
            const done = STEPS.indexOf(s) < stepIndex;
            const current = STEPS.indexOf(s) === stepIndex;
            return (
              <View
                key={s}
                style={[
                  styles.pillSeg,
                  done && styles.pillSegDone,
                  current && styles.pillSegCurrent,
                ]}
              />
            );
          })}
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
              { v: "male", label: t("onboarding.sex.male"), icon: "male" },
              { v: "female", label: t("onboarding.sex.female"), icon: "female" },
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
              { v: "sedentary", label: t("onboarding.activity.sedentary"), sub: t("onboarding.activity.sedentary_sub"), icon: "bed-outline" },
              { v: "light", label: t("onboarding.activity.light"), sub: t("onboarding.activity.light_sub"), icon: "walk-outline" },
              { v: "moderate", label: t("onboarding.activity.moderate"), sub: t("onboarding.activity.moderate_sub"), icon: "footsteps-outline" },
              { v: "active", label: t("onboarding.activity.active"), sub: t("onboarding.activity.active_sub"), icon: "bicycle-outline" },
              { v: "very_active", label: t("onboarding.activity.very_active"), sub: t("onboarding.activity.very_active_sub"), icon: "barbell-outline" },
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
              { v: "cut", label: t("onboarding.goal.cut"), sub: t("onboarding.goal.cut_sub"), icon: "trending-down-outline" },
              { v: "recomp", label: t("onboarding.goal.recomp"), sub: t("onboarding.goal.recomp_sub"), icon: "swap-horizontal-outline" },
              { v: "maintain", label: t("onboarding.goal.maintain"), sub: t("onboarding.goal.maintain_sub"), icon: "remove-outline" },
              { v: "bulk", label: t("onboarding.goal.bulk"), sub: t("onboarding.goal.bulk_sub"), icon: "trending-up-outline" },
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
              { v: "beginner", label: t("onboarding.experience.beginner"), sub: t("onboarding.experience.beginner_sub"), icon: "leaf-outline" },
              { v: "intermediate", label: t("onboarding.experience.intermediate"), sub: t("onboarding.experience.intermediate_sub"), icon: "flame-outline" },
              { v: "advanced", label: t("onboarding.experience.advanced"), sub: t("onboarding.experience.advanced_sub"), icon: "trophy-outline" },
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
              { v: "gym", label: t("onboarding.equipment.gym"), sub: t("onboarding.equipment.gym_sub"), icon: "barbell-outline" },
              { v: "home", label: t("onboarding.equipment.home"), sub: t("onboarding.equipment.home_sub"), icon: "home-outline" },
              { v: "bodyweight", label: t("onboarding.equipment.bodyweight"), sub: t("onboarding.equipment.bodyweight_sub"), icon: "body-outline" },
              { v: "both", label: t("onboarding.equipment.both"), sub: t("onboarding.equipment.both_sub"), icon: "shuffle-outline" },
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
        <>
          {warnings.includes("kcal_floor_applied") && (
            <View style={styles.warnCard}>
              <Text style={styles.warnKicker}>{t("onboarding.safety_kicker")}</Text>
              <Text style={styles.warnBody}>{t("onboarding.safety_body")}</Text>
            </View>
          )}
          <PlanReveal
            ranked={ranked}
            picked={pickedProgram}
            onPick={setPickedProgram}
            goal={goal!}
            t={t}
          />
        </>
      )}

      {step === "trial_offer" && (
        <TrialOfferStep offering={offering} />
      )}
    </Screen>
  );
}

function TrialOfferStep({ offering }: { offering: PurchasesOffering | null }) {
  const { t } = useTranslation();
  const annual =
    offering?.availablePackages.find((p) =>
      p.product.identifier.toLowerCase().includes("annual")
    ) ??
    offering?.availablePackages.find((p) => p.packageType === "ANNUAL");
  const monthly =
    offering?.availablePackages.find((p) =>
      p.product.identifier.toLowerCase().includes("monthly")
    ) ??
    offering?.availablePackages.find((p) => p.packageType === "MONTHLY");

  return (
    <View style={{ gap: spacing.md, paddingTop: spacing.xl }}>
      <View style={styles.trialAvatar}>
        <Ionicons name="sparkles" size={40} color={colors.gold} />
      </View>
      <Text style={styles.kicker}>{t("onboarding.trial_kicker")}</Text>
      <Text style={styles.hero}>{t("onboarding.trial_hero")}</Text>
      <Text style={styles.heroSub}>{t("onboarding.trial_hero_sub")}</Text>

      <View style={styles.trialBenefits}>
        <TrialBenefit
          icon="restaurant-outline"
          title={t("onboarding.trial_benefit_meals_title")}
          body={t("onboarding.trial_benefit_meals_body")}
        />
        <TrialBenefit
          icon="chatbubbles-outline"
          title={t("onboarding.trial_benefit_coach_title")}
          body={t("onboarding.trial_benefit_coach_body")}
        />
        <TrialBenefit
          icon="scan-outline"
          title={t("onboarding.trial_benefit_scans_title")}
          body={t("onboarding.trial_benefit_scans_body")}
        />
      </View>

      {offering ? (
        <View style={styles.priceCard}>
          {annual ? (
            <>
              <Text style={styles.priceKicker}>
                {t("onboarding.trial_price_annual_kicker")}
              </Text>
              <Text style={styles.priceValue}>
                {annual.product.priceString}
                <Text style={styles.pricePer}>
                  {t("onboarding.trial_price_annual_per")}
                </Text>
              </Text>
            </>
          ) : monthly ? (
            <>
              <Text style={styles.priceKicker}>
                {t("onboarding.trial_price_monthly_kicker")}
              </Text>
              <Text style={styles.priceValue}>
                {monthly.product.priceString}
                <Text style={styles.pricePer}>
                  {t("onboarding.trial_price_monthly_per")}
                </Text>
              </Text>
            </>
          ) : (
            <Text style={styles.priceValue}>
              {t("onboarding.trial_price_unavailable")}
            </Text>
          )}
        </View>
      ) : (
        <View style={styles.priceCard}>
          <ActivityIndicator color={colors.gold} />
        </View>
      )}

      <Text style={styles.trialLegal}>{t("onboarding.trial_legal")}</Text>
    </View>
  );
}

function TrialBenefit({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.trialBenefitRow}>
      <View style={styles.trialBenefitIcon}>
        <Ionicons name={icon} size={18} color={colors.gold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.trialBenefitTitle}>{title}</Text>
        <Text style={styles.trialBenefitBody}>{body}</Text>
      </View>
    </View>
  );
}

function WelcomeStep({
  name,
  returning,
}: {
  name?: string;
  returning: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: spacing.md, paddingTop: spacing.xl }}>
      <View style={styles.welcomeIconWrap}>
        <Ionicons name="sparkles" size={44} color={colors.gold} />
      </View>
      <Text style={styles.kicker}>
        {returning
          ? t("onboarding.welcome_kicker_returning")
          : t("onboarding.welcome_kicker_new")}
      </Text>
      <Text style={styles.hero}>
        {returning
          ? t("onboarding.welcome_hero_returning", { name: name ?? "hey" })
          : name
            ? t("onboarding.welcome_hero_new", { name })
            : t("onboarding.welcome_hero_new_no_name")}
      </Text>
      <Text style={styles.heroSub}>
        {returning
          ? t("onboarding.welcome_body_returning")
          : t("onboarding.welcome_body_new")}
      </Text>
      {!returning && (
        <View style={styles.valueProps}>
          <ValueRow
            icon="stats-chart-outline"
            title={t("onboarding.welcome_val_ranges_title")}
            body={t("onboarding.welcome_val_ranges_body")}
          />
          <ValueRow
            icon="restaurant-outline"
            title={t("onboarding.welcome_val_gulf_title")}
            body={t("onboarding.welcome_val_gulf_body")}
          />
          <ValueRow
            icon="fitness-outline"
            title={t("onboarding.welcome_val_workouts_title")}
            body={t("onboarding.welcome_val_workouts_body")}
          />
        </View>
      )}
      <Text style={[styles.sub, { marginTop: spacing.md }]}>
        {returning
          ? t("onboarding.welcome_footnote_returning")
          : t("onboarding.welcome_footnote_new")}
      </Text>
    </View>
  );
}

function ValueRow({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.valueRow}>
      <View style={styles.valueIcon}>
        <Ionicons name={icon} size={18} color={colors.gold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.valueTitle}>{title}</Text>
        <Text style={styles.valueBody}>{body}</Text>
      </View>
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
  options: {
    v: T;
    label: string;
    sub?: string;
    icon?: keyof typeof Ionicons.glyphMap;
  }[];
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
            {o.icon && (
              <View style={[styles.choiceIcon, on && styles.choiceIconOn]}>
                <Ionicons
                  name={o.icon}
                  size={20}
                  color={on ? colors.gold : colors.dim}
                />
              </View>
            )}
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
  head: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headBack: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCount: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    letterSpacing: 1.2,
    width: 60,
    textAlign: "right",
  },
  pillRow: {
    flexDirection: "row",
    gap: 4,
  },
  pillSeg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.panel2,
  },
  pillSegDone: {
    backgroundColor: colors.goldDim,
  },
  pillSegCurrent: {
    backgroundColor: colors.gold,
  },
  welcomeIconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "rgba(246,183,60,0.08)",
    borderWidth: 1,
    borderColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  valueProps: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  valueRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
  },
  valueIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  valueTitle: {
    fontFamily: font.displayBold,
    fontSize: 14,
    color: colors.ink,
  },
  valueBody: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    lineHeight: 18,
    marginTop: 2,
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
  choiceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceIconOn: {
    backgroundColor: "rgba(246,183,60,0.10)",
    borderColor: colors.gold,
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
  trialAvatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "rgba(246,183,60,0.08)",
    borderWidth: 1,
    borderColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  trialBenefits: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  trialBenefitRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
  },
  trialBenefitIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  trialBenefitTitle: {
    fontFamily: font.displayBold,
    fontSize: 15,
    color: colors.ink,
  },
  trialBenefitBody: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    lineHeight: 19,
    marginTop: 2,
  },
  priceCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.sm,
    alignItems: "center",
    gap: 4,
  },
  priceKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  priceValue: {
    fontFamily: font.displayBold,
    fontSize: 22,
    color: colors.ink,
    marginTop: 2,
  },
  pricePer: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
  },
  trialLegal: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    lineHeight: 15,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  skipLink: {
    alignSelf: "center",
    paddingVertical: spacing.sm,
  },
  skipLinkText: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
    textDecorationLine: "underline",
  },
  warnCard: {
    borderWidth: 1,
    borderColor: colors.coral,
    backgroundColor: "rgba(240,143,114,0.06)",
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  warnKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.coral,
    letterSpacing: 1.4,
  },
  warnBody: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 19,
  },
});
