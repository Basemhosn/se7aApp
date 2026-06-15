import { useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { Wordmark } from "@/components/Wordmark";
import { ConfidencePill } from "@/components/Pill";
import { apiUpload } from "@/lib/api";
import { colors, font, radius, spacing } from "@/lib/theme";
import type {
  MenuDish,
  MenuScanBudget,
  MenuScanResponse,
} from "@/types";

type Phase = "idle" | "analyzing" | "result";

export default function MenuScan() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [err, setErr] = useState("");
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [dishes, setDishes] = useState<MenuDish[]>([]);
  const [confidence, setConfidence] = useState<"low" | "medium" | "high">("medium");
  const [budget, setBudget] = useState<MenuScanBudget | null>(null);
  const [targetsKnown, setTargetsKnown] = useState(true);
  const [restaurantGuess, setRestaurantGuess] = useState<string | null>(null);

  const pickAndAnalyze = async (source: "camera" | "library") => {
    setErr("");
    const perm =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission denied", "Enable access in Settings to scan.");
      return;
    }
    const r =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ quality: 0.9 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.9,
          });
    if (r.canceled || !r.assets?.[0]) return;
    const resized = await ImageManipulator.manipulateAsync(
      r.assets[0].uri,
      [{ resize: { width: 1280 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
    );
    setPreviewUri(resized.uri);
    setPhase("analyzing");
    try {
      const body = await apiUpload<MenuScanResponse>(
        "/api/scan/menu",
        "image",
        { uri: resized.uri, mimeType: "image/jpeg", fileName: "menu.jpg" }
      );
      setDishes(body.result.dishes);
      setConfidence(body.result.confidence);
      setBudget(body.budget);
      setTargetsKnown(body.targets_known);
      setRestaurantGuess(body.result.restaurant_guess ?? null);
      setPhase("result");
    } catch (e) {
      setErr((e as Error).message || "Couldn't read the menu.");
      setPhase("idle");
    }
  };

  const reset = () => {
    setPhase("idle");
    setPreviewUri(null);
    setDishes([]);
    setBudget(null);
    setRestaurantGuess(null);
    setErr("");
  };

  const orders = dishes.filter((d) => d.verdict === "order");
  const considers = dishes.filter((d) => d.verdict === "consider");
  const skips = dishes.filter((d) => d.verdict === "skip");

  return (
    <Screen>
      <View style={styles.head}>
        <Pressable onPress={() => router.back()}>
          <Wordmark size={20} />
        </Pressable>
      </View>
      <Text style={styles.kicker}>MENU SCAN</Text>
      <Text style={styles.h1}>What should you order?</Text>
      <Text style={styles.sub}>
        Photograph the menu. SE7A reads it, checks what you have left
        for today, and ranks dishes by fit.
      </Text>

      {phase === "idle" && (
        <View style={styles.uploadCard}>
          <Btn label="Photograph the menu" onPress={() => pickAndAnalyze("camera")} />
          <View style={{ height: spacing.sm }} />
          <Btn label="Pick from library" variant="ghost" onPress={() => pickAndAnalyze("library")} />
          {previewUri && <Image source={{ uri: previewUri }} style={styles.preview} />}
          {!!err && <Text style={styles.err}>{err}</Text>}
        </View>
      )}

      {phase === "analyzing" && (
        <View style={styles.uploadCard}>
          {previewUri && <Image source={{ uri: previewUri }} style={styles.preview} />}
          <Text style={styles.busy}>Reading the menu…</Text>
        </View>
      )}

      {phase === "result" && budget && (
        <>
          <View style={styles.budget}>
            <Text style={styles.kicker}>
              {targetsKnown ? "YOUR REMAINING BUDGET" : "USING DEFAULT BUDGET"}
            </Text>
            <Text style={styles.budgetMain}>
              {Math.round(budget.kcal_low)}–{Math.round(budget.kcal_high)} kcal
            </Text>
            <Text style={styles.budgetMacros}>
              P {Math.round(budget.protein_g_low)}–{Math.round(budget.protein_g_high)} · C {Math.round(budget.carb_g_low)}–{Math.round(budget.carb_g_high)} · F {Math.round(budget.fat_g_low)}–{Math.round(budget.fat_g_high)}
            </Text>
          </View>

          <View style={styles.metaRow}>
            {restaurantGuess && <Text style={styles.dim}>{restaurantGuess}</Text>}
            <ConfidencePill level={confidence} />
          </View>

          <Section title="Order" tint={colors.mint} dishes={orders} verdict="order" />
          <Section title="Consider" tint={colors.gold} dishes={considers} verdict="consider" />
          <Section title="Skip" tint={colors.dim} dishes={skips} verdict="skip" />

          <Btn label="Scan another" variant="ghost" onPress={reset} />
        </>
      )}
    </Screen>
  );
}

function Section({
  title,
  tint,
  dishes,
  verdict,
}: {
  title: string;
  tint: string;
  dishes: MenuDish[];
  verdict: "order" | "consider" | "skip";
}) {
  if (dishes.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[styles.sectionH, { color: tint }]}>
        {title}
        <Text style={styles.sectionCount}> {dishes.length}</Text>
      </Text>
      {dishes.map((d, i) => (
        <View
          key={i}
          style={[
            styles.dish,
            { borderLeftColor: tint, borderLeftWidth: 3 },
            verdict === "skip" && { opacity: 0.7 },
          ]}
        >
          <View style={styles.dishHead}>
            <Text style={styles.dishName}>{d.name}</Text>
            <Text style={styles.dishKcal}>
              {d.kcal_low}–{d.kcal_high} kcal
            </Text>
          </View>
          <Text style={styles.dishReason}>{d.reason}</Text>
          <Text style={styles.dishMacros}>
            P {fmt(d.protein_g_low)}–{fmt(d.protein_g_high)} · C {fmt(d.carb_g_low)}–{fmt(d.carb_g_high)} · F {fmt(d.fat_g_low)}–{fmt(d.fat_g_high)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function fmt(n: number): string {
  if (n >= 100) return String(Math.round(n));
  return String(Math.round(n * 10) / 10);
}

const styles = StyleSheet.create({
  head: { marginTop: spacing.sm },
  kicker: { fontFamily: font.mono, fontSize: 11, color: colors.gold, letterSpacing: 1.4 },
  h1: { fontFamily: font.displayBold, fontSize: 28, color: colors.ink },
  sub: { fontFamily: font.body, fontSize: 14, color: colors.dim, lineHeight: 21 },
  dim: { fontFamily: font.body, fontSize: 13, color: colors.dim },
  uploadCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  preview: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    resizeMode: "cover",
  },
  busy: { fontFamily: font.displayBold, fontSize: 16, color: colors.ink, marginTop: spacing.md },
  budget: {
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  budgetMain: { fontFamily: font.displayBold, fontSize: 22, color: colors.gold, marginTop: 4 },
  budgetMacros: { fontFamily: font.mono, fontSize: 12, color: colors.dim },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexWrap: "wrap" },
  sectionH: { fontFamily: font.displayBold, fontSize: 17 },
  sectionCount: { fontFamily: font.mono, fontSize: 12, color: colors.dim },
  dish: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  dishHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  dishName: { fontFamily: font.body, fontSize: 15, color: colors.ink, flex: 1 },
  dishKcal: { fontFamily: font.mono, fontSize: 11, color: colors.dim, marginLeft: spacing.sm },
  dishReason: { fontFamily: font.body, fontSize: 13, color: colors.ink, lineHeight: 19 },
  dishMacros: { fontFamily: font.mono, fontSize: 11, color: colors.dim, marginTop: 4 },
  err: { color: colors.coral, fontFamily: font.body, fontSize: 13 },
});
