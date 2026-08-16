import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { Wordmark } from "@/components/Wordmark";
import { api } from "@/lib/api";
import type { MealSlot } from "@/types";
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * Manual meal entry — bypass the scan for foods you know cold. Writes to
 * meal_items with source='manual'. Only kcal is required; macros default
 * to zero if left blank.
 */
export default function ManualMeal() {
  const [name, setName] = useState("");
  const [portion, setPortion] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carb, setCarb] = useState("");
  const [fat, setFat] = useState("");
  const [slot, setSlot] = useState<MealSlot>(slotForNow());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const canSave = name.trim().length > 0 && Number(kcal) > 0 && !busy;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setErr("");
    const k = Math.round(Number(kcal));
    const p = Number(protein) || 0;
    const c = Number(carb) || 0;
    const f = Number(fat) || 0;
    try {
      await api("/api/ledger/add", {
        method: "POST",
        body: JSON.stringify({
          source: "manual",
          meal_slot: slot,
          items: [
            {
              name: name.trim(),
              portion_estimate: portion.trim() || undefined,
              kcal_low: k,
              kcal_high: k,
              protein_g_low: p,
              protein_g_high: p,
              carb_g_low: c,
              carb_g_high: c,
              fat_g_low: f,
              fat_g_high: f,
              confidence: "high",
            },
          ],
        }),
      });
      router.replace("/dashboard");
    } catch (e) {
      setErr((e as Error).message || "Couldn't save. Try again.");
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
              {s}
            </Text>
          </Pressable>
        ))}
      </View>
      <Btn
        label={busy ? "Saving…" : canSave ? `Log to ${slot}` : "Add name + kcal"}
        onPress={save}
        loading={busy}
        disabled={!canSave}
      />
    </>
  );

  return (
    <Screen footer={footer}>
      <View style={styles.head}>
        <Pressable onPress={() => router.back()}>
          <Wordmark size={20} />
        </Pressable>
      </View>
      <Text style={styles.kicker}>MANUAL ENTRY</Text>
      <Text style={styles.h1}>Add without scanning.</Text>
      <Text style={styles.sub}>
        For foods you know cold. Only name + kcal are required — macros stay
        as a single value (no ranges) since you&apos;re providing them yourself.
      </Text>

      <Field label="NAME">
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Black coffee"
          placeholderTextColor={colors.dim}
          style={styles.input}
        />
      </Field>

      <Field label="PORTION (OPTIONAL)">
        <TextInput
          value={portion}
          onChangeText={setPortion}
          placeholder="1 cup, 240 ml"
          placeholderTextColor={colors.dim}
          style={styles.input}
        />
      </Field>

      <Field label="CALORIES">
        <TextInput
          value={kcal}
          onChangeText={setKcal}
          keyboardType="numeric"
          placeholder="150"
          placeholderTextColor={colors.dim}
          style={styles.bigInput}
        />
      </Field>

      <View style={styles.macroRow}>
        <Field label="PROTEIN (G)" style={{ flex: 1 }}>
          <TextInput
            value={protein}
            onChangeText={setProtein}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={colors.dim}
            style={styles.input}
          />
        </Field>
        <Field label="CARBS (G)" style={{ flex: 1 }}>
          <TextInput
            value={carb}
            onChangeText={setCarb}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={colors.dim}
            style={styles.input}
          />
        </Field>
        <Field label="FAT (G)" style={{ flex: 1 }}>
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

function slotForNow(): MealSlot {
  const h = new Date().getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
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
