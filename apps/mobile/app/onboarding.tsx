import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { Wordmark } from "@/components/Wordmark";
import { api } from "@/lib/api";
import { useAuth } from "@/auth/AuthContext";
import type { ActivityLevel, Goal, Sex } from "@/types";
import { colors, font, radius, spacing } from "@/lib/theme";

const ACTIVITY: { v: ActivityLevel; label: string }[] = [
  { v: "sedentary", label: "Sedentary" },
  { v: "light", label: "Light" },
  { v: "moderate", label: "Moderate" },
  { v: "active", label: "Active" },
  { v: "very_active", label: "Very active" },
];

const GOAL: { v: Goal; label: string }[] = [
  { v: "cut", label: "Cut" },
  { v: "recomp", label: "Recomp" },
  { v: "maintain", label: "Maintain" },
  { v: "bulk", label: "Bulk" },
];

const DEFAULT_RATE: Record<Goal, number> = {
  cut: -0.5,
  recomp: -0.25,
  maintain: 0,
  bulk: 0.25,
};

export default function Onboarding() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [sex, setSex] = useState<Sex>("male");
  const [birthdate, setBirthdate] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [activity, setActivity] = useState<ActivityLevel>("moderate");
  const [goal, setGoal] = useState<Goal>("cut");
  const [rate, setRate] = useState<number>(DEFAULT_RATE.cut);
  const [name, setName] = useState("");

  const submit = async () => {
    setErr("");
    setBusy(true);
    try {
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
        }),
      });
      router.replace("/dashboard");
    } catch (e) {
      setErr((e as Error).message || "Couldn't save — check the fields.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.head}>
        <Wordmark size={22} />
      </View>
      <Text style={styles.h1}>Set up your targets</Text>
      <Text style={styles.sub}>
        Real formulas, not vibes. Mifflin-St Jeor for BMR, your activity
        level for TDEE, then your goal rate sets today&apos;s calorie and
        macro targets. You can change any of this later.
      </Text>

      <Field label="Display name (optional)">
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={user?.email?.split("@")[0] ?? ""}
          placeholderTextColor={colors.dim}
          style={styles.input}
        />
      </Field>

      <View style={styles.row}>
        <Field label="Sex (for BMR)" style={{ flex: 1 }}>
          <ChipGroup
            options={[
              { v: "male", label: "Male" },
              { v: "female", label: "Female" },
            ]}
            value={sex}
            onChange={(v) => setSex(v as Sex)}
          />
        </Field>
      </View>

      <Field label="Birthdate (YYYY-MM-DD)">
        <TextInput
          value={birthdate}
          onChangeText={setBirthdate}
          placeholder="1995-06-11"
          placeholderTextColor={colors.dim}
          autoCapitalize="none"
          style={styles.input}
        />
      </Field>

      <View style={styles.row}>
        <Field label="Height (cm)" style={{ flex: 1 }}>
          <TextInput
            value={height}
            onChangeText={setHeight}
            keyboardType="numeric"
            style={styles.input}
          />
        </Field>
        <Field label="Weight (kg)" style={{ flex: 1 }}>
          <TextInput
            value={weight}
            onChangeText={setWeight}
            keyboardType="numeric"
            style={styles.input}
          />
        </Field>
      </View>

      <Field label="Activity level">
        <ChipGroup
          options={ACTIVITY.map((a) => ({ v: a.v, label: a.label }))}
          value={activity}
          onChange={(v) => setActivity(v as ActivityLevel)}
        />
      </Field>

      <Field label="Goal">
        <ChipGroup
          options={GOAL.map((g) => ({ v: g.v, label: g.label }))}
          value={goal}
          onChange={(v) => {
            const g = v as Goal;
            setGoal(g);
            setRate(DEFAULT_RATE[g]);
          }}
        />
      </Field>

      <Field label="Rate (kg / week)">
        <TextInput
          value={String(rate)}
          onChangeText={(v) => setRate(Number(v))}
          keyboardType="numbers-and-punctuation"
          style={styles.input}
        />
      </Field>

      {!!err && <Text style={styles.err}>{err}</Text>}

      <Btn
        label={busy ? "Computing…" : "Compute my targets"}
        onPress={submit}
        loading={busy}
      />
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
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function ChipGroup({
  options,
  value,
  onChange,
}: {
  options: { v: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((o) => {
        const on = o.v === value;
        return (
          <Pressable
            key={o.v}
            onPress={() => onChange(o.v)}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { marginTop: spacing.md },
  h1: { fontFamily: font.displayBold, fontSize: 30, color: colors.ink },
  sub: { color: colors.dim, fontFamily: font.body, fontSize: 14, lineHeight: 22 },
  row: { flexDirection: "row", gap: spacing.md },
  field: { gap: spacing.xs },
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
    fontSize: 15,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
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
  err: { color: colors.coral, fontFamily: font.body, fontSize: 13 },
});
