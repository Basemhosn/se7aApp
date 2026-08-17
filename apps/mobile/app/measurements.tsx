import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { BackButton } from "@/components/BackButton";
import { api } from "@/lib/api";
import { colors, font, radius, spacing } from "@/lib/theme";

type Field = "waist_cm" | "hip_cm" | "chest_cm" | "arm_cm" | "thigh_cm" | "neck_cm";

const FIELDS: { key: Field; en: string; ar: string }[] = [
  { key: "waist_cm", en: "Waist", ar: "الخصر" },
  { key: "hip_cm", en: "Hip", ar: "الورك" },
  { key: "chest_cm", en: "Chest", ar: "الصدر" },
  { key: "arm_cm", en: "Arm", ar: "الذراع" },
  { key: "thigh_cm", en: "Thigh", ar: "الفخذ" },
  { key: "neck_cm", en: "Neck", ar: "الرقبة" },
];

interface Measurement {
  id: number;
  taken_at: string;
  waist_cm: number | null;
  hip_cm: number | null;
  chest_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
  neck_cm: number | null;
  notes: string | null;
}

interface ListResponse {
  measurements: Measurement[];
  count: number;
  deltas: Record<Field, number | null> | null;
}

export default function Measurements() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<Field, string>>({
    waist_cm: "",
    hip_cm: "",
    chest_cm: "",
    arm_cm: "",
    thigh_cm: "",
    neck_cm: "",
  });
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<ListResponse>("/api/measurements");
      setData(res);
    } catch (e) {
      setErr((e as Error).message);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const save = async () => {
    const body: Partial<Record<Field, number>> = {};
    for (const f of FIELDS) {
      const raw = form[f.key].trim();
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) continue;
      body[f.key] = n;
    }
    if (Object.keys(body).length === 0) {
      Alert.alert(
        isArabic ? "أدخل قياساً واحداً على الأقل" : "Enter at least one measurement"
      );
      return;
    }
    setSaving(true);
    setErr("");
    try {
      await api("/api/measurements", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setForm({
        waist_cm: "",
        hip_cm: "",
        chest_cm: "",
        arm_cm: "",
        thigh_cm: "",
        neck_cm: "",
      });
      await load();
    } catch (e) {
      setErr((e as Error).message || "Couldn't save.");
    }
    setSaving(false);
  };

  const latest = data?.measurements[0];

  return (
    <Screen>
      <View style={styles.head}>
        <BackButton />
      </View>
      <Text style={styles.kicker}>
        {isArabic ? "القياسات" : "MEASUREMENTS"}
      </Text>
      <Text style={styles.h1}>
        {isArabic ? "الشريط لا يكذب" : "The tape doesn't lie."}
      </Text>
      <Text style={styles.sub}>
        {isArabic
          ? "الميزان يتذبذب. الخصر يخبرك ماذا يحدث فعلاً."
          : "The scale swings. Your waist tells the real story."}
      </Text>

      {loading ? (
        <View style={{ paddingVertical: spacing.xl, alignItems: "center" }}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : (
        <>
          {latest && (
            <View style={styles.latestCard}>
              <Text style={styles.latestKicker}>
                {isArabic ? "الأحدث" : "LATEST"} · {shortDate(latest.taken_at)}
              </Text>
              <View style={styles.gridRow}>
                {FIELDS.map((f) => {
                  const v = latest[f.key];
                  const delta = data?.deltas?.[f.key] ?? null;
                  return (
                    <View key={f.key} style={styles.gridCell}>
                      <Text style={styles.gridLabel}>
                        {(isArabic ? f.ar : f.en).toUpperCase()}
                      </Text>
                      <Text style={styles.gridValue}>
                        {v != null ? Number(v).toFixed(1) : "—"}
                        {v != null && (
                          <Text style={styles.gridUnit}> cm</Text>
                        )}
                      </Text>
                      {delta !== null && (
                        <Text
                          style={[
                            styles.gridDelta,
                            {
                              color:
                                delta < 0
                                  ? colors.mint
                                  : delta > 0
                                    ? colors.coral
                                    : colors.dim,
                            },
                          ]}
                        >
                          {delta > 0 ? "+" : ""}
                          {delta} cm
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
              <Text style={styles.deltaHint}>
                {isArabic
                  ? "الفرق مقارنة بأول قياس."
                  : "Delta vs your first entry."}
              </Text>
            </View>
          )}

          <View style={styles.formCard}>
            <Text style={styles.sectionH}>
              {isArabic ? "قياس جديد" : "New measurement"}
            </Text>
            <Text style={styles.sub}>
              {isArabic
                ? "املأ ما تتبعه فقط — الباقي اتركه فارغاً."
                : "Fill only what you track — leave the rest blank."}
            </Text>
            <View style={styles.formGrid}>
              {FIELDS.map((f) => (
                <View key={f.key} style={styles.formCell}>
                  <Text style={styles.formLabel}>
                    {(isArabic ? f.ar : f.en).toUpperCase()} (cm)
                  </Text>
                  <TextInput
                    value={form[f.key]}
                    onChangeText={(v) =>
                      setForm((prev) => ({ ...prev, [f.key]: v }))
                    }
                    keyboardType="numeric"
                    placeholder="—"
                    placeholderTextColor={colors.dim}
                    style={styles.input}
                  />
                </View>
              ))}
            </View>
            {!!err && <Text style={styles.err}>{err}</Text>}
            <Btn
              label={
                saving
                  ? isArabic
                    ? "جارٍ الحفظ…"
                    : "Saving…"
                  : isArabic
                    ? "احفظ"
                    : "Save"
              }
              onPress={save}
              loading={saving}
            />
          </View>

          {data && data.count > 1 && (
            <View style={styles.historyCard}>
              <Text style={styles.sectionH}>
                {isArabic ? "السجل" : "History"}
              </Text>
              {data.measurements.slice(0, 12).map((m) => (
                <View key={m.id} style={styles.historyRow}>
                  <Text style={styles.historyDate}>{shortDate(m.taken_at)}</Text>
                  <Text style={styles.historyText}>
                    {FIELDS.filter((f) => m[f.key] != null)
                      .map((f) => `${isArabic ? f.ar : f.en} ${m[f.key]}`)
                      .join(" · ")}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
}

const styles = StyleSheet.create({
  head: { marginTop: spacing.sm },
  kicker: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  h1: { fontFamily: font.displayBold, fontSize: 28, color: colors.ink },
  sub: { fontFamily: font.body, fontSize: 14, color: colors.dim, lineHeight: 21 },
  latestCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.goldDim,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  latestKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  gridRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  gridCell: {
    width: "33.33%",
    paddingVertical: spacing.sm,
    gap: 2,
  },
  gridLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
  },
  gridValue: {
    fontFamily: font.displayBold,
    fontSize: 20,
    color: colors.ink,
    marginTop: 2,
  },
  gridUnit: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
  },
  gridDelta: {
    fontFamily: font.mono,
    fontSize: 11,
    marginTop: 2,
  },
  deltaHint: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    textAlign: "center",
  },
  formCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionH: {
    fontFamily: font.displayBold,
    fontSize: 18,
    color: colors.ink,
  },
  formGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  formCell: { width: "48%", gap: 4 },
  formLabel: {
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
  historyCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 4,
  },
  historyRow: {
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: 2,
  },
  historyDate: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.2,
  },
  historyText: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 19,
  },
  err: { color: colors.coral, fontFamily: font.body, fontSize: 13 },
});
