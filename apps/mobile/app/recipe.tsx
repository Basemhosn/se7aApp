import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { BackButton } from "@/components/BackButton";
import { api } from "@/lib/api";
import { markDayDirty } from "@/lib/calendarCache";
import type { MealSlot } from "@/types";
import { colors, font, radius, spacing } from "@/lib/theme";

interface Ingredient {
  name_en: string;
  name_ar?: string;
  qty: string;
}

interface Recipe {
  id: string;
  name_en: string;
  name_ar: string;
  category: string;
  cuisine: string;
  servings: number;
  prep_time_min: number;
  cook_time_min: number;
  kcal_low: number;
  kcal_high: number;
  protein_g_low: number;
  protein_g_high: number;
  carb_g_low: number;
  carb_g_high: number;
  fat_g_low: number;
  fat_g_high: number;
  ingredients: Ingredient[];
  steps: string[];
  tags: string[];
  notes?: string;
}

function slotForNow(): MealSlot {
  const h = new Date().getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}

const SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

export default function RecipePage() {
  const { i18n, t } = useTranslation();
  const isArabic = i18n.language === "ar";
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [logging, setLogging] = useState(false);
  const [slot, setSlot] = useState<MealSlot>(slotForNow());
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await api<{ recipes: Recipe[] }>("/api/recipes/list");
        const found = res.recipes.find((r) => r.id === id) ?? null;
        setRecipe(found);
      } catch {
        /* empty */
      }
      setLoading(false);
    })();
  }, [id]);

  const logRecipe = async () => {
    if (!recipe) return;
    setLogging(true);
    setErr("");
    try {
      await api("/api/ledger/add", {
        method: "POST",
        body: JSON.stringify({
          source: "manual",
          meal_slot: slot,
          items: [
            {
              name: isArabic ? recipe.name_ar : recipe.name_en,
              portion_estimate: `${recipe.servings} serving`,
              kcal_low: recipe.kcal_low,
              kcal_high: recipe.kcal_high,
              protein_g_low: recipe.protein_g_low,
              protein_g_high: recipe.protein_g_high,
              carb_g_low: recipe.carb_g_low,
              carb_g_high: recipe.carb_g_high,
              fat_g_low: recipe.fat_g_low,
              fat_g_high: recipe.fat_g_high,
              confidence: "high",
            },
          ],
        }),
      });
      markDayDirty();
      router.replace("/");
    } catch (e) {
      setErr((e as Error).message || "Couldn't log — try again.");
      setLogging(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <View style={styles.head}>
          <BackButton />
        </View>
        <View style={{ paddingVertical: spacing.xl, alignItems: "center" }}>
          <ActivityIndicator color={colors.gold} />
        </View>
      </Screen>
    );
  }

  if (!recipe) {
    return (
      <Screen>
        <View style={styles.head}>
          <BackButton />
        </View>
        <Text style={styles.h1}>Recipe not found.</Text>
      </Screen>
    );
  }

  const totalMin = recipe.prep_time_min + recipe.cook_time_min;

  return (
    <Screen>
      <View style={styles.head}>
        <BackButton />
      </View>
      <Text style={styles.kicker}>{recipe.cuisine.toUpperCase()}</Text>
      <Text style={styles.h1}>{isArabic ? recipe.name_ar : recipe.name_en}</Text>
      <Text style={styles.sub}>
        {isArabic ? recipe.name_en : recipe.name_ar} · {totalMin} min · {recipe.servings} serving
      </Text>

      <View style={styles.macroCard}>
        <Text style={styles.macroKicker}>PER SERVING</Text>
        <Text style={styles.macroKcal}>
          {recipe.kcal_low}–{recipe.kcal_high}
          <Text style={styles.macroKcalUnit}> kcal</Text>
        </Text>
        <Text style={styles.macroMacros}>
          P {recipe.protein_g_low}–{recipe.protein_g_high} · C{" "}
          {recipe.carb_g_low}–{recipe.carb_g_high} · F {recipe.fat_g_low}–
          {recipe.fat_g_high}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionH}>
          {isArabic ? "المكونات" : "Ingredients"}
        </Text>
        {recipe.ingredients.map((ing, i) => (
          <View key={i} style={styles.ingRow}>
            <Text style={styles.ingName}>
              {isArabic && ing.name_ar ? ing.name_ar : ing.name_en}
            </Text>
            <Text style={styles.ingQty}>{ing.qty}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionH}>
          {isArabic ? "الخطوات" : "Steps"}
        </Text>
        {recipe.steps.map((step, i) => (
          <View key={i} style={styles.stepRow}>
            <Text style={styles.stepNum}>{i + 1}</Text>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>

      {recipe.notes && (
        <View style={styles.notesCard}>
          <Text style={styles.notesLabel}>NOTE</Text>
          <Text style={styles.notesBody}>{recipe.notes}</Text>
        </View>
      )}

      <Text style={styles.slotLabel}>
        {isArabic ? "سجّل في" : "Log to"}
      </Text>
      <View style={styles.chipRow}>
        {SLOTS.map((s) => (
          <Pressable
            key={s}
            onPress={() => setSlot(s)}
            style={[styles.chip, slot === s && styles.chipOn]}
          >
            <Text style={[styles.chipText, slot === s && styles.chipTextOn]}>
              {t(`common.meal_slot.${s}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      {!!err && <Text style={styles.err}>{err}</Text>}

      <Btn
        label={logging ? "Logging…" : `Log this to ${slot}`}
        onPress={logRecipe}
        loading={logging}
      />
    </Screen>
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
  },
  sub: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
  },
  macroCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.goldDim,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 2,
  },
  macroKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  macroKcal: {
    fontFamily: font.displayBold,
    fontSize: 24,
    color: colors.ink,
    marginTop: 4,
  },
  macroKcalUnit: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
  },
  macroMacros: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 6,
  },
  sectionH: {
    fontFamily: font.displayBold,
    fontSize: 16,
    color: colors.ink,
  },
  ingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  ingName: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.ink,
    flex: 1,
  },
  ingQty: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
  },
  stepRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  stepNum: {
    fontFamily: font.displayBold,
    fontSize: 14,
    color: colors.gold,
    width: 20,
  },
  stepText: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 21,
    flex: 1,
  },
  notesCard: {
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
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
    lineHeight: 19,
  },
  slotLabel: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    letterSpacing: 1.2,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    paddingVertical: 6,
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
  chipText: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.ink,
    textTransform: "capitalize",
  },
  chipTextOn: { color: colors.gold },
  err: { color: colors.coral, fontFamily: font.body, fontSize: 13 },
});
