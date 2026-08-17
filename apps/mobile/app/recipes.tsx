import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { api } from "@/lib/api";
import { colors, font, radius, spacing } from "@/lib/theme";

type Category = "all" | "breakfast" | "lunch" | "dinner" | "snack" | "dessert" | "drink";

interface Recipe {
  id: string;
  name_en: string;
  name_ar: string;
  category: string;
  cuisine: string;
  kcal_low: number;
  kcal_high: number;
  protein_g_low: number;
  protein_g_high: number;
  prep_time_min: number;
  cook_time_min: number;
  tags: string[];
}

interface ListResponse {
  recipes: Recipe[];
}

const CATEGORIES: { key: Category; label_en: string; label_ar: string }[] = [
  { key: "all", label_en: "All", label_ar: "الكل" },
  { key: "breakfast", label_en: "Breakfast", label_ar: "فطور" },
  { key: "lunch", label_en: "Lunch", label_ar: "غداء" },
  { key: "dinner", label_en: "Dinner", label_ar: "عشاء" },
  { key: "snack", label_en: "Snack", label_ar: "خفيف" },
  { key: "dessert", label_en: "Dessert", label_ar: "حلا" },
  { key: "drink", label_en: "Drink", label_ar: "شراب" },
];

export default function Recipes() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [cat, setCat] = useState<Category>("all");
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (c: Category) => {
    setLoading(true);
    try {
      const q = c === "all" ? "" : `?category=${c}`;
      const res = await api<ListResponse>(`/api/recipes/list${q}`);
      setRecipes(res.recipes);
    } catch {
      setRecipes([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(cat);
  }, [cat, load]);

  return (
    <Screen>
      <View style={styles.head}>
        <BackButton />
      </View>
      <Text style={styles.kicker}>{isArabic ? "وصفات" : "RECIPES"}</Text>
      <Text style={styles.h1}>
        {isArabic ? "طعام الخليج" : "Gulf-first cooking"}
      </Text>
      <Text style={styles.sub}>
        {isArabic
          ? "وصفات مع نطاقات ماكرو صادقة. اختر واحدة وسجّلها بضغطة واحدة."
          : "Curated Gulf recipes with honest macro ranges. Tap one, log it in a tap."}
      </Text>

      <View style={styles.chipRow}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => setCat(c.key)}
            style={[styles.chip, cat === c.key && styles.chipOn]}
          >
            <Text style={[styles.chipText, cat === c.key && styles.chipTextOn]}>
              {isArabic ? c.label_ar : c.label_en}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={{ paddingVertical: spacing.xl, alignItems: "center" }}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : recipes.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyBody}>
            {isArabic ? "لا توجد وصفات في هذه الفئة بعد." : "No recipes in this category yet."}
          </Text>
        </View>
      ) : (
        recipes.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => router.push({ pathname: "/recipe", params: { id: r.id } })}
            style={styles.card}
          >
            <Text style={styles.cardName}>{isArabic ? r.name_ar : r.name_en}</Text>
            <Text style={styles.cardMeta}>
              {r.cuisine} · {r.prep_time_min + r.cook_time_min} min
            </Text>
            <Text style={styles.cardKcal}>
              {r.kcal_low}–{r.kcal_high}
              <Text style={styles.cardKcalUnit}> kcal</Text>
              <Text style={styles.cardMacros}>
                {"  ·  "}P {r.protein_g_low}–{r.protein_g_high}
              </Text>
            </Text>
          </Pressable>
        ))
      )}
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
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
    lineHeight: 21,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
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
  },
  chipTextOn: { color: colors.gold },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  cardName: {
    fontFamily: font.displayBold,
    fontSize: 17,
    color: colors.ink,
  },
  cardMeta: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    marginTop: 2,
    textTransform: "capitalize",
  },
  cardKcal: {
    fontFamily: font.displayBold,
    fontSize: 15,
    color: colors.gold,
    marginTop: 6,
  },
  cardKcalUnit: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
  },
  cardMacros: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
  },
  emptyCard: {
    padding: spacing.lg,
    backgroundColor: colors.panel2,
    borderRadius: radius.md,
    alignItems: "center",
  },
  emptyBody: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
  },
});
