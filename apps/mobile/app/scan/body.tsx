import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { BackButton } from "@/components/BackButton";
import { apiUpload } from "@/lib/api";
import { colors, font, radius, spacing } from "@/lib/theme";
import type { BodyProjection, BodyScanResponse, BodyScanResult } from "@/types";

type Phase = "idle" | "analyzing" | "result";
type Pose = "front" | "side" | "back";

export default function BodyScan() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [err, setErr] = useState("");
  const [pose, setPose] = useState<Pose>("front");
  const [result, setResult] = useState<BodyScanResult | null>(null);
  const [projection, setProjection] = useState<BodyProjection | null>(null);

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
      [{ resize: { width: 1024 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
    );
    setPhase("analyzing");
    try {
      const body = await apiUpload<BodyScanResponse>(
        "/api/scan/body",
        "image",
        { uri: resized.uri, mimeType: "image/jpeg", fileName: "body.jpg" },
        { pose }
      );
      setResult(body.result);
      setProjection(body.projection);
      setPhase("result");
    } catch (e) {
      setErr((e as Error).message || "Couldn't analyze the photo.");
      setPhase("idle");
    }
  };

  const reset = () => {
    setPhase("idle");
    setResult(null);
    setProjection(null);
    setErr("");
  };

  const footer =
    phase === "result" && result ? (
      <>
        <Btn label="Scan again" variant="ghost" onPress={reset} />
      </>
    ) : undefined;

  return (
    <Screen footer={footer}>
      <View style={styles.head}>
        <BackButton />
      </View>
      <Text style={styles.kicker}>BODY SCAN</Text>
      <Text style={styles.h1}>An honest read.</Text>
      <Text style={styles.sub}>
        A photo can&apos;t beat a DEXA scan — we won&apos;t pretend it can.
        You get a body-fat range and an estimate of weeks to your goal at
        your current pace.
      </Text>

      <View style={styles.privacy}>
        <Text style={styles.privacyTag}>PRIVACY</Text>
        <Text style={styles.privacyText}>
          Your photo is processed in memory and discarded after analysis.
          We do not store body-composition photos.
        </Text>
      </View>

      {phase === "idle" && (
        <>
          <Text style={styles.label}>POSE</Text>
          <View style={styles.chipRow}>
            {(["front", "side", "back"] as Pose[]).map((p) => (
              <Pressable
                key={p}
                onPress={() => setPose(p)}
                style={[styles.chip, pose === p && styles.chipOn]}
              >
                <Text style={[styles.chipText, pose === p && styles.chipTextOn]}>
                  {p}
                </Text>
              </Pressable>
            ))}
          </View>

          <Btn label={`Take ${pose} photo`} onPress={() => pickAndAnalyze("camera")} />
          <Btn label="Pick from library" variant="ghost" onPress={() => pickAndAnalyze("library")} />
          <Text style={styles.sub}>
            Tight-fitting clothing, neutral lighting, full-body frame. Loose
            shirts hide the waist and widen the range.
          </Text>
          {!!err && <Text style={styles.err}>{err}</Text>}
        </>
      )}

      {phase === "analyzing" && (
        <View style={styles.uploadCard}>
          <Text style={styles.busy}>Reading your physique…</Text>
          <Text style={styles.sub}>The photo will be discarded after this call.</Text>
        </View>
      )}

      {phase === "result" && result && (
        <Result result={result} projection={projection} onReset={reset} />
      )}
    </Screen>
  );
}

function Result({
  result,
  projection,
  onReset,
}: {
  result: BodyScanResult;
  projection: BodyProjection | null;
  onReset: () => void;
}) {
  if (!result.usable) {
    return (
      <View style={styles.uploadCard}>
        <Text style={styles.h2}>Couldn{"’"}t make an honest call.</Text>
        <Text style={styles.sub}>{result.notes}</Text>
        {result.visible_issues.map((i, idx) => (
          <Text key={idx} style={styles.bullet}>· {i}</Text>
        ))}
        <Btn label="Try again" onPress={onReset} />
      </View>
    );
  }

  const mid = (result.body_fat_pct_low + result.body_fat_pct_high) / 2;

  return (
    <>
      <View style={styles.bigCard}>
        <Text style={styles.kicker}>ESTIMATED BODY FAT</Text>
        <View style={styles.bigRow}>
          <Text style={styles.bigNum}>{r1(result.body_fat_pct_low)}</Text>
          <Text style={styles.bigDash}>–</Text>
          <Text style={styles.bigNum}>{r1(result.body_fat_pct_high)}</Text>
          <Text style={styles.bigUnit}> %</Text>
        </View>
        <Text style={styles.sub}>
          Visual muscle level: <Text style={styles.bodyStrong}>{result.visual_muscle_level.replace("_", " ")}</Text>
        </Text>
      </View>

      {projection && (
        <ProjectionCard p={projection} mid={mid} />
      )}

      {result.visible_issues.length > 0 && (
        <View style={[styles.bigCard, { backgroundColor: colors.panel2 }]}>
          <Text style={styles.kicker}>FACTORS WIDENING THE RANGE</Text>
          {result.visible_issues.map((i, idx) => (
            <Text key={idx} style={styles.bullet}>· {i}</Text>
          ))}
        </View>
      )}

      {!!result.notes && (
        <View style={[styles.bigCard, { backgroundColor: colors.panel2 }]}>
          <Text style={styles.kicker}>NOTES</Text>
          <Text style={styles.body}>{result.notes}</Text>
        </View>
      )}

      <View style={[styles.bigCard, { backgroundColor: colors.panel2 }]}>
        <Text style={styles.kicker}>REALITY CHECK</Text>
        <Text style={styles.body}>
          A photo can&apos;t beat hydrostatic weighing or a DEXA scan. The honest
          range above accounts for what we can&apos;t see. Use the trend over weeks,
          not any single estimate, as your signal.
        </Text>
      </View>
    </>
  );
}

function ProjectionCard({ p, mid }: { p: BodyProjection; mid: number }) {
  if (p.status === "in_target") {
    return (
      <View style={styles.bigCard}>
        <Text style={[styles.kicker, { color: colors.mint }]}>YOU{"’"}RE IN YOUR TARGET BAND</Text>
        <Text style={styles.body}>
          Your estimate overlaps your target ({p.target_bf_pct_low}–{p.target_bf_pct_high}%).
          Holding here is the work.
        </Text>
        <Text style={styles.sub}>Lean mass at midpoint ({r1(mid)}%): {p.lean_mass_kg_estimate} kg.</Text>
      </View>
    );
  }
  if (p.status === "below_target") {
    return (
      <View style={styles.bigCard}>
        <Text style={[styles.kicker, { color: colors.coral }]}>BELOW YOUR TARGET BAND</Text>
        <Text style={styles.body}>
          You&apos;re leaner than the band for your goal. Consider switching to maintain or bulk.
        </Text>
      </View>
    );
  }
  if (p.status === "not_applicable" || !p.weeks_to_goal) {
    return (
      <View style={styles.bigCard}>
        <Text style={[styles.kicker, { color: colors.gold }]}>PROJECTION NOT APPLICABLE</Text>
        <Text style={styles.body}>
          Your current goal doesn&apos;t involve fat loss.
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.bigCard}>
      <Text style={[styles.kicker, { color: colors.mint }]}>WEEKS TO TARGET BAND</Text>
      <View style={styles.bigRow}>
        <Text style={styles.bigNum}>{p.weeks_to_goal.weeks_low}</Text>
        <Text style={styles.bigDash}>–</Text>
        <Text style={styles.bigNum}>{p.weeks_to_goal.weeks_high}</Text>
        <Text style={styles.bigUnit}> weeks</Text>
      </View>
      <Text style={styles.sub}>
        At your current goal rate, to reach the top of your target band ({p.target_bf_pct_high}%).
        Assumes loss is mostly fat — real life is messier.
      </Text>
    </View>
  );
}

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

const styles = StyleSheet.create({
  head: { marginTop: spacing.sm },
  kicker: { fontFamily: font.mono, fontSize: 11, color: colors.gold, letterSpacing: 1.4 },
  h1: { fontFamily: font.displayBold, fontSize: 28, color: colors.ink },
  h2: { fontFamily: font.displayBold, fontSize: 18, color: colors.ink },
  sub: { fontFamily: font.body, fontSize: 14, color: colors.dim, lineHeight: 21 },
  body: { fontFamily: font.body, fontSize: 14, color: colors.ink, lineHeight: 21 },
  bodyStrong: { color: colors.ink, fontFamily: font.bodyBold, textTransform: "capitalize" },
  bullet: { fontFamily: font.body, fontSize: 13, color: colors.dim, lineHeight: 20, marginTop: 2 },
  label: { fontFamily: font.mono, fontSize: 10, color: colors.dim, letterSpacing: 1.2 },
  privacy: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  privacyTag: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.2,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  privacyText: { fontFamily: font.body, fontSize: 12, color: colors.dim, flex: 1, lineHeight: 18 },
  chipRow: { flexDirection: "row", gap: spacing.xs },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
  },
  chipOn: { borderColor: colors.gold, backgroundColor: "rgba(246,183,60,0.10)" },
  chipText: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.ink,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  chipTextOn: { color: colors.gold },
  uploadCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  busy: { fontFamily: font.displayBold, fontSize: 16, color: colors.ink },
  bigCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  bigRow: { flexDirection: "row", alignItems: "baseline" },
  bigNum: { fontFamily: font.displayBold, fontSize: 36, color: colors.gold },
  bigDash: { color: colors.dim, marginHorizontal: 6, fontSize: 24 },
  bigUnit: { color: colors.dim, fontFamily: font.body, fontSize: 14 },
  err: { color: colors.coral, fontFamily: font.body, fontSize: 13 },
});
