import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { BackButton } from "@/components/BackButton";
import {
  apiUpload,
  ProRequiredError,
  RateLimitedError,
  rateLimitMessage,
} from "@/lib/api";
import { colors, font, radius, spacing } from "@/lib/theme";
import type { BodyProjection, BodyScanResponse, BodyScanResult } from "@/types";

type Phase = "idle" | "analyzing" | "result";
type Pose = "front" | "side" | "back";

export default function BodyScan() {
  const { t } = useTranslation();
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
      Alert.alert(t("scan.common.permission_denied"), t("scan.common.permission_denied_body"));
      return;
    }
    const r =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ quality: 0.9 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
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
      if (e instanceof ProRequiredError) {
        router.push({
          pathname: "/paywall",
          params: { feature: "body_scan" },
        });
        setPhase("idle");
        return;
      }
      if (e instanceof RateLimitedError) {
        const { title, body } = rateLimitMessage(e);
        Alert.alert(title, body);
        setPhase("idle");
        return;
      }
      setErr((e as Error).message || t("scan.body.couldnt_analyze"));
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
        <Btn label={t("scan.body.scan_again")} variant="ghost" onPress={reset} />
      </>
    ) : undefined;

  return (
    <Screen footer={footer}>
      <View style={styles.head}>
        <BackButton />
      </View>
      <Text style={styles.kicker}>{t("scan.body.kicker")}</Text>
      <Text style={styles.h1}>{t("scan.body.title")}</Text>
      <Text style={styles.sub}>
        {t("scan.body.sub")}
      </Text>

      <View style={styles.privacy}>
        <Text style={styles.privacyTag}>{t("scan.body.privacy_tag")}</Text>
        <Text style={styles.privacyText}>
          {t("scan.body.privacy_text")}
        </Text>
      </View>

      {phase === "idle" && (
        <>
          <Text style={styles.label}>{t("scan.body.pose_label")}</Text>
          <View style={styles.chipRow}>
            {(["front", "side", "back"] as Pose[]).map((p) => (
              <Pressable
                key={p}
                onPress={() => setPose(p)}
                style={[styles.chip, pose === p && styles.chipOn]}
              >
                <Text style={[styles.chipText, pose === p && styles.chipTextOn]}>
                  {t(`scan.body.pose_${p}`)}
                </Text>
              </Pressable>
            ))}
          </View>

          <Btn label={t("scan.body.take_pose", { pose: t(`scan.body.pose_${pose}`) })} onPress={() => pickAndAnalyze("camera")} />
          <Btn label={t("scan.common.pick_from_library")} variant="ghost" onPress={() => pickAndAnalyze("library")} />
          <Text style={styles.sub}>
            {t("scan.body.advice")}
          </Text>
          {!!err && <Text style={styles.err}>{err}</Text>}
        </>
      )}

      {phase === "analyzing" && (
        <View style={styles.uploadCard}>
          <Text style={styles.busy}>{t("scan.body.reading")}</Text>
          <Text style={styles.sub}>{t("scan.body.reading_sub")}</Text>
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
  const { t } = useTranslation();
  if (!result.usable) {
    return (
      <View style={styles.uploadCard}>
        <Text style={styles.h2}>{t("scan.body.unusable_title")}</Text>
        <Text style={styles.sub}>{result.notes}</Text>
        {result.visible_issues.map((i, idx) => (
          <Text key={idx} style={styles.bullet}>· {i}</Text>
        ))}
        <Btn label={t("scan.body.try_again")} onPress={onReset} />
      </View>
    );
  }

  const mid = (result.body_fat_pct_low + result.body_fat_pct_high) / 2;

  return (
    <>
      <View style={styles.bigCard}>
        <Text style={styles.kicker}>{t("scan.body.estimated_bf")}</Text>
        <View style={styles.bigRow}>
          <Text style={styles.bigNum}>{r1(result.body_fat_pct_low)}</Text>
          <Text style={styles.bigDash}>–</Text>
          <Text style={styles.bigNum}>{r1(result.body_fat_pct_high)}</Text>
          <Text style={styles.bigUnit}> %</Text>
        </View>
        <Text style={styles.sub}>
          {t("scan.body.visual_muscle")} <Text style={styles.bodyStrong}>{result.visual_muscle_level.replace("_", " ")}</Text>
        </Text>
      </View>

      {projection && (
        <ProjectionCard p={projection} mid={mid} />
      )}

      {result.visible_issues.length > 0 && (
        <View style={[styles.bigCard, { backgroundColor: colors.panel2 }]}>
          <Text style={styles.kicker}>{t("scan.body.widening_factors")}</Text>
          {result.visible_issues.map((i, idx) => (
            <Text key={idx} style={styles.bullet}>· {i}</Text>
          ))}
        </View>
      )}

      {!!result.notes && (
        <View style={[styles.bigCard, { backgroundColor: colors.panel2 }]}>
          <Text style={styles.kicker}>{t("scan.body.notes_kicker")}</Text>
          <Text style={styles.body}>{result.notes}</Text>
        </View>
      )}

      <View style={[styles.bigCard, { backgroundColor: colors.panel2 }]}>
        <Text style={styles.kicker}>{t("scan.body.reality_check_kicker")}</Text>
        <Text style={styles.body}>
          {t("scan.body.reality_check_body")}
        </Text>
      </View>
    </>
  );
}

function ProjectionCard({ p, mid }: { p: BodyProjection; mid: number }) {
  const { t } = useTranslation();
  if (p.status === "in_target") {
    return (
      <View style={styles.bigCard}>
        <Text style={[styles.kicker, { color: colors.mint }]}>{t("scan.body.in_target_kicker")}</Text>
        <Text style={styles.body}>
          {t("scan.body.in_target_body", { low: p.target_bf_pct_low, high: p.target_bf_pct_high })}
        </Text>
        <Text style={styles.sub}>{t("scan.body.lean_mass", { mid: r1(mid), kg: p.lean_mass_kg_estimate })}</Text>
      </View>
    );
  }
  if (p.status === "below_target") {
    return (
      <View style={styles.bigCard}>
        <Text style={[styles.kicker, { color: colors.coral }]}>{t("scan.body.below_target_kicker")}</Text>
        <Text style={styles.body}>
          {t("scan.body.below_target_body")}
        </Text>
      </View>
    );
  }
  if (p.status === "not_applicable" || !p.weeks_to_goal) {
    return (
      <View style={styles.bigCard}>
        <Text style={[styles.kicker, { color: colors.gold }]}>{t("scan.body.not_applicable_kicker")}</Text>
        <Text style={styles.body}>
          {t("scan.body.not_applicable_body")}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.bigCard}>
      <Text style={[styles.kicker, { color: colors.mint }]}>{t("scan.body.weeks_kicker")}</Text>
      <View style={styles.bigRow}>
        <Text style={styles.bigNum}>{p.weeks_to_goal.weeks_low}</Text>
        <Text style={styles.bigDash}>–</Text>
        <Text style={styles.bigNum}>{p.weeks_to_goal.weeks_high}</Text>
        <Text style={styles.bigUnit}> {t("scan.body.weeks_unit")}</Text>
      </View>
      <Text style={styles.sub}>
        {t("scan.body.weeks_body", { pct: p.target_bf_pct_high })}
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
