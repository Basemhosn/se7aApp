import { useCallback, useEffect, useState } from "react";
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
import type { PurchasesOffering, PurchasesPackage } from "@/lib/rc";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { BackButton } from "@/components/BackButton";
import { useEntitlement } from "@/lib/EntitlementContext";
import {
  fetchOffering,
  hasProEntitlement,
  purchasePackage,
  restorePurchases,
} from "@/lib/rc";
import { colors, font, radius, spacing } from "@/lib/theme";

type PackageKey = "annual" | "monthly";

export default function Paywall() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const { feature } = useLocalSearchParams<{ feature?: string }>();
  const { optimisticProFromRc, refresh } = useEntitlement();
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [selected, setSelected] = useState<PackageKey>("annual");
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const off = await fetchOffering();
    setOffering(off);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const annualPkg =
    offering?.availablePackages.find((p) =>
      p.product.identifier.toLowerCase().includes("annual")
    ) ??
    offering?.availablePackages.find(
      (p) => p.packageType === "ANNUAL"
    ) ??
    null;

  const monthlyPkg =
    offering?.availablePackages.find((p) =>
      p.product.identifier.toLowerCase().includes("monthly")
    ) ??
    offering?.availablePackages.find(
      (p) => p.packageType === "MONTHLY"
    ) ??
    null;

  const activePkg: PurchasesPackage | null =
    selected === "annual" ? annualPkg : monthlyPkg;

  const subscribe = async () => {
    if (!activePkg) return;
    setPurchasing(true);
    setErr("");
    const res = await purchasePackage(activePkg);
    setPurchasing(false);
    if (res.cancelled) return;
    if (res.info === null) {
      setErr(
        res.error ||
          (isArabic ? "تعذّر الاشتراك — حاول مجدداً." : "Couldn't subscribe — try again.")
      );
      return;
    }
    await optimisticProFromRc();
    router.back();
  };

  const restore = async () => {
    setRestoring(true);
    setErr("");
    const info = await restorePurchases();
    setRestoring(false);
    if (hasProEntitlement(info)) {
      await refresh();
      Alert.alert(
        isArabic ? "تم الاسترجاع" : "Restored",
        isArabic ? "أنت الآن على Pro." : "You're on Pro now."
      );
      router.back();
    } else {
      Alert.alert(
        isArabic ? "لا شيء لاسترجاعه" : "Nothing to restore",
        isArabic
          ? "لم نجد اشتراكاً نشطاً لحسابك."
          : "We couldn't find an active subscription for your account."
      );
    }
  };

  return (
    <Screen>
      <View style={styles.head}>
        <BackButton />
      </View>

      <Text style={styles.kicker}>SE7A · PRO</Text>
      <Text style={styles.h1}>
        {isArabic ? "خذها للمستوى التالي." : "Take it up a level."}
      </Text>
      <Text style={styles.sub}>
        {isArabic
          ? "خطط أسبوعية، مسح القوائم، تحليل الجسم، وكوتش الذكاء الاصطناعي."
          : "Meal plans, menu scans, body composition, and AI coach chat."}
      </Text>

      {feature && (
        <View style={styles.featureCard}>
          <Text style={styles.featureLabel}>
            {isArabic ? "متطلب لهذه الميزة" : "REQUIRED FOR"}
          </Text>
          <Text style={styles.featureName}>{featureLabel(feature, isArabic)}</Text>
        </View>
      )}

      <View style={styles.benefitCard}>
        {BENEFITS(isArabic).map((b) => (
          <View key={b.title} style={styles.benefitRow}>
            <Text style={styles.benefitCheck}>✓</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.benefitTitle}>{b.title}</Text>
              <Text style={styles.benefitBody}>{b.body}</Text>
            </View>
          </View>
        ))}
      </View>

      {loading ? (
        <View style={{ paddingVertical: spacing.xl, alignItems: "center" }}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : !offering ? (
        <View style={styles.errCard}>
          <Text style={styles.err}>
            {isArabic
              ? "الاشتراك غير متاح حالياً — أعد المحاولة لاحقاً."
              : "Subscriptions aren't available right now — try again later."}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.pkgRow}>
            <PkgCard
              on={selected === "annual"}
              onPress={() => setSelected("annual")}
              badge={isArabic ? "الأفضل قيمة" : "BEST VALUE"}
              titleTop={isArabic ? "سنوي" : "Annual"}
              price={annualPkg?.product.priceString ?? "—"}
              subPeriod={isArabic ? "سنة" : "year"}
              note={
                annualPkg && monthlyPkg
                  ? isArabic
                    ? computeYearlySavingsAr(annualPkg, monthlyPkg)
                    : computeYearlySavingsEn(annualPkg, monthlyPkg)
                  : null
              }
            />
            <PkgCard
              on={selected === "monthly"}
              onPress={() => setSelected("monthly")}
              titleTop={isArabic ? "شهري" : "Monthly"}
              price={monthlyPkg?.product.priceString ?? "—"}
              subPeriod={isArabic ? "شهر" : "month"}
              note={null}
            />
          </View>

          {!!err && <Text style={styles.err}>{err}</Text>}

          <Btn
            label={
              purchasing
                ? isArabic
                  ? "جارٍ…"
                  : "Working…"
                : isArabic
                  ? "اشترك الآن"
                  : "Subscribe"
            }
            onPress={subscribe}
            loading={purchasing}
            disabled={!activePkg}
          />
          <Btn
            label={
              restoring
                ? isArabic
                  ? "جارٍ الاسترجاع…"
                  : "Restoring…"
                : isArabic
                  ? "استرجع الاشتراك"
                  : "Restore purchases"
            }
            variant="ghost"
            onPress={restore}
            loading={restoring}
          />

          <Text style={styles.legal}>
            {isArabic
              ? "الاشتراك يتجدد تلقائياً حتى تلغيه من إعدادات Apple ID. يمكنك الإلغاء في أي وقت."
              : "Subscription auto-renews until cancelled in your Apple ID settings. Cancel any time."}
          </Text>
        </>
      )}
    </Screen>
  );
}

function PkgCard({
  on,
  onPress,
  titleTop,
  price,
  subPeriod,
  badge,
  note,
}: {
  on: boolean;
  onPress: () => void;
  titleTop: string;
  price: string;
  subPeriod: string;
  badge?: string;
  note: string | null;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pkgCard, on && styles.pkgCardOn]}
    >
      {badge && (
        <View style={[styles.badge, on && styles.badgeOn]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
      <Text style={[styles.pkgTitle, on && styles.pkgTitleOn]}>{titleTop}</Text>
      <Text style={[styles.pkgPrice, on && styles.pkgPriceOn]}>{price}</Text>
      <Text style={styles.pkgPeriod}>/ {subPeriod}</Text>
      {note && <Text style={styles.pkgNote}>{note}</Text>}
    </Pressable>
  );
}

function BENEFITS(isArabic: boolean) {
  return [
    {
      title: isArabic ? "خطط وجبات أسبوعية" : "Weekly meal plans",
      body: isArabic
        ? "خطة ٧ أيام تصيب ماكروك، مع قائمة تسوق تلقائية."
        : "A 7-day plan that hits your macros, with an auto shopping list.",
    },
    {
      title: isArabic ? "مسح قوائم المطاعم" : "Menu scans",
      body: isArabic
        ? "التقط قائمة المطعم — نرتب الأطباق حسب ما تبقى لك."
        : "Snap a restaurant menu — dishes ranked by what fits your day.",
    },
    {
      title: isArabic ? "تحليل تكوين الجسم" : "Body composition scans",
      body: isArabic
        ? "تقدير نسبة الدهون + وقت الوصول للهدف. الصور لا تُخزن."
        : "Body-fat range + weeks-to-goal. Photos never stored.",
    },
    {
      title: isArabic ? "كوتش SE7A بالذكاء الاصطناعي" : "AI coach chat",
      body: isArabic
        ? "دردشة مع كوتش يعرف سجلك وأهدافك."
        : "Chat with a coach that knows your logs and goals.",
    },
    {
      title: isArabic ? "مسح غير محدود" : "Unlimited scans",
      body: isArabic
        ? "بدلاً من ٥ يومياً في الخطة المجانية."
        : "Up from 5 a day on Free — snap as much as you want.",
    },
    {
      title: isArabic ? "كل برامج التمرين" : "All workout programs",
      body: isArabic
        ? "PPL، الشد المنزلي، تحمّل، Full Body، وأكثر."
        : "PPL, home cutting, endurance, full body, and more.",
    },
  ];
}

function featureLabel(feature: string, isArabic: boolean): string {
  const map: Record<string, [string, string]> = {
    meal_plan: ["Weekly meal plan", "خطة الأسبوع"],
    menu_scan: ["Menu scan", "مسح القائمة"],
    body_scan: ["Body composition scan", "تحليل تكوين الجسم"],
    ai_coach: ["AI coach", "كوتش الذكاء الاصطناعي"],
  };
  const pair = map[feature];
  if (!pair) return feature;
  return isArabic ? pair[1] : pair[0];
}

function computeYearlySavingsEn(
  annual: PurchasesPackage,
  monthly: PurchasesPackage
): string {
  const yr = annual.product.price;
  const mo = monthly.product.price;
  if (!yr || !mo) return "";
  const pct = Math.round((1 - yr / (mo * 12)) * 100);
  return pct > 0 ? `Save ${pct}% vs monthly` : "";
}

function computeYearlySavingsAr(
  annual: PurchasesPackage,
  monthly: PurchasesPackage
): string {
  const yr = annual.product.price;
  const mo = monthly.product.price;
  if (!yr || !mo) return "";
  const pct = Math.round((1 - yr / (mo * 12)) * 100);
  return pct > 0 ? `وفّر ${pct}٪ عن الشهري` : "";
}

const styles = StyleSheet.create({
  head: { marginTop: spacing.sm },
  kicker: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  h1: { fontFamily: font.displayBold, fontSize: 32, color: colors.ink },
  sub: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
    lineHeight: 21,
  },
  featureCard: {
    backgroundColor: "rgba(246,183,60,0.06)",
    borderWidth: 1,
    borderColor: colors.goldDim,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  featureLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  featureName: {
    fontFamily: font.displayBold,
    fontSize: 16,
    color: colors.ink,
  },
  benefitCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  benefitRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  benefitCheck: {
    fontFamily: font.displayBold,
    fontSize: 16,
    color: colors.gold,
    width: 18,
  },
  benefitTitle: {
    fontFamily: font.displayBold,
    fontSize: 15,
    color: colors.ink,
  },
  benefitBody: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    lineHeight: 19,
    marginTop: 2,
  },
  pkgRow: { flexDirection: "row", gap: spacing.sm },
  pkgCard: {
    flex: 1,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 2,
    alignItems: "center",
    position: "relative",
  },
  pkgCardOn: {
    borderColor: colors.gold,
    backgroundColor: "rgba(246,183,60,0.08)",
  },
  badge: {
    position: "absolute",
    top: -10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  badgeOn: {
    borderColor: colors.gold,
    backgroundColor: colors.gold,
  },
  badgeText: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.bg,
    letterSpacing: 1.2,
  },
  pkgTitle: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.4,
    marginTop: 6,
  },
  pkgTitleOn: { color: colors.gold },
  pkgPrice: {
    fontFamily: font.displayBold,
    fontSize: 26,
    color: colors.ink,
    marginTop: 4,
  },
  pkgPriceOn: { color: colors.ink },
  pkgPeriod: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
  },
  pkgNote: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.mint,
    letterSpacing: 0.8,
    marginTop: 4,
    textAlign: "center",
  },
  errCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.coral,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  err: { color: colors.coral, fontFamily: font.body, fontSize: 13 },
  legal: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    lineHeight: 15,
    textAlign: "center",
  },
});
