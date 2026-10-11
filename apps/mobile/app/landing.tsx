import { useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
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
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * Pre-auth landing. Four full-screen cards swipable horizontally.
 * Cards 1-3 pitch the product; card 4 is the sign in / create account
 * CTA. Only unauthenticated users see this — the (tabs) auth gate
 * routes signed-in users straight to home.
 *
 * Design intentionally mimics the Yazio/Lifesum intro pattern: short
 * value prop per card, visual anchor, pagination dots, Next button
 * that turns into Get started on the final card.
 */

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

type Card = {
  key: string;
  headlineKey: string;
  subheadKey: string;
  visual: () => React.ReactElement;
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
      visual: VisualRanges,
    },
    {
      key: "gulf",
      headlineKey: "landing.card2_h",
      subheadKey: "landing.card2_sub",
      visual: VisualGulf,
    },
    {
      key: "coach",
      headlineKey: "landing.card3_h",
      subheadKey: "landing.card3_sub",
      visual: VisualCoach,
    },
    {
      key: "cta",
      headlineKey: "landing.card4_h",
      subheadKey: "landing.card4_sub",
      visual: VisualCTA,
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
            <View style={styles.visualWrap}>{item.visual()}</View>
            <View style={styles.textWrap}>
              <Text style={styles.headline}>{t(item.headlineKey)}</Text>
              <Text style={styles.subhead}>{t(item.subheadKey)}</Text>
            </View>
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
              onPress={() => router.push({ pathname: "/login", params: { mode: "signup" } })}
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

// ─── Visuals ──────────────────────────────────────────────────────────
// Placeholder styled containers; swap for real screenshots/illustrations
// post-launch for a visual polish pass.

function VisualRanges() {
  return (
    <View style={visualStyles.plateCard}>
      <Text style={visualStyles.plateEmoji}>🍽️</Text>
      <View style={visualStyles.plateRow}>
        <Text style={visualStyles.plateLabel}>MACHBOOS WITH LAMB</Text>
        <Text style={visualStyles.plateRange}>540–680 kcal</Text>
      </View>
      <View style={visualStyles.macroRow}>
        <View style={visualStyles.macroPill}>
          <Text style={visualStyles.macroText}>P 32–38g</Text>
        </View>
        <View style={visualStyles.macroPill}>
          <Text style={visualStyles.macroText}>C 65–82g</Text>
        </View>
        <View style={visualStyles.macroPill}>
          <Text style={visualStyles.macroText}>F 18–24g</Text>
        </View>
      </View>
    </View>
  );
}

function VisualGulf() {
  return (
    <View style={visualStyles.gulfWrap}>
      <View style={visualStyles.dishRow}>
        <Text style={visualStyles.dishEmoji}>🥘</Text>
        <Text style={visualStyles.dishName}>مكبوس</Text>
      </View>
      <View style={visualStyles.dishRow}>
        <Text style={visualStyles.dishEmoji}>🌯</Text>
        <Text style={visualStyles.dishName}>شاورما</Text>
      </View>
      <View style={visualStyles.dishRow}>
        <Text style={visualStyles.dishEmoji}>☕</Text>
        <Text style={visualStyles.dishName}>كرك</Text>
      </View>
      <View style={visualStyles.dishRow}>
        <Text style={visualStyles.dishEmoji}>🍯</Text>
        <Text style={visualStyles.dishName}>كنافة</Text>
      </View>
    </View>
  );
}

function VisualCoach() {
  return (
    <View style={visualStyles.coachWrap}>
      <View style={[visualStyles.bubble, visualStyles.bubbleUser]}>
        <Text style={visualStyles.bubbleText}>شو أفضل عشا بميزانيتي؟</Text>
      </View>
      <View style={[visualStyles.bubble, visualStyles.bubbleCoach]}>
        <Text style={visualStyles.bubbleText}>
          مع 420 سعرة متبقية، جرّب شاورما دجاج + سلطة. يترك لك هامش للعشا.
        </Text>
      </View>
    </View>
  );
}

function VisualCTA() {
  return (
    <View style={visualStyles.ctaVisual}>
      <Wordmark size={48} />
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
    paddingTop: SCREEN_H * 0.08,
    paddingBottom: SCREEN_H * 0.3,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "space-between",
  },
  visualWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  textWrap: {
    width: "100%",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  headline: {
    fontFamily: font.displayBold,
    fontSize: 32,
    color: colors.ink,
    textAlign: "center",
    lineHeight: 38,
  },
  subhead: {
    fontFamily: font.body,
    fontSize: 15,
    color: colors.dim,
    textAlign: "center",
    lineHeight: 22,
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
    width: 20,
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

const visualStyles = StyleSheet.create({
  plateCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: "100%",
    gap: spacing.md,
    alignItems: "center",
  },
  plateEmoji: {
    fontSize: 72,
  },
  plateRow: {
    alignItems: "center",
    gap: spacing.xs,
  },
  plateLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.4,
  },
  plateRange: {
    fontFamily: font.displayBold,
    fontSize: 28,
    color: colors.gold,
  },
  macroRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  macroPill: {
    backgroundColor: colors.panel2,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  macroText: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.ink,
    letterSpacing: 0.6,
  },
  gulfWrap: {
    gap: spacing.md,
    width: "100%",
  },
  dishRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  dishEmoji: {
    fontSize: 32,
  },
  dishName: {
    fontFamily: font.displayBold,
    fontSize: 22,
    color: colors.ink,
  },
  coachWrap: {
    gap: spacing.sm,
    width: "100%",
  },
  bubble: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    maxWidth: "85%",
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
    fontSize: 15,
    color: colors.ink,
    lineHeight: 22,
  },
  ctaVisual: {
    alignItems: "center",
    gap: spacing.md,
  },
});
