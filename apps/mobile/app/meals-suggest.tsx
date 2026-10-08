import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { BackButton } from "@/components/BackButton";
import { EmptyState } from "@/components/EmptyState";
import { api, RateLimitedError } from "@/lib/api";
import { showRateLimitAlert } from "@/lib/rateLimitAlert";
import { useEntitlement } from "@/lib/EntitlementContext";
import { markDayDirty, pushOptimisticLogItems } from "@/lib/calendarCache";
import type { MealSlot } from "@/types";
import { SLOTS, slotForNow } from "@/lib/slot";
import { colors, font, radius, spacing } from "@/lib/theme";

interface Suggestion {
  name: string;
  portion: string;
  reason: string;
  kcal_low: number;
  kcal_high: number;
  protein_g_low: number;
  protein_g_high: number;
  carb_g_low: number;
  carb_g_high: number;
  fat_g_low: number;
  fat_g_high: number;
}

interface Range {
  low: number;
  high: number;
}
interface SuggestResponse {
  ok: true;
  suggestions: Suggestion[];
  notes?: string;
  remaining: {
    kcal: Range;
    protein_g: Range;
    carb_g: Range;
    fat_g: Range;
  };
}

type Restriction =
  | "vegetarian"
  | "vegan"
  | "dairy-free"
  | "gluten-free"
  | "low-carb"
  | "halal";

const RESTRICTIONS: Restriction[] = [
  "vegetarian",
  "vegan",
  "dairy-free",
  "gluten-free",
  "low-carb",
  "halal",
];

const RESTRICTION_KEY = "se7a_meal_suggest_restrictions";

export default function MealsSuggest() {
  const params = useLocalSearchParams<{ slot?: MealSlot }>();
  const initialSlot =
    typeof params.slot === "string" && SLOTS.includes(params.slot as MealSlot)
      ? (params.slot as MealSlot)
      : slotForNow();

  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const { ent } = useEntitlement();
  const [slot, setSlot] = useState<MealSlot>(initialSlot);
  const [data, setData] = useState<SuggestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [logging, setLogging] = useState<number | null>(null);
  const [restrictions, setRestrictions] = useState<Restriction[]>([]);
  // Guard: don't persist on the first render — would clobber the
  // stored list with the empty default before hydrate finishes.
  const [restrictionsHydrated, setRestrictionsHydrated] = useState(false);

  // Hydrate restrictions once on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(RESTRICTION_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setRestrictions(
              parsed.filter((r): r is Restriction =>
                RESTRICTIONS.includes(r as Restriction)
              )
            );
          }
        }
      } catch {
        /* empty */
      }
      setRestrictionsHydrated(true);
    })();
  }, []);

  // Persist restrictions on change (post-hydrate)
  useEffect(() => {
    if (!restrictionsHydrated) return;
    AsyncStorage.setItem(
      RESTRICTION_KEY,
      JSON.stringify(restrictions)
    ).catch(() => {});
  }, [restrictions, restrictionsHydrated]);

  const load = async (nextSlot: MealSlot, nextRestrictions: Restriction[]) => {
    setLoading(true);
    setErr("");
    setData(null);
    try {
      const res = await api<SuggestResponse>("/api/meals/suggest", {
        method: "POST",
        body: JSON.stringify({
          meal_slot: nextSlot,
          restrictions: nextRestrictions.length > 0 ? nextRestrictions : undefined,
        }),
      });
      setData(res);
    } catch (e) {
      if (e instanceof RateLimitedError) {
        showRateLimitAlert(e, {
          isArabic,
          isPro: ent.is_pro,
          // Meal-suggest is free but shares scan limits; nudge
          // toward the generic Pro upgrade (no specific feature).
        });
      } else {
        setErr((e as Error).message || "Couldn't get suggestions.");
      }
    }
    setLoading(false);
  };

  // Initial fetch — waits for hydrate so restrictions are correct on
  // first call.
  useEffect(() => {
    if (!restrictionsHydrated) return;
    load(slot, restrictions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restrictionsHydrated]);

  const changeSlot = (s: MealSlot) => {
    setSlot(s);
    load(s, restrictions);
  };

  const toggleRestriction = (r: Restriction) => {
    setRestrictions((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
    );
  };

  const logSuggestion = async (s: Suggestion, idx: number) => {
    setLogging(idx);
    const item = {
      name: s.name,
      portion_estimate: s.portion,
      kcal_low: s.kcal_low,
      kcal_high: s.kcal_high,
      protein_g_low: s.protein_g_low,
      protein_g_high: s.protein_g_high,
      carb_g_low: s.carb_g_low,
      carb_g_high: s.carb_g_high,
      fat_g_low: s.fat_g_low,
      fat_g_high: s.fat_g_high,
      confidence: "medium" as const,
    };
    try {
      await api("/api/ledger/add", {
        method: "POST",
        body: JSON.stringify({
          source: "manual",
          meal_slot: slot,
          items: [item],
        }),
      });
      markDayDirty();
      pushOptimisticLogItems([
        { ...item, source: "manual", meal_slot: slot },
      ]);
      router.replace("/");
    } catch (e) {
      setErr((e as Error).message || t("meals_suggest.couldnt_log"));
      setLogging(null);
    }
  };

  const restrictionLabel = (r: Restriction): string => {
    if (isArabic) {
      switch (r) {
        case "vegetarian":
          return "نباتي";
        case "vegan":
          return "نباتي صرف";
        case "dairy-free":
          return "بدون ألبان";
        case "gluten-free":
          return "بدون غلوتين";
        case "low-carb":
          return "قليل الكارب";
        case "halal":
          return "حلال";
      }
    }
    switch (r) {
      case "vegetarian":
        return "Vegetarian";
      case "vegan":
        return "Vegan";
      case "dairy-free":
        return "Dairy-free";
      case "gluten-free":
        return "Gluten-free";
      case "low-carb":
        return "Low-carb";
      case "halal":
        return "Halal";
    }
  };

  return (
    <Screen>
      <View style={styles.head}>
        <BackButton />
      </View>
      <Text style={styles.kicker}>{t("meals_suggest.kicker")}</Text>
      <Text style={styles.h1}>
        {slot === "breakfast"
          ? t("meals_suggest.title_breakfast")
          : slot === "lunch"
            ? t("meals_suggest.title_lunch")
            : slot === "dinner"
              ? t("meals_suggest.title_dinner")
              : t("meals_suggest.title_snack")}
      </Text>
      <Text style={styles.sub}>
        {isArabic
          ? "اقتراحات تناسب ما تبقّى لك من اليوم."
          : "Suggestions tailored to what you have left today."}
      </Text>

      <View style={styles.chipRow}>
        {SLOTS.map((s) => (
          <Pressable
            key={s}
            onPress={() => changeSlot(s)}
            disabled={loading}
            style={[styles.chip, slot === s && styles.chipOn]}
          >
            <Text style={[styles.chipText, slot === s && styles.chipTextOn]}>
              {t(`common.meal_slot.${s}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      {data ? (
        <View style={styles.budgetCard}>
          <Text style={styles.budgetKicker}>
            {(isArabic ? "متبقي اليوم" : "Remaining today").toUpperCase()}
          </Text>
          <View style={styles.budgetGrid}>
            <BudgetPill
              label={isArabic ? "سعرة" : "kcal"}
              range={data.remaining.kcal}
              tint={colors.gold}
              suffix=""
            />
            <BudgetPill
              label={isArabic ? "بروتين" : "P"}
              range={data.remaining.protein_g}
              tint={colors.mint}
              suffix="g"
            />
            <BudgetPill
              label={isArabic ? "كارب" : "C"}
              range={data.remaining.carb_g}
              tint={colors.gold}
              suffix="g"
            />
            <BudgetPill
              label={isArabic ? "دهون" : "F"}
              range={data.remaining.fat_g}
              tint={colors.coral}
              suffix="g"
            />
          </View>
        </View>
      ) : null}

      {/* Restriction toggles — persist to AsyncStorage. Re-fetches
          suggestions on change so the user sees the effect immediately. */}
      <View style={styles.restrictionRow}>
        {RESTRICTIONS.map((r) => {
          const on = restrictions.includes(r);
          return (
            <Pressable
              key={r}
              onPress={() => {
                toggleRestriction(r);
              }}
              style={[styles.rChip, on && styles.rChipOn]}
            >
              {on ? (
                <Ionicons name="checkmark" size={11} color={colors.gold} />
              ) : null}
              <Text style={[styles.rChipText, on && styles.rChipTextOn]}>
                {restrictionLabel(r)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading && (
        <View style={{ paddingVertical: spacing.xl, alignItems: "center" }}>
          <ActivityIndicator color={colors.gold} />
          <Text style={[styles.sub, { marginTop: spacing.sm }]}>
            {t("meals_suggest.thinking")}
          </Text>
        </View>
      )}

      {err ? <Text style={styles.err}>{err}</Text> : null}

      {!loading && data && data.suggestions.length === 0 && (
        <EmptyState
          icon="bulb-outline"
          title={t("meals_suggest.empty_title")}
          body={t("meals_suggest.empty_body")}
          ctaLabel={t("meals_suggest.empty_cta")}
          onCta={() => router.push("/edit-profile" as never)}
        />
      )}

      {data?.suggestions.map((s, i) => (
        <SuggestionCard
          key={`${s.name}-${i}`}
          suggestion={s}
          remaining={data.remaining}
          slotLabel={t(`common.meal_slot.${slot}`)}
          isArabic={isArabic}
          logging={logging === i}
          disabled={logging !== null}
          onLog={() => logSuggestion(s, i)}
        />
      ))}

      {data?.notes && (
        <View style={styles.notesCard}>
          <Text style={styles.notesLabel}>{t("meals_suggest.note")}</Text>
          <Text style={styles.notesBody}>{data.notes}</Text>
        </View>
      )}

      {!loading && data && (
        <Btn
          label={t("meals_suggest.give_different")}
          variant="ghost"
          onPress={() => load(slot, restrictions)}
          disabled={logging !== null}
        />
      )}
    </Screen>
  );
}

function BudgetPill({
  label,
  range,
  tint,
  suffix,
}: {
  label: string;
  range: Range;
  tint: string;
  suffix: string;
}) {
  const mid = Math.round((range.low + range.high) / 2);
  const over = mid < 0;
  return (
    <View
      style={[
        styles.budgetPill,
        over && { borderColor: colors.coral + "66" },
      ]}
    >
      <Text style={[styles.budgetValue, { color: over ? colors.coral : tint }]}>
        {Math.max(0, mid)}
        {suffix ? (
          <Text style={styles.budgetSuffix}> {suffix}</Text>
        ) : null}
      </Text>
      <Text style={styles.budgetLabel}>{label}</Text>
    </View>
  );
}

function SuggestionCard({
  suggestion: s,
  remaining,
  slotLabel,
  isArabic,
  logging,
  disabled,
  onLog,
}: {
  suggestion: Suggestion;
  remaining: SuggestResponse["remaining"];
  slotLabel: string;
  isArabic: boolean;
  logging: boolean;
  disabled: boolean;
  onLog: () => void;
}) {
  // Fit indicator: suggestion midpoint vs remaining midpoint. "Fit"
  // when it lands within 70-110% of the remaining kcal — otherwise it
  // either barely moves the needle or busts the budget.
  const sMid = (s.kcal_low + s.kcal_high) / 2;
  const rMid = Math.max(1, (remaining.kcal.low + remaining.kcal.high) / 2);
  const ratio = sMid / rMid;
  let fitLabel: string;
  let fitColor: string;
  let fitIcon: keyof typeof Ionicons.glyphMap;
  if (ratio > 1.15) {
    fitLabel = isArabic ? "فوق الميزانية" : "Over budget";
    fitColor = colors.coral;
    fitIcon = "warning";
  } else if (ratio >= 0.7) {
    fitLabel = isArabic ? "يناسب تماماً" : "Fits well";
    fitColor = colors.mint;
    fitIcon = "checkmark-circle";
  } else {
    fitLabel = isArabic ? "ميزانية فائضة" : "Light hit";
    fitColor = colors.gold;
    fitIcon = "ellipse-outline";
  }

  const fmt = (n: number): string => {
    if (n >= 100) return String(Math.round(n));
    return String(Math.round(n * 10) / 10);
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <Text style={styles.name}>{s.name}</Text>
        <View
          style={[styles.fitPill, { borderColor: fitColor + "66", backgroundColor: fitColor + "15" }]}
        >
          <Ionicons name={fitIcon} size={10} color={fitColor} />
          <Text style={[styles.fitText, { color: fitColor }]}>{fitLabel}</Text>
        </View>
      </View>
      <Text style={styles.portion}>{s.portion}</Text>
      <Text style={styles.kcal}>
        {s.kcal_low}–{s.kcal_high}
        <Text style={styles.kcalUnit}> kcal</Text>
      </Text>
      <Text style={styles.macros}>
        P {fmt(s.protein_g_low)}–{fmt(s.protein_g_high)} · C{" "}
        {fmt(s.carb_g_low)}–{fmt(s.carb_g_high)} · F{" "}
        {fmt(s.fat_g_low)}–{fmt(s.fat_g_high)}
      </Text>
      <Text style={styles.reason}>{s.reason}</Text>
      <View style={{ height: spacing.sm }} />
      <Btn
        label={
          logging
            ? isArabic ? "جارٍ التسجيل…" : "Logging…"
            : isArabic ? `سجّل كـ${slotLabel}` : `Log as ${slotLabel}`
        }
        onPress={onLog}
        loading={logging}
        disabled={disabled}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { marginTop: spacing.sm },
  kicker: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  h1: {
    fontFamily: font.displayBold,
    fontSize: 28,
    color: colors.ink,
    marginTop: 4,
  },
  sub: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    marginTop: 2,
    lineHeight: 20,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: spacing.md,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
  },
  chipOn: {
    borderColor: colors.gold,
    backgroundColor: "rgba(246,183,60,0.12)",
  },
  chipText: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
    textTransform: "capitalize",
  },
  chipTextOn: {
    color: colors.gold,
  },
  // Budget card
  budgetCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  budgetKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
  },
  budgetGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  budgetPill: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
    alignItems: "center",
  },
  budgetValue: {
    fontFamily: font.displayBold,
    fontSize: 17,
  },
  budgetSuffix: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
  },
  budgetLabel: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.dim,
    letterSpacing: 1,
    marginTop: 2,
  },
  // Restriction toggles
  restrictionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: spacing.md,
  },
  rChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
  },
  rChipOn: {
    borderColor: colors.gold,
    backgroundColor: "rgba(246,183,60,0.12)",
  },
  rChipText: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 0.5,
  },
  rChipTextOn: {
    color: colors.gold,
  },
  // Suggestion card
  card: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    gap: 4,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  name: {
    fontFamily: font.displayBold,
    fontSize: 17,
    color: colors.ink,
    flex: 1,
  },
  fitPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  fitText: {
    fontFamily: font.mono,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  portion: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
  },
  kcal: {
    fontFamily: font.displayBold,
    fontSize: 20,
    color: colors.gold,
    marginTop: 4,
  },
  kcalUnit: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
  },
  macros: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
    letterSpacing: 0.3,
  },
  reason: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.ink,
    marginTop: 4,
    lineHeight: 20,
  },
  notesCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.panel2,
    borderRadius: radius.md,
    gap: 4,
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
    lineHeight: 20,
  },
  err: {
    marginTop: spacing.md,
    color: colors.coral,
    fontFamily: font.body,
    fontSize: 13,
  },
});
