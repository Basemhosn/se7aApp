import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { BackButton } from "@/components/BackButton";
import { ConfidencePill } from "@/components/Pill";
import { api, RateLimitedError, rateLimitMessage } from "@/lib/api";
import { markDayDirty, pushOptimisticLogItems } from "@/lib/calendarCache";
import { colors, font, radius, spacing } from "@/lib/theme";
import type { MealSlot } from "@/types";
import { SLOTS, slotForNow } from "@/lib/slot";

interface NormalizedProduct {
  code: string;
  name: string;
  brand: string | null;
  image_url: string | null;
  serving_size_g: number | null;
  per_100g: {
    kcal: number;
    protein_g: number;
    carb_g: number;
    fat_g: number;
  };
  confidence: "low" | "medium" | "high";
}

interface LookupResponse {
  product: NormalizedProduct;
  source: "cache" | "off";
}

type Phase = "scanning" | "looking-up" | "review" | "saving";

export default function BarcodeScan() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>("scanning");
  const [product, setProduct] = useState<NormalizedProduct | null>(null);
  const [portionG, setPortionG] = useState<string>("");
  const [slot, setSlot] = useState<MealSlot>(slotForNow());
  const [err, setErr] = useState("");
  const lastCodeRef = useRef<string | null>(null);
  const lastScanAtRef = useRef<number>(0);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const lookup = useCallback(
    async (code: string) => {
      setPhase("looking-up");
      setErr("");
      try {
        const res = await api<LookupResponse>(`/api/barcode/lookup?code=${code}`);
        setProduct(res.product);
        setPortionG(String(res.product.serving_size_g ?? 100));
        setPhase("review");
      } catch (e) {
        if (e instanceof RateLimitedError) {
          const { title, body } = rateLimitMessage(e);
          Alert.alert(title, body);
          setPhase("scanning");
          lastCodeRef.current = null;
          return;
        }
        const msg = (e as Error).message;
        setErr(msg || (isArabic ? "لم يُعثر عليه" : "Couldn't find that barcode."));
        setPhase("scanning");
        lastCodeRef.current = null;
      }
    },
    [isArabic]
  );

  const onScanned = (result: BarcodeScanningResult) => {
    if (phase !== "scanning") return;
    const code = result.data.trim();
    if (!/^\d{6,14}$/.test(code)) return;
    // Debounce identical rescans within 2s.
    const now = Date.now();
    if (lastCodeRef.current === code && now - lastScanAtRef.current < 2000) {
      return;
    }
    lastCodeRef.current = code;
    lastScanAtRef.current = now;
    lookup(code);
  };

  const scaleRange = (mid: number) => {
    const spread = 0.1;
    return {
      low: Math.max(0, Math.round(mid * (1 - spread))),
      high: Math.max(0, Math.round(mid * (1 + spread))),
    };
  };
  const scaleRangeF = (mid: number) => {
    const spread = 0.1;
    const round1 = (x: number) => Math.round(x * 10) / 10;
    return {
      low: Math.max(0, round1(mid * (1 - spread))),
      high: Math.max(0, round1(mid * (1 + spread))),
    };
  };

  const portionNum = Number(portionG) || 0;
  const factor = portionNum / 100;
  const macros = product
    ? (() => {
        const k = scaleRange(product.per_100g.kcal * factor);
        const p = scaleRangeF(product.per_100g.protein_g * factor);
        const c = scaleRangeF(product.per_100g.carb_g * factor);
        const f = scaleRangeF(product.per_100g.fat_g * factor);
        return {
          kcal_low: k.low,
          kcal_high: k.high,
          protein_g_low: p.low,
          protein_g_high: p.high,
          carb_g_low: c.low,
          carb_g_high: c.high,
          fat_g_low: f.low,
          fat_g_high: f.high,
        };
      })()
    : null;

  const save = async () => {
    if (!product || !macros || portionNum <= 0) return;
    setPhase("saving");
    setErr("");
    const name = product.brand
      ? `${product.brand} · ${product.name}`
      : product.name;
    const item = {
      name,
      portion_estimate: `${portionNum} g`,
      kcal_low: macros.kcal_low,
      kcal_high: macros.kcal_high,
      protein_g_low: macros.protein_g_low,
      protein_g_high: macros.protein_g_high,
      carb_g_low: macros.carb_g_low,
      carb_g_high: macros.carb_g_high,
      fat_g_low: macros.fat_g_low,
      fat_g_high: macros.fat_g_high,
      confidence: product.confidence,
    };
    try {
      await api("/api/ledger/add", {
        method: "POST",
        body: JSON.stringify({
          source: "barcode",
          meal_slot: slot,
          items: [item],
        }),
      });
      markDayDirty();
      pushOptimisticLogItems([
        { ...item, source: "barcode", meal_slot: slot },
      ]);
      router.replace("/");
    } catch (e) {
      setErr((e as Error).message || "Couldn't log — try again.");
      setPhase("review");
    }
  };

  const rescan = () => {
    setProduct(null);
    setErr("");
    lastCodeRef.current = null;
    setPhase("scanning");
  };

  if (!permission) {
    return (
      <Screen>
        <View style={styles.head}>
          <BackButton />
        </View>
        <ActivityIndicator color={colors.gold} />
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <View style={styles.head}>
          <BackButton />
        </View>
        <Text style={styles.kicker}>
          {isArabic ? "الباركود" : "BARCODE"}
        </Text>
        <Text style={styles.h1}>
          {isArabic ? "نحتاج إذن الكاميرا" : "We need camera access"}
        </Text>
        <Text style={styles.sub}>
          {isArabic
            ? "لمسح باركود الأطعمة المعلبة."
            : "So you can scan packaged food barcodes."}
        </Text>
        <Btn
          label={isArabic ? "منح الإذن" : "Grant access"}
          onPress={requestPermission}
        />
      </Screen>
    );
  }

  if (phase === "scanning" || phase === "looking-up") {
    return (
      <Screen>
        <View style={styles.head}>
          <BackButton />
        </View>
        <Text style={styles.kicker}>
          {isArabic ? "الباركود" : "BARCODE"}
        </Text>
        <Text style={styles.h1}>
          {isArabic ? "امسح المنتج" : "Scan the product"}
        </Text>
        <Text style={styles.sub}>
          {isArabic
            ? "وجّه الكاميرا نحو الباركود — سنبحث عنه تلقائياً."
            : "Point at the barcode — we'll look it up automatically."}
        </Text>

        <View style={styles.cameraWrap}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: [
                "ean13",
                "ean8",
                "upc_a",
                "upc_e",
                "code128",
                "code39",
              ],
            }}
            onBarcodeScanned={phase === "scanning" ? onScanned : undefined}
          />
          <View style={styles.reticle} pointerEvents="none" />
          {phase === "looking-up" && (
            <View style={styles.lookupOverlay}>
              <ActivityIndicator color={colors.gold} />
              <Text style={styles.lookupText}>
                {isArabic ? "جارٍ البحث…" : "Looking it up…"}
              </Text>
            </View>
          )}
        </View>

        {!!err && (
          <View style={styles.errCard}>
            <Text style={styles.err}>{err}</Text>
            <Text style={styles.errHint}>
              {isArabic
                ? "جرّب زاوية أخرى، أو أضفه يدوياً من تبويب السجل."
                : "Try a different angle, or add it manually from the Log tab."}
            </Text>
          </View>
        )}
      </Screen>
    );
  }

  // review / saving
  return (
    <Screen>
      <View style={styles.head}>
        <BackButton />
      </View>

      {product && (
        <>
          <View style={styles.productHead}>
            {product.image_url ? (
              <Image
                source={{ uri: product.image_url }}
                style={styles.productImg}
              />
            ) : (
              <View style={[styles.productImg, styles.productImgPlaceholder]}>
                <Text style={styles.productImgLetter}>
                  {product.name.slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              {product.brand && (
                <Text style={styles.brand}>{product.brand.toUpperCase()}</Text>
              )}
              <Text style={styles.productName}>{product.name}</Text>
              <View style={{ marginTop: 6, flexDirection: "row" }}>
                <ConfidencePill level={product.confidence} />
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionH}>
              {isArabic ? "الحصة" : "Portion"}
            </Text>
            <Text style={styles.sectionSub}>
              {isArabic
                ? "كم غراماً أكلت؟"
                : "How many grams did you eat?"}
            </Text>
            <View style={styles.portionRow}>
              <TextInput
                value={portionG}
                onChangeText={setPortionG}
                keyboardType="number-pad"
                style={styles.portionInput}
                placeholder="100"
                placeholderTextColor={colors.dim}
              />
              <Text style={styles.portionUnit}>g</Text>
            </View>
            <View style={styles.portionChips}>
              {[50, 100, 150, 200].map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setPortionG(String(n))}
                  style={[
                    styles.portionChip,
                    portionNum === n && styles.portionChipOn,
                  ]}
                >
                  <Text
                    style={[
                      styles.portionChipText,
                      portionNum === n && styles.portionChipTextOn,
                    ]}
                  >
                    {n}g
                  </Text>
                </Pressable>
              ))}
              {product.serving_size_g && product.serving_size_g !== 100 && (
                <Pressable
                  onPress={() =>
                    setPortionG(String(product.serving_size_g ?? 100))
                  }
                  style={[
                    styles.portionChip,
                    portionNum === product.serving_size_g &&
                      styles.portionChipOn,
                  ]}
                >
                  <Text
                    style={[
                      styles.portionChipText,
                      portionNum === product.serving_size_g &&
                        styles.portionChipTextOn,
                    ]}
                  >
                    {isArabic ? "الحصة" : "serving"} ({product.serving_size_g}g)
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          {macros && (
            <View style={styles.macroCard}>
              <Text style={styles.macroKicker}>
                {isArabic ? "لكل حصتك" : "FOR YOUR PORTION"}
              </Text>
              <Text style={styles.macroKcal}>
                {macros.kcal_low}–{macros.kcal_high}
                <Text style={styles.macroKcalUnit}> kcal</Text>
              </Text>
              <Text style={styles.macroMacros}>
                P {macros.protein_g_low}–{macros.protein_g_high} · C{" "}
                {macros.carb_g_low}–{macros.carb_g_high} · F{" "}
                {macros.fat_g_low}–{macros.fat_g_high}
              </Text>
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
                <Text
                  style={[styles.chipText, slot === s && styles.chipTextOn]}
                >
                  {t(`common.meal_slot.${s}`)}
                </Text>
              </Pressable>
            ))}
          </View>

          {!!err && <Text style={styles.err}>{err}</Text>}

          <Btn
            label={
              phase === "saving"
                ? isArabic
                  ? "جارٍ الحفظ…"
                  : "Saving…"
                : isArabic
                  ? "سجّل هذا"
                  : "Log this"
            }
            onPress={save}
            loading={phase === "saving"}
            disabled={portionNum <= 0}
          />
          <Btn
            label={isArabic ? "مسح آخر" : "Scan another"}
            variant="ghost"
            onPress={rescan}
            disabled={phase === "saving"}
          />
        </>
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
  h1: { fontFamily: font.displayBold, fontSize: 28, color: colors.ink },
  sub: { fontFamily: font.body, fontSize: 14, color: colors.dim, lineHeight: 21 },
  cameraWrap: {
    aspectRatio: 3 / 4,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#000",
    position: "relative",
  },
  camera: { flex: 1 },
  reticle: {
    position: "absolute",
    left: "10%",
    right: "10%",
    top: "35%",
    height: "30%",
    borderWidth: 2,
    borderColor: colors.gold,
    borderRadius: radius.md,
    backgroundColor: "transparent",
  },
  lookupOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  lookupText: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.ink,
    letterSpacing: 1.2,
  },
  errCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.coral,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  err: { color: colors.coral, fontFamily: font.body, fontSize: 13 },
  errHint: { fontFamily: font.mono, fontSize: 11, color: colors.dim },
  productHead: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
  },
  productImg: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
  },
  productImgPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  productImgLetter: {
    fontFamily: font.displayBold,
    fontSize: 28,
    color: colors.dim,
  },
  brand: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  productName: {
    fontFamily: font.displayBold,
    fontSize: 20,
    color: colors.ink,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  sectionH: {
    fontFamily: font.displayBold,
    fontSize: 16,
    color: colors.ink,
  },
  sectionSub: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
  },
  portionRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  portionInput: {
    flex: 1,
    fontFamily: font.displayBold,
    fontSize: 32,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 4,
  },
  portionUnit: {
    fontFamily: font.mono,
    fontSize: 16,
    color: colors.dim,
  },
  portionChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  portionChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
  },
  portionChipOn: {
    borderColor: colors.gold,
    backgroundColor: "rgba(246,183,60,0.10)",
  },
  portionChipText: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.ink,
  },
  portionChipTextOn: { color: colors.gold },
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
    fontSize: 26,
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
});
