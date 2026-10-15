import { useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Btn } from "@/components/Btn";
import { Wordmark } from "@/components/Wordmark";
import { DeviceFrame } from "@/components/DeviceFrame";
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * Pre-auth landing. Four full-screen cards swipable horizontally.
 * Cards 1-3 pitch the product with a device-framed screenshot; card 4
 * is the sign in / create account CTA. Only unauthenticated users see
 * this — the (tabs) auth gate routes signed-in users straight to home.
 *
 * Visuals: real screenshots can be dropped into
 * apps/mobile/assets/landing/ as landing-{home,plate,coach}.png and
 * require()'d here. Until then, the DeviceFrame renders a placeholder
 * built from existing UI primitives so the layout still reads correct
 * end-to-end.
 */

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

type Card = {
  key: string;
  headlineKey: string;
  subheadKey: string;
  render: () => React.ReactElement;
};

export default function Landing() {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  const cards: Card[] = [
    {
      key: "ranges",
      headlineKey: "landing.card1_h",
      subheadKey: "landing.card1_sub",
      render: () => <FeatureCard screenshot={null} placeholder={<PlaceholderRanges />} />,
    },
    {
      key: "gulf",
      headlineKey: "landing.card2_h",
      subheadKey: "landing.card2_sub",
      render: () => <FeatureCard screenshot={null} placeholder={<PlaceholderGulf />} />,
    },
    {
      key: "coach",
      headlineKey: "landing.card3_h",
      subheadKey: "landing.card3_sub",
      render: () => <FeatureCard screenshot={null} placeholder={<PlaceholderCoach />} />,
    },
    {
      key: "cta",
      headlineKey: "landing.card4_h",
      subheadKey: "landing.card4_sub",
      render: () => <CtaCard />,
    },
  ];

  const isLast = index === cards.length - 1;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (i !== index) setIndex(i);
  };

  const next = () => {
    if (isLast) return;
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  };

  return (
    <View style={styles.root}>
      <FlatList
        ref={listRef}
        data={cards}
        keyExtractor={(c) => c.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.visualWrap}>{item.render()}</View>
            {item.key !== "cta" && (
              <View style={styles.textWrap}>
                <Text style={styles.headline}>{t(item.headlineKey)}</Text>
                <Text style={styles.subhead}>{t(item.subheadKey)}</Text>
              </View>
            )}
          </View>
        )}
      />

      <View style={styles.bottom}>
        <View style={styles.dots}>
          {cards.map((c, i) => (
            <View
              key={c.key}
              style={[styles.dot, i === index && styles.dotActive]}
            />
          ))}
        </View>

        {isLast ? (
          <View style={styles.ctaRow}>
            <Btn
              label={t("landing.create_account")}
              onPress={() =>
                router.push({ pathname: "/login", params: { mode: "signup" } })
              }
            />
            <Pressable
              onPress={() => router.push("/login")}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && { opacity: 0.75 },
              ]}
            >
              <Text style={styles.secondaryBtnText}>{t("landing.sign_in")}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.nextRow}>
            <Pressable onPress={() => router.push("/login")}>
              <Text style={styles.skip}>{t("landing.skip")}</Text>
            </Pressable>
            <Pressable
              onPress={next}
              style={({ pressed }) => [
                styles.nextBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.nextBtnText}>{t("landing.next")}</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.ink} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * Feature card: single centered DeviceFrame holding a screenshot (or
 * the fallback placeholder passed in). The frame width is derived from
 * screen width — a bit under 60% so the headline below has breathing
 * room without the device looking cramped.
 */
function FeatureCard({
  screenshot,
  placeholder,
}: {
  screenshot: ImageSourcePropType | null;
  placeholder: React.ReactElement;
}) {
  const frameWidth = Math.min(SCREEN_W * 0.58, 260);
  return (
    <View style={styles.featureCardInner}>
      <DeviceFrame source={screenshot} width={frameWidth}>
        {placeholder}
      </DeviceFrame>
    </View>
  );
}

/**
 * CTA card: wordmark + headline + subhead. Buttons live in the fixed
 * bottom bar (same place as Next on earlier cards) so pagination feels
 * consistent.
 */
function CtaCard() {
  const { t } = useTranslation();
  return (
    <View style={styles.ctaInner}>
      <Wordmark size={56} />
      <View style={{ gap: spacing.sm, alignItems: "center" }}>
        <Text style={styles.ctaHeadline}>{t("landing.card4_h")}</Text>
        <Text style={styles.ctaSubhead}>{t("landing.card4_sub")}</Text>
      </View>
    </View>
  );
}

// ─── Placeholder screens inside the device frame ──────────────────────
// These render inside the DeviceFrame's "screen" area when no real
// screenshot is dropped in yet. They reuse SE7A's own colors + fonts so
// the preview reads as the actual app, not a Figma mock.

function PlaceholderRanges() {
  return (
    <View style={placeholderStyles.phoneRoot}>
      <View style={placeholderStyles.statusBarSpacer} />
      <Text style={placeholderStyles.phoneMono}>TODAY</Text>
      <Text style={placeholderStyles.phoneBigRange}>540–680</Text>
      <Text style={placeholderStyles.phoneMonoSmall}>KCAL · REMAINING</Text>
      <View style={placeholderStyles.phoneMacroStrip}>
        <View style={placeholderStyles.phoneMacro}>
          <Text style={placeholderStyles.phoneMacroLabel}>P</Text>
          <Text style={placeholderStyles.phoneMacroVal}>32–38</Text>
        </View>
        <View style={placeholderStyles.phoneMacro}>
          <Text style={placeholderStyles.phoneMacroLabel}>C</Text>
          <Text style={placeholderStyles.phoneMacroVal}>65–82</Text>
        </View>
        <View style={placeholderStyles.phoneMacro}>
          <Text style={placeholderStyles.phoneMacroLabel}>F</Text>
          <Text style={placeholderStyles.phoneMacroVal}>18–24</Text>
        </View>
      </View>
    </View>
  );
}

function PlaceholderGulf() {
  const dishes = [
    { ar: "مكبوس", en: "Machboos", range: "520–640" },
    { ar: "شاورما", en: "Shawarma", range: "420–510" },
    { ar: "كرك", en: "Karak", range: "95–130" },
    { ar: "كنافة", en: "Kunafa", range: "380–470" },
  ];
  return (
    <View style={placeholderStyles.phoneRoot}>
      <View style={placeholderStyles.statusBarSpacer} />
      <Text style={placeholderStyles.phoneMono}>MENU</Text>
      <View style={{ gap: 8, width: "100%" }}>
        {dishes.map((d) => (
          <View key={d.en} style={placeholderStyles.dishLine}>
            <View>
              <Text style={placeholderStyles.dishName}>{d.ar}</Text>
              <Text style={placeholderStyles.dishEn}>{d.en}</Text>
            </View>
            <Text style={placeholderStyles.dishKcal}>{d.range}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PlaceholderCoach() {
  return (
    <View style={placeholderStyles.phoneRoot}>
      <View style={placeholderStyles.statusBarSpacer} />
      <Text style={placeholderStyles.phoneMono}>COACH</Text>
      <View style={placeholderStyles.coachList}>
        <View style={[placeholderStyles.bubble, placeholderStyles.bubbleUser]}>
          <Text style={placeholderStyles.bubbleText}>شو أفضل عشا؟</Text>
        </View>
        <View style={[placeholderStyles.bubble, placeholderStyles.bubbleCoach]}>
          <Text style={placeholderStyles.bubbleText}>
            مع ٤٢٠ سعرة متبقية، شاورما دجاج + سلطة.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  card: {
    width: SCREEN_W,
    height: SCREEN_H,
    paddingTop: SCREEN_H * 0.06,
    paddingBottom: SCREEN_H * 0.28,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  visualWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  featureCardInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    width: "100%",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.lg,
  },
  headline: {
    fontFamily: font.displayBold,
    fontSize: 30,
    color: colors.ink,
    textAlign: "center",
    lineHeight: 36,
  },
  subhead: {
    fontFamily: font.body,
    fontSize: 15,
    color: colors.dim,
    textAlign: "center",
    lineHeight: 22,
  },
  ctaInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  ctaHeadline: {
    fontFamily: font.displayBold,
    fontSize: 36,
    color: colors.ink,
    textAlign: "center",
  },
  ctaSubhead: {
    fontFamily: font.body,
    fontSize: 15,
    color: colors.dim,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 300,
  },
  bottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: spacing.xl + spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.lg,
    backgroundColor: colors.bg,
  },
  dots: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
  },
  dotActive: {
    width: 24,
    backgroundColor: colors.gold,
  },
  nextRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  skip: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.gold,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
  },
  nextBtnText: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: colors.ink,
    letterSpacing: 0.3,
  },
  ctaRow: {
    gap: spacing.sm,
  },
  secondaryBtn: {
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  secondaryBtnText: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: colors.gold,
    letterSpacing: 0.3,
  },
});

const placeholderStyles = StyleSheet.create({
  phoneRoot: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    gap: 10,
    alignItems: "center",
  },
  statusBarSpacer: {
    height: 20,
  },
  phoneMono: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.dim,
    letterSpacing: 1.6,
    alignSelf: "flex-start",
  },
  phoneMonoSmall: {
    fontFamily: font.mono,
    fontSize: 8,
    color: colors.dim,
    letterSpacing: 1.4,
  },
  phoneBigRange: {
    fontFamily: font.displayBold,
    fontSize: 38,
    color: colors.gold,
    letterSpacing: -0.5,
  },
  phoneMacroStrip: {
    flexDirection: "row",
    gap: 6,
    width: "100%",
    paddingHorizontal: 2,
    marginTop: 6,
  },
  phoneMacro: {
    flex: 1,
    backgroundColor: colors.panel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 8,
    alignItems: "center",
    gap: 2,
  },
  phoneMacroLabel: {
    fontFamily: font.mono,
    fontSize: 9,
    color: colors.dim,
    letterSpacing: 1,
  },
  phoneMacroVal: {
    fontFamily: font.displayBold,
    fontSize: 12,
    color: colors.ink,
  },
  dishLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  dishName: {
    fontFamily: font.displayBold,
    fontSize: 15,
    color: colors.ink,
  },
  dishEn: {
    fontFamily: font.mono,
    fontSize: 8,
    color: colors.dim,
    letterSpacing: 1,
    marginTop: 1,
  },
  dishKcal: {
    fontFamily: font.displayBold,
    fontSize: 13,
    color: colors.gold,
  },
  coachList: {
    gap: 8,
    width: "100%",
    marginTop: 4,
  },
  bubble: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    maxWidth: "90%",
  },
  bubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: colors.gold,
  },
  bubbleCoach: {
    alignSelf: "flex-start",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
  },
  bubbleText: {
    fontFamily: font.body,
    fontSize: 11,
    color: colors.ink,
    lineHeight: 14,
  },
});
