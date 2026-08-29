import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { BackButton } from "@/components/BackButton";
import { api } from "@/lib/api";
import { markDayDirty, pushOptimisticLogItems } from "@/lib/calendarCache";
import type { MealSlot } from "@/types";
import { slotForNow } from "@/lib/slot";
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * Manual meal entry. Users can either search the AI food database
 * (MFP-style — tap a result to pre-fill) or type everything in by
 * hand. The form is the source of truth for what actually gets saved;
 * a search hit just populates the fields for the user to tweak.
 */

interface LookupItem {
  name: string;
  portion: string;
  kcal_low: number;
  kcal_high: number;
  protein_g_low: number;
  protein_g_high: number;
  carb_g_low: number;
  carb_g_high: number;
  fat_g_low: number;
  fat_g_high: number;
  confidence: "low" | "medium" | "high";
}

interface LookupResponse {
  items: LookupItem[];
  notes?: string;
}

const mid = (lo: number, hi: number) => Math.round((lo + hi) / 2);
const midDec = (lo: number, hi: number) =>
  Math.round(((lo + hi) / 2) * 10) / 10;

export default function ManualMeal() {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [portion, setPortion] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carb, setCarb] = useState("");
  const [fat, setFat] = useState("");
  const [slot, setSlot] = useState<MealSlot>(slotForNow());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<LookupItem[] | null>(null);
  const [searchErr, setSearchErr] = useState("");

  const canSave = name.trim().length > 0 && Number(kcal) > 0 && !busy;

  const search = async () => {
    const q = query.trim();
    if (q.length < 2 || searching) return;
    setSearching(true);
    setSearchErr("");
    setResults(null);
    try {
      const res = await api<LookupResponse>("/api/food/lookup", {
        method: "POST",
        body: JSON.stringify({ query: q }),
      });
      setResults(res.items);
    } catch (e) {
      setSearchErr((e as Error).message || t("manual_meal.search.err_generic"));
    }
    setSearching(false);
  };

  const pickResult = (r: LookupItem) => {
    setName(r.name);
    setPortion(r.portion);
    setKcal(String(mid(r.kcal_low, r.kcal_high)));
    setProtein(String(midDec(r.protein_g_low, r.protein_g_high)));
    setCarb(String(midDec(r.carb_g_low, r.carb_g_high)));
    setFat(String(midDec(r.fat_g_low, r.fat_g_high)));
    setResults(null);
    setQuery("");
  };

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setErr("");
    const k = Math.round(Number(kcal));
    const p = Number(protein) || 0;
    const c = Number(carb) || 0;
    const f = Number(fat) || 0;
    const item = {
      name: name.trim(),
      portion_estimate: portion.trim() || null,
      kcal_low: k,
      kcal_high: k,
      protein_g_low: p,
      protein_g_high: p,
      carb_g_low: c,
      carb_g_high: c,
      fat_g_low: f,
      fat_g_high: f,
      confidence: "high" as const,
    };
    try {
      await api("/api/ledger/add", {
        method: "POST",
        body: JSON.stringify({
          source: "manual",
          meal_slot: slot,
          items: [{ ...item, portion_estimate: item.portion_estimate ?? undefined }],
        }),
      });
      markDayDirty();
      pushOptimisticLogItems([
        { ...item, source: "manual", meal_slot: slot },
      ]);
      router.replace("/");
    } catch (e) {
      setErr((e as Error).message || t("manual_meal.couldnt_save"));
      setBusy(false);
    }
  };

  const footer = (
    <>
      {!!err && <Text style={styles.err}>{err}</Text>}
      <View style={styles.slotRow}>
        {(["breakfast", "lunch", "dinner", "snack"] as MealSlot[]).map((s) => (
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
      <Btn
        label={
          busy
            ? t("common.saving")
            : canSave
              ? t("manual_meal.cta_log_to", { slot: t(`common.meal_slot.${slot}`) })
              : t("manual_meal.cta_need_name_kcal")
        }
        onPress={save}
        loading={busy}
        disabled={!canSave}
      />
    </>
  );

  return (
    <Screen footer={footer}>
      <View style={styles.head}>
        <BackButton />
      </View>
      <Text style={styles.kicker}>{t("manual_meal.kicker")}</Text>
      <Text style={styles.h1}>{t("manual_meal.title")}</Text>
      <Text style={styles.sub}>{t("manual_meal.sub")}</Text>

      <View style={styles.searchWrap}>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color={colors.dim} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("manual_meal.search.placeholder")}
            placeholderTextColor={colors.dim}
            style={styles.searchInput}
            returnKeyType="search"
            onSubmitEditing={search}
            autoCapitalize="none"
          />
          {query.length > 0 && !searching && (
            <Pressable
              onPress={search}
              disabled={query.trim().length < 2}
              style={styles.searchGo}
              hitSlop={8}
            >
              <Text style={styles.searchGoText}>
                {t("manual_meal.search.go")}
              </Text>
            </Pressable>
          )}
          {searching && <ActivityIndicator color={colors.gold} />}
        </View>
        {!!searchErr && <Text style={styles.searchErr}>{searchErr}</Text>}
        {results && results.length === 0 && (
          <Text style={styles.searchEmpty}>
            {t("manual_meal.search.empty")}
          </Text>
        )}
        {results && results.length > 0 && (
          <View style={{ gap: spacing.xs }}>
            {results.map((r, i) => (
              <Pressable
                key={`${r.name}-${i}`}
                onPress={() => pickResult(r)}
                style={styles.resultCard}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultName} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <Text style={styles.resultPortion} numberOfLines={1}>
                    {r.portion}
                  </Text>
                </View>
                <View style={styles.resultMacros}>
                  <Text style={styles.resultKcal}>
                    {r.kcal_low}–{r.kcal_high}
                  </Text>
                  <Text style={styles.resultKcalUnit}>{t("common.kcal")}</Text>
                </View>
              </Pressable>
            ))}
            <Text style={styles.searchHint}>
              {t("manual_meal.search.tap_to_fill")}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>{t("manual_meal.or_manual")}</Text>
        <View style={styles.dividerLine} />
      </View>

      <Field label={t("manual_meal.name_label")}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t("manual_meal.name_placeholder")}
          placeholderTextColor={colors.dim}
          style={styles.input}
        />
      </Field>

      <Field label={t("manual_meal.portion_label")}>
        <TextInput
          value={portion}
          onChangeText={setPortion}
          placeholder={t("manual_meal.portion_placeholder")}
          placeholderTextColor={colors.dim}
          style={styles.input}
        />
      </Field>

      <Field label={t("manual_meal.kcal_label")}>
        <TextInput
          value={kcal}
          onChangeText={setKcal}
          keyboardType="numeric"
          placeholder={t("manual_meal.kcal_placeholder")}
          placeholderTextColor={colors.dim}
          style={styles.bigInput}
        />
      </Field>

      <View style={styles.macroRow}>
        <Field label={t("manual_meal.protein_label")} style={{ flex: 1 }}>
          <TextInput
            value={protein}
            onChangeText={setProtein}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={colors.dim}
            style={styles.input}
          />
        </Field>
        <Field label={t("manual_meal.carbs_label")} style={{ flex: 1 }}>
          <TextInput
            value={carb}
            onChangeText={setCarb}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={colors.dim}
            style={styles.input}
          />
        </Field>
        <Field label={t("manual_meal.fat_label")} style={{ flex: 1 }}>
          <TextInput
            value={fat}
            onChangeText={setFat}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={colors.dim}
            style={styles.input}
          />
        </Field>
      </View>
    </Screen>
  );
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View style={[{ gap: 4 }, style]}>
      <Text style={styles.label}>{label}</Text>
      {children}
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
    fontSize: 26,
    color: colors.ink,
  },
  sub: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
    lineHeight: 21,
  },
  searchWrap: { gap: spacing.sm, marginTop: spacing.sm },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  searchInput: {
    flex: 1,
    color: colors.ink,
    fontFamily: font.body,
    fontSize: 15,
    paddingVertical: spacing.sm,
  },
  searchGo: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  searchGoText: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.gold,
    letterSpacing: 1.2,
  },
  searchErr: { color: colors.coral, fontFamily: font.body, fontSize: 13 },
  searchEmpty: {
    color: colors.dim,
    fontFamily: font.body,
    fontSize: 13,
    fontStyle: "italic",
  },
  searchHint: {
    color: colors.dim,
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  resultCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  resultName: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: colors.ink,
  },
  resultPortion: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
    marginTop: 2,
  },
  resultMacros: { alignItems: "flex-end" },
  resultKcal: {
    fontFamily: font.mono,
    fontSize: 14,
    color: colors.gold,
  },
  resultKcalUnit: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.line,
  },
  dividerText: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
  },
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
  bigInput: {
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    color: colors.ink,
    fontFamily: font.mono,
    fontSize: 24,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    textAlign: "center",
  },
  macroRow: { flexDirection: "row", gap: spacing.sm },
  slotRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
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
