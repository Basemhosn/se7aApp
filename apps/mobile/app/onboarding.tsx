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
import { setLocale, type Locale } from "@/lib/i18n";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import {
  OnboardingShell,
  QuestionHead,
  RulerScrubber,
  SelectCard,
  UnitToggle,
  Wheel,
} from "@/components/OnboardingUI";
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
  "language",
  "sex",
  "birthdate",
  "size",
  "activity",
  "goal",
  "halal_ramadan",
  "rate",
  "reveal",
  "attribution",
  "trial_offer",
] as const;
type Step = (typeof STEPS)[number];

type HalalPref = "halal" | "no_preference";
type AttributionSource =
  | "app_store"
  | "instagram"
  | "tiktok"
  | "friend"
  | "google"
  | "other";

export default function Onboarding() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
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

  // Local-only unit display prefs for the size step; profile always
  // persists metric (height_cm, weight_kg).
  const [heightUnit, setHeightUnit] = useState<"cm" | "ftin">("cm");
  const [weightUnit, setWeightUnit] = useState<"kg" | "lbs">("kg");

  // Onboarding v2 metadata — persisted to profiles.onboarding_meta jsonb.
  const [halalPref, setHalalPref] = useState<HalalPref | null>(null);
  const [ramadanOptIn, setRamadanOptIn] = useState(false);
  const [attribution, setAttribution] = useState<AttributionSource | null>(
    null
  );

  // Server-computed daily targets after we POST /api/profile at the
  // rate step — shown on the reveal screen so the user sees the actual
  // number their plan will use.
  const [computedTargets, setComputedTargets] = useState<{
    daily_kcal_target: number;
    daily_protein_g: number;
    daily_carb_g: number;
    daily_fat_g: number;
  } | null>(null);

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
      case "language": return true;
      case "sex": return !!sex;
      case "birthdate": return /^\d{4}-\d{2}-\d{2}$/.test(birthdate);
      case "size": return Number(height) > 0 && Number(weight) > 0;
      case "activity": return !!activity;
      case "goal": return !!goal;
      case "halal_ramadan": return !!halalPref;
      case "rate": return !Number.isNaN(rate);
      case "reveal": return true; // no workout program picker anymore
      case "attribution": return !!attribution;
      case "trial_offer": return true;
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

  // Reveal step's CTA normally advances to the attribution step (which
  // then flows into trial_offer). For users who are already Pro
  // (reopening onboarding to redo their plan), we skip both and finish.
  const revealCta = () => {
    if (ent.is_pro) {
      finish();
    } else {
      setStep("attribution");
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

    // Save profile between "rate" and "reveal" so the reveal step can
    // show the freshly-computed daily targets.
    if (step === "rate") {
      setBusy(true);
      try {
        const profileRes = await api<{
          ok: boolean;
          warnings?: string[];
          targets?: {
            daily_kcal_target: number;
            daily_protein_g: number;
            daily_carb_g: number;
            daily_fat_g: number;
          };
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
            onboarding_meta: halalPref
              ? {
                  halal_pref: halalPref,
                  ramadan_opt_in: ramadanOptIn,
                }
              : undefined,
          }),
        });
        setWarnings(profileRes.warnings ?? []);
        if (profileRes.targets) setComputedTargets(profileRes.targets);
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
    setBusy(true);
    setErr("");
    try {
      // Persist attribution to onboarding_meta if the user answered.
      // Failures here are silent — attribution is analytics, not a gate.
      if (attribution && user?.id) {
        try {
          await supabase
            .from("profiles")
            .update({
              onboarding_meta: {
                halal_pref: halalPref ?? undefined,
                ramadan_opt_in: ramadanOptIn,
                attribution_source: attribution,
              },
            })
            .eq("user_id", user.id);
        } catch {
          /* swallow */
        }
      }
      if (user?.id) identify(user.id, { goal, sex });
      track("onboarding_completed", {
        goal,
        sex,
        activity,
        returning,
      });
      // First-time users go straight into a plate scan for the AHA
      // moment; returning users go back to Home.
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
                    : step === "rate"
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

  // Steps ported to the v2 visual system (dark shell + progress bar
  // + gold-accent primary button). Legacy steps still render inside
  // the existing Screen wrapper below; those port over in a follow-up.
  if (step === "language") {
    const currentLocale = (i18n.language === "ar" ? "ar" : "en") as Locale;
    const pick = async (loc: Locale) => {
      await setLocale(loc);
    };
    return (
      <OnboardingShell
        progress={stepIndex / (STEPS.length - 1)}
        onBack={back}
        primaryLabel={t("onboarding.language.continue")}
        onPrimary={advance}
      >
        <QuestionHead
          title={t("onboarding.language.title")}
          subtitle={t("onboarding.language.sub")}
        />
        <SelectCard
          icon="language-outline"
          label={t("onboarding.language.en")}
          sublabel={t("onboarding.language.en_sub")}
          selected={currentLocale === "en"}
          onPress={() => pick("en")}
        />
        <SelectCard
          icon="language-outline"
          label={t("onboarding.language.ar")}
          sublabel={t("onboarding.language.ar_sub")}
          selected={currentLocale === "ar"}
          onPress={() => pick("ar")}
        />
      </OnboardingShell>
    );
  }

  if (step === "birthdate") {
    const initialDate = birthdate
      ? new Date(birthdate)
      : new Date(1998, 0, 1);
    const handleDate = (_e: DateTimePickerEvent, d?: Date) => {
      if (!d) return;
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      setBirthdate(iso);
    };
    return (
      <OnboardingShell
        progress={stepIndex / (STEPS.length - 1)}
        onBack={back}
        primaryLabel={t("onboarding.cta_continue")}
        onPrimary={advance}
        primaryDisabled={!canAdvance}
      >
        <QuestionHead
          title={t("onboarding.birthdate.title")}
          subtitle={t("onboarding.birthdate.sub")}
        />
        <View style={{ alignItems: "center", flex: 1, justifyContent: "center" }}>
          <DateTimePicker
            value={initialDate}
            mode="date"
            display="spinner"
            maximumDate={new Date()}
            minimumDate={new Date(1920, 0, 1)}
            onChange={handleDate}
            themeVariant="dark"
            textColor={colors.ink}
          />
        </View>
      </OnboardingShell>
    );
  }

  if (step === "welcome") {
    return (
      <OnboardingShell
        progress={0}
        primaryLabel={
          returning ? t("onboarding.welcome_cta_returning") : t("onboarding.welcome_cta_new")
        }
        onPrimary={advance}
      >
        <View style={{ flex: 1, justifyContent: "center", gap: spacing.md }}>
          <Text style={styles.welcomeKicker}>
            {returning ? t("onboarding.welcome_kicker_returning") : t("onboarding.welcome_kicker_new")}
          </Text>
          <Text style={styles.welcomeHero}>
            {returning
              ? t("onboarding.welcome_hero_returning", {
                  name: user?.email?.split("@")[0] ?? "",
                })
              : user?.email
                ? t("onboarding.welcome_hero_new", { name: user.email.split("@")[0] })
                : t("onboarding.welcome_hero_new_no_name")}
          </Text>
          <Text style={styles.welcomeBody}>
            {returning ? t("onboarding.welcome_body_returning") : t("onboarding.welcome_body_new")}
          </Text>
          <Text style={styles.welcomeFootnote}>
            {returning ? t("onboarding.welcome_footnote_returning") : t("onboarding.welcome_footnote_new")}
          </Text>
        </View>
      </OnboardingShell>
    );
  }

  if (step === "sex") {
    return (
      <OnboardingShell
        progress={stepIndex / (STEPS.length - 1)}
        onBack={back}
        primaryLabel={t("onboarding.cta_continue")}
        onPrimary={advance}
        primaryDisabled={!canAdvance}
      >
        <QuestionHead
          title={t("onboarding.sex.title")}
          subtitle={t("onboarding.sex.hint")}
        />
        <SelectCard
          icon="male-outline"
          label={t("onboarding.sex.male")}
          selected={sex === "male"}
          onPress={() => setSex("male")}
        />
        <SelectCard
          icon="female-outline"
          label={t("onboarding.sex.female")}
          selected={sex === "female"}
          onPress={() => setSex("female")}
        />
      </OnboardingShell>
    );
  }

  if (step === "activity") {
    const opts: { v: ActivityLevel; label: string; sub: string; icon: keyof typeof Ionicons.glyphMap }[] = [
      { v: "sedentary", label: t("onboarding.activity.sedentary"), sub: t("onboarding.activity.sedentary_sub"), icon: "bed-outline" },
      { v: "light", label: t("onboarding.activity.light"), sub: t("onboarding.activity.light_sub"), icon: "walk-outline" },
      { v: "moderate", label: t("onboarding.activity.moderate"), sub: t("onboarding.activity.moderate_sub"), icon: "footsteps-outline" },
      { v: "active", label: t("onboarding.activity.active"), sub: t("onboarding.activity.active_sub"), icon: "bicycle-outline" },
      { v: "very_active", label: t("onboarding.activity.very_active"), sub: t("onboarding.activity.very_active_sub"), icon: "flame-outline" },
    ];
    return (
      <OnboardingShell
        progress={stepIndex / (STEPS.length - 1)}
        onBack={back}
        primaryLabel={t("onboarding.cta_continue")}
        onPrimary={advance}
        primaryDisabled={!canAdvance}
      >
        <QuestionHead
          title={t("onboarding.activity.title")}
          subtitle={t("onboarding.activity.hint")}
        />
        {opts.map((o) => (
          <SelectCard
            key={o.v}
            icon={o.icon}
            label={o.label}
            sublabel={o.sub}
            selected={activity === o.v}
            onPress={() => setActivity(o.v)}
          />
        ))}
      </OnboardingShell>
    );
  }

  if (step === "goal") {
    const opts: { v: Goal; label: string; sub: string; icon: keyof typeof Ionicons.glyphMap }[] = [
      { v: "cut", label: t("onboarding.goal.cut"), sub: t("onboarding.goal.cut_sub"), icon: "trending-down-outline" },
      { v: "recomp", label: t("onboarding.goal.recomp"), sub: t("onboarding.goal.recomp_sub"), icon: "swap-horizontal-outline" },
      { v: "maintain", label: t("onboarding.goal.maintain"), sub: t("onboarding.goal.maintain_sub"), icon: "pause-outline" },
      { v: "bulk", label: t("onboarding.goal.bulk"), sub: t("onboarding.goal.bulk_sub"), icon: "trending-up-outline" },
    ];
    return (
      <OnboardingShell
        progress={stepIndex / (STEPS.length - 1)}
        onBack={back}
        primaryLabel={t("onboarding.cta_continue")}
        onPrimary={advance}
        primaryDisabled={!canAdvance}
      >
        <QuestionHead
          title={t("onboarding.goal.title")}
          subtitle={t("onboarding.goal.hint")}
        />
        {opts.map((o) => (
          <SelectCard
            key={o.v}
            icon={o.icon}
            label={o.label}
            sublabel={o.sub}
            selected={goal === o.v}
            onPress={() => setGoal(o.v)}
          />
        ))}
      </OnboardingShell>
    );
  }

  if (step === "halal_ramadan") {
    return (
      <OnboardingShell
        progress={stepIndex / (STEPS.length - 1)}
        onBack={back}
        primaryLabel={t("onboarding.cta_continue")}
        onPrimary={advance}
        primaryDisabled={!canAdvance}
      >
        <QuestionHead
          title={t("onboarding.halal.title")}
          subtitle={t("onboarding.halal.sub")}
        />
        <SelectCard
          icon="restaurant-outline"
          label={t("onboarding.halal.halal")}
          sublabel={t("onboarding.halal.halal_sub")}
          selected={halalPref === "halal"}
          onPress={() => setHalalPref("halal")}
        />
        <SelectCard
          icon="checkmark-circle-outline"
          label={t("onboarding.halal.no_pref")}
          sublabel={t("onboarding.halal.no_pref_sub")}
          selected={halalPref === "no_preference"}
          onPress={() => setHalalPref("no_preference")}
        />
        <Pressable
          onPress={() => setRamadanOptIn((v) => !v)}
          style={[
            styles.ramadanRow,
            ramadanOptIn && styles.ramadanRowOn,
          ]}
        >
          <Ionicons
            name={ramadanOptIn ? "checkbox" : "square-outline"}
            size={22}
            color={ramadanOptIn ? colors.gold : colors.dim}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.ramadanTitle}>
              {t("onboarding.halal.ramadan_title")}
            </Text>
            <Text style={styles.ramadanBody}>
              {t("onboarding.halal.ramadan_sub")}
            </Text>
          </View>
        </Pressable>
      </OnboardingShell>
    );
  }

  if (step === "rate") {
    // Rate options scale to the chosen goal direction.
    const isBulk = goal === "bulk";
    const isCut = goal === "cut" || goal === "recomp";
    const sign = isBulk ? 1 : isCut ? -1 : 0;
    const rateOpts =
      goal === "maintain"
        ? [{ v: 0, label: t("onboarding.rate.hold"), sub: t("onboarding.rate.hold_sub") }]
        : [
            { v: 0.25 * sign, label: t("onboarding.rate.steady"), sub: t("onboarding.rate.steady_sub") },
            { v: 0.5 * sign, label: t("onboarding.rate.moderate"), sub: t("onboarding.rate.moderate_sub") },
            { v: 0.75 * sign, label: t("onboarding.rate.aggressive"), sub: t("onboarding.rate.aggressive_sub") },
          ];
    return (
      <OnboardingShell
        progress={stepIndex / (STEPS.length - 1)}
        onBack={back}
        primaryLabel={busy ? t("onboarding.cta_building") : t("onboarding.cta_show_plan")}
        onPrimary={advance}
        primaryDisabled={!canAdvance}
        primaryLoading={busy}
        errorText={err}
      >
        <QuestionHead
          title={t("onboarding.rate.title")}
          subtitle={t("onboarding.rate.hint")}
        />
        {rateOpts.map((o) => (
          <SelectCard
            key={o.v}
            label={o.label}
            sublabel={o.sub}
            selected={rate === o.v}
            onPress={() => setRate(o.v)}
          />
        ))}
      </OnboardingShell>
    );
  }

  if (step === "reveal") {
    const targets = computedTargets;
    return (
      <OnboardingShell
        progress={stepIndex / (STEPS.length - 1)}
        primaryLabel={t("onboarding.cta_start_plan")}
        onPrimary={revealCta}
        primaryLoading={busy}
      >
        <View style={{ flex: 1, justifyContent: "center", gap: spacing.md, alignItems: "center" }}>
          <View style={styles.revealBadge}>
            <Ionicons name="sparkles" size={16} color={colors.gold} />
            <Text style={styles.revealBadgeText}>
              {t("onboarding.reveal.congrats")}
            </Text>
          </View>
          <Text style={styles.revealKicker}>{t("onboarding.reveal.kicker")}</Text>
          <Text style={styles.revealBig}>
            {targets?.daily_kcal_target ?? "—"}
          </Text>
          <Text style={styles.revealUnit}>{t("onboarding.reveal.kcal_per_day")}</Text>
          <Text style={styles.revealTagline}>
            {t("onboarding.reveal.tagline")}
          </Text>
          {targets && (
            <View style={styles.revealMacros}>
              <View style={styles.revealMacro}>
                <Text style={styles.revealMacroValue}>{targets.daily_protein_g}g</Text>
                <Text style={styles.revealMacroLabel}>{t("onboarding.reveal.protein")}</Text>
              </View>
              <View style={styles.revealMacro}>
                <Text style={styles.revealMacroValue}>{targets.daily_carb_g}g</Text>
                <Text style={styles.revealMacroLabel}>{t("onboarding.reveal.carbs")}</Text>
              </View>
              <View style={styles.revealMacro}>
                <Text style={styles.revealMacroValue}>{targets.daily_fat_g}g</Text>
                <Text style={styles.revealMacroLabel}>{t("onboarding.reveal.fat")}</Text>
              </View>
            </View>
          )}
          {warnings.includes("kcal_floor_applied") && (
            <View style={styles.warnCardV2}>
              <Text style={styles.warnKickerV2}>{t("onboarding.safety_kicker")}</Text>
              <Text style={styles.warnBodyV2}>{t("onboarding.safety_body")}</Text>
            </View>
          )}
        </View>
      </OnboardingShell>
    );
  }

  if (step === "attribution") {
    const opts: {
      v: AttributionSource;
      label: string;
      icon: keyof typeof Ionicons.glyphMap;
    }[] = [
      { v: "app_store", label: t("onboarding.attribution.app_store"), icon: "logo-apple-appstore" },
      { v: "instagram", label: t("onboarding.attribution.instagram"), icon: "logo-instagram" },
      { v: "tiktok", label: t("onboarding.attribution.tiktok"), icon: "logo-tiktok" },
      { v: "google", label: t("onboarding.attribution.google"), icon: "logo-google" },
      { v: "friend", label: t("onboarding.attribution.friend"), icon: "people-outline" },
      { v: "other", label: t("onboarding.attribution.other"), icon: "ellipsis-horizontal-outline" },
    ];
    return (
      <OnboardingShell
        progress={stepIndex / (STEPS.length - 1)}
        onBack={back}
        primaryLabel={t("onboarding.cta_continue")}
        onPrimary={advance}
        primaryDisabled={!canAdvance}
      >
        <QuestionHead
          title={t("onboarding.attribution.title")}
          subtitle={t("onboarding.attribution.sub")}
        />
        {opts.map((o) => (
          <SelectCard
            key={o.v}
            icon={o.icon}
            label={o.label}
            selected={attribution === o.v}
            onPress={() => setAttribution(o.v)}
          />
        ))}
      </OnboardingShell>
    );
  }

  if (step === "trial_offer") {
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
    const priceString = annual?.product.priceString ?? monthly?.product.priceString ?? "";
    return (
      <OnboardingShell
        progress={1}
        primaryLabel={
          trialBusy
            ? t("onboarding.trial_working")
            : offering
              ? t("onboarding.trial_cta")
              : t("onboarding.trial_loading")
        }
        onPrimary={startTrial}
        primaryLoading={trialBusy || busy}
        primaryDisabled={!offering}
        secondaryLabel={t("onboarding.skip_free")}
        onSecondary={skipTrial}
        errorText={err}
      >
        <View style={{ gap: spacing.md, flex: 1 }}>
          <Text style={styles.trialKickerV2}>{t("onboarding.trial_kicker")}</Text>
          <Text style={styles.trialHeroV2}>{t("onboarding.trial_hero")}</Text>
          <Text style={styles.trialSubV2}>{t("onboarding.trial_hero_sub")}</Text>
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            <SelectCard
              icon="restaurant-outline"
              label={t("onboarding.trial_benefit_meals_title")}
              sublabel={t("onboarding.trial_benefit_meals_body")}
              selected={false}
              onPress={() => {}}
            />
            <SelectCard
              icon="chatbubbles-outline"
              label={t("onboarding.trial_benefit_coach_title")}
              sublabel={t("onboarding.trial_benefit_coach_body")}
              selected={false}
              onPress={() => {}}
            />
            <SelectCard
              icon="scan-outline"
              label={t("onboarding.trial_benefit_scans_title")}
              sublabel={t("onboarding.trial_benefit_scans_body")}
              selected={false}
              onPress={() => {}}
            />
          </View>
          {priceString ? (
            <Text style={styles.trialPriceV2}>{priceString}</Text>
          ) : null}
          {!!err && <Text style={styles.err}>{err}</Text>}
        </View>
      </OnboardingShell>
    );
  }

  if (step === "size") {
    // Height: cm state is canonical; ft/in derived from cm for display.
    const heightCm = Number(height) || 175;
    const totalIn = heightCm / 2.54;
    const heightFt = Math.floor(totalIn / 12);
    const heightIn = Math.round(totalIn - heightFt * 12);
    const setHeightCmFromFtIn = (ft: number, inch: number) => {
      const cm = Math.round((ft * 12 + inch) * 2.54);
      setHeight(String(cm));
    };
    // Weight: kg is canonical; lbs derived for display.
    const weightKg = Number(weight) || 60;
    const weightLbs = Math.round(weightKg * 2.20462 * 10) / 10;
    return (
      <OnboardingShell
        progress={stepIndex / (STEPS.length - 1)}
        onBack={back}
        primaryLabel={t("onboarding.cta_continue")}
        onPrimary={advance}
        primaryDisabled={!canAdvance}
      >
        <QuestionHead
          title={t("onboarding.size.title")}
          subtitle={t("onboarding.size.sub")}
        />
        <View style={{ marginTop: spacing.md }}>
          <UnitToggle
            options={[
              { key: "cm", label: t("onboarding.size.cm") },
              { key: "ftin", label: t("onboarding.size.ftin") },
            ]}
            value={heightUnit}
            onChange={setHeightUnit}
          />
          <View style={{ flexDirection: "row", justifyContent: "center", gap: spacing.md }}>
            {heightUnit === "cm" ? (
              <Wheel
                values={Array.from({ length: 141 }, (_, i) => 120 + i)}
                selected={heightCm}
                onChange={(v) => setHeight(String(v))}
                formatLabel={(v) => `${v} cm`}
                width={140}
              />
            ) : (
              <>
                <Wheel
                  values={Array.from({ length: 5 }, (_, i) => 4 + i)}
                  selected={heightFt}
                  onChange={(ft) => setHeightCmFromFtIn(ft, heightIn)}
                  formatLabel={(v) => `${v} ft`}
                  width={100}
                />
                <Wheel
                  values={Array.from({ length: 12 }, (_, i) => i)}
                  selected={heightIn}
                  onChange={(inch) => setHeightCmFromFtIn(heightFt, inch)}
                  formatLabel={(v) => `${v} in`}
                  width={100}
                />
              </>
            )}
          </View>
        </View>

        <View style={{ marginTop: spacing.xl }}>
          <UnitToggle
            options={[
              { key: "kg", label: t("onboarding.size.kg") },
              { key: "lbs", label: t("onboarding.size.lbs") },
            ]}
            value={weightUnit}
            onChange={setWeightUnit}
          />
          {weightUnit === "kg" ? (
            <RulerScrubber
              min={30}
              max={200}
              step={0.1}
              value={weightKg}
              onChange={(v) => setWeight(String(v))}
              unit="kg"
              label={t("onboarding.size.current_weight")}
            />
          ) : (
            <RulerScrubber
              min={66}
              max={440}
              step={0.2}
              value={weightLbs}
              onChange={(lbs) => setWeight(String(Math.round((lbs / 2.20462) * 10) / 10))}
              unit="lbs"
              label={t("onboarding.size.current_weight")}
            />
          )}
        </View>
      </OnboardingShell>
    );
  }

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

  // ── v2 onboarding styles (build 54) ────────────────────────────
  welcomeKicker: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.8,
  },
  welcomeHero: {
    fontFamily: font.displayBold,
    fontSize: 40,
    color: colors.ink,
    lineHeight: 44,
  },
  welcomeBody: {
    fontFamily: font.body,
    fontSize: 16,
    color: colors.dim,
    lineHeight: 24,
  },
  welcomeFootnote: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
    marginTop: spacing.md,
  },
  revealBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.gold + "18",
    borderWidth: 1,
    borderColor: colors.gold,
    marginBottom: spacing.sm,
  },
  revealBadgeText: {
    fontFamily: font.bodyBold,
    fontSize: 12,
    color: colors.gold,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  revealTagline: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    textAlign: "center",
    marginTop: spacing.xs,
    maxWidth: 280,
    lineHeight: 18,
  },
  ramadanRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
  },
  ramadanRowOn: {
    borderColor: colors.gold,
    backgroundColor: colors.gold + "10",
  },
  ramadanTitle: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: colors.ink,
  },
  ramadanBody: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
    marginTop: 2,
  },
  revealKicker: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.8,
  },
  revealBig: {
    fontFamily: font.displayBold,
    fontSize: 72,
    color: colors.gold,
    lineHeight: 78,
  },
  revealUnit: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
    letterSpacing: 1.4,
  },
  revealMacros: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  revealMacro: {
    alignItems: "center",
    gap: 4,
    minWidth: 72,
  },
  revealMacroValue: {
    fontFamily: font.displayBold,
    fontSize: 22,
    color: colors.ink,
  },
  revealMacroLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
  },
  warnCardV2: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.coral,
    borderRadius: 12,
    padding: spacing.md,
    gap: 4,
  },
  warnKickerV2: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.coral,
    letterSpacing: 1.4,
  },
  warnBodyV2: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 19,
  },
  trialKickerV2: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.6,
  },
  trialHeroV2: {
    fontFamily: font.displayBold,
    fontSize: 30,
    color: colors.ink,
    lineHeight: 34,
  },
  trialSubV2: {
    fontFamily: font.body,
    fontSize: 15,
    color: colors.dim,
    lineHeight: 21,
  },
  trialPriceV2: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.gold,
    letterSpacing: 1.2,
    marginTop: spacing.sm,
    alignSelf: "center",
  },
});
