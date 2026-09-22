import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * Body hub — unified entry point for the three body-tracking flows
 * that used to sit as separate items in Progress:
 *   • Composition — AI body scan (fat %, muscle level)
 *   • Photos      — private progress photos
 *   • Measurements — tape-measure entries (waist, hip, etc.)
 *
 * Each section is a card summarizing what the flow does with a CTA
 * that opens the corresponding detail screen. Consolidation goal:
 * "one place for body tracking" so the Progress tab doesn't feel
 * like a laundry list.
 */
export default function BodyHub() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  return (
    <Screen>
      <View style={styles.head}>
        <BackButton />
        <Text style={styles.title}>{isArabic ? "الجسم" : "Body"}</Text>
        <View style={{ width: 30 }} />
      </View>
      <Text style={styles.sub}>
        {isArabic
          ? "كل شيء يخص تتبّع جسمك في مكان واحد."
          : "Everything for tracking your body in one place."}
      </Text>

      <BodyCard
        icon="body-outline"
        kicker={isArabic ? "مسح الجسم" : "COMPOSITION"}
        title={
          isArabic
            ? "تقدير نسبة الدهون بالصورة"
            : "AI body-fat estimate from a photo"
        }
        body={
          isArabic
            ? "التقط صورة كاملة الجسم. SE7A يعطيك نطاقاً صادقاً لنسبة الدهون + إسقاط أسابيع الوصول للهدف. الصورة لا تُخزَّن."
            : "Take a full-body shot. SE7A gives you an honest body-fat range + a weeks-to-goal projection. The photo is never stored."
        }
        ctaLabel={
          isArabic ? "افتح مسح الجسم" : "Open body scan"
        }
        onCta={() => router.push("/scan/body" as never)}
      />

      <BodyCard
        icon="camera-outline"
        kicker={isArabic ? "صور التقدم" : "PHOTOS"}
        title={
          isArabic
            ? "شوف التغيير بعينك"
            : "Watch yourself change"
        }
        body={
          isArabic
            ? "صور أسبوعية أمامية / جانبية / خلفية. خاصة تماماً؛ الصور تُقارَن جنباً إلى جنب."
            : "Weekly front / side / back photos. Fully private. Side-by-side comparisons show the trend words miss."
        }
        ctaLabel={
          isArabic ? "افتح الصور" : "Open photos"
        }
        onCta={() => router.push("/progress-photos" as never)}
      />

      <BodyCard
        icon="resize-outline"
        kicker={isArabic ? "المقاسات" : "MEASUREMENTS"}
        title={
          isArabic
            ? "متر خياط للأرقام"
            : "Tape-measure tracking"
        }
        body={
          isArabic
            ? "الخصر، الورك، الذراع، الصدر، الفخذ، الرقبة. تغيرات الأسبوع + المقارنة مع أول قياس."
            : "Waist, hip, arm, chest, thigh, neck. Weekly deltas vs. your first entry."
        }
        ctaLabel={
          isArabic ? "افتح المقاسات" : "Open measurements"
        }
        onCta={() => router.push("/measurements" as never)}
      />
    </Screen>
  );
}

function BodyCard({
  icon,
  kicker,
  title,
  body,
  ctaLabel,
  onCta,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  kicker: string;
  title: string;
  body: string;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={22} color={colors.gold} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.kicker}>{kicker}</Text>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardBody}>{body}</Text>
        <Pressable
          onPress={onCta}
          hitSlop={4}
          style={styles.ctaRow}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
        >
          <Text style={styles.ctaLabel}>{ctaLabel}</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.gold} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  title: {
    fontFamily: font.displayBold,
    fontSize: 22,
    color: colors.ink,
  },
  sub: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: spacing.md,
  },
  card: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.gold + "18",
    borderWidth: 1,
    borderColor: colors.gold + "44",
    alignItems: "center",
    justifyContent: "center",
  },
  kicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  cardTitle: {
    fontFamily: font.displayBold,
    fontSize: 16,
    color: colors.ink,
    marginTop: 2,
    lineHeight: 22,
  },
  cardBody: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    lineHeight: 19,
    marginTop: 4,
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: spacing.sm,
  },
  ctaLabel: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});
