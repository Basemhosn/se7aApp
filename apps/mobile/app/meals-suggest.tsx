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
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { BackButton } from "@/components/BackButton";
import { api, RateLimitedError, rateLimitMessage } from "@/lib/api";
import { markDayDirty } from "@/lib/calendarCache";
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

interface SuggestResponse {
  ok: true;
  suggestions: Suggestion[];
  notes?: string;
  remaining: {
    kcal: { low: number; high: number };
  };
}

export default function MealsSuggest() {
  const params = useLocalSearchParams<{ slot?: MealSlot }>();
  const initialSlot =
    typeof params.slot === "string" && SLOTS.includes(params.slot as MealSlot)
      ? (params.slot as MealSlot)
      : slotForNow();

  const { t } = useTranslation();
  const [slot, setSlot] = useState<MealSlot>(initialSlot);
  const [data, setData] = useState<SuggestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [logging, setLogging] = useState<number | null>(null);

  const load = async (nextSlot: MealSlot) => {
    setLoading(true);
    setErr("");
    setData(null);
    try {
      const res = await api<SuggestResponse>("/api/meals/suggest", {
        method: "POST",
        body: JSON.stringify({ meal_slot: nextSlot }),
      });
      setData(res);
    } catch (e) {
      if (e instanceof RateLimitedError) {
        const { title, body } = rateLimitMessage(e);
        Alert.alert(title, body);
      } else {
        setErr((e as Error).message || "Couldn't get suggestions.");
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    load(slot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeSlot = (s: MealSlot) => {
    setSlot(s);
    load(s);
  };

  const logSuggestion = async (s: Suggestion, idx: number) => {
    setLogging(idx);
    try {
      await api("/api/ledger/add", {
        method: "POST",
        body: JSON.stringify({
          source: "manual",
          meal_slot: slot,
          items: [
            {
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
              confidence: "medium",
            },
          ],
        }),
      });
      markDayDirty();
      router.replace("/");
    } catch (e) {
      setErr((e as Error).message || t("meals_suggest.couldnt_log"));
      setLogging(null);
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
        {data
          ? t("meals_suggest.sub_fitted", {
              low: data.remaining.kcal.low,
              high: data.remaining.kcal.high,
            })
          : t("meals_suggest.sub_loading")}
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

      {loading && (
        <View style={{ paddingVertical: spacing.xl, alignItems: "center" }}>
          <ActivityIndicator color={colors.gold} />
          <Text style={[styles.sub, { marginTop: spacing.sm }]}>
            {t("meals_suggest.thinking")}
          </Text>
        </View>
      )}

      {err ? <Text style={styles.err}>{err}</Text> : null}

      {data?.suggestions.map((s, i) => (
        <View key={`${s.name}-${i}`} style={styles.card}>
          <Text style={styles.name}>{s.name}</Text>
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
              logging === i
                ? t("meals_suggest.logging")
                : t("meals_suggest.log_cta", {
                    slot: t(`common.meal_slot.${slot}`),
                  })
            }
            onPress={() => logSuggestion(s, i)}
            loading={logging === i}
            disabled={logging !== null}
          />
        </View>
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
          onPress={() => load(slot)}
          disabled={logging !== null}
        />
      )}
    </Screen>
  );
}

function fmt(n: number): string {
  if (n >= 100) return String(Math.round(n));
  return String(Math.round(n * 10) / 10);
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
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
  },
  chipOn: { borderColor: colors.gold, backgroundColor: "rgba(246,183,60,0.10)" },
  chipText: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.ink,
    textTransform: "capitalize",
  },
  chipTextOn: { color: colors.gold },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 4,
  },
  name: {
    fontFamily: font.displayBold,
    fontSize: 20,
    color: colors.ink,
  },
  portion: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
  },
  kcal: {
    fontFamily: font.displayBold,
    fontSize: 22,
    color: colors.gold,
    marginTop: 6,
  },
  kcalUnit: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
  },
  macros: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    marginTop: 2,
  },
  reason: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 19,
    marginTop: 8,
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
  err: { color: colors.coral, fontFamily: font.body, fontSize: 13 },
});
