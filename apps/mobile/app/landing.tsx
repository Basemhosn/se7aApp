import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Btn } from "@/components/Btn";
import { DeviceFrame } from "@/components/DeviceFrame";
import { font, radius, spacing } from "@/lib/theme";

/**
 * Hero-style landing modeled on the SE7A web marketing site + the
 * reference the designer pulled: three angled phones layered in the
 * middle, floating callout chips around them, big headline below,
 * fixed CTA bar at the bottom. Warm cream background to let the phone
 * screens pop.
 *
 * Signed-in users never see this — the (tabs) auth gate routes them
 * straight to home.
 *
 * Placeholder screens render inside each DeviceFrame today. Drop real
 * screenshots into apps/mobile/assets/landing/ and swap the three
 * `screenshot={null}` lines below.
 */

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// Warm palette — intentionally lives here, not in theme.ts. The rest of
// the app is dark-first; this is the one place we go light to echo the
// reference. Keep local so it can't accidentally bleed into other screens.
const LANDING = {
  bg: "#f6ecd4",
  bgAccent: "#efe1c1",
  ink: "#1a1d1a",
  dim: "#5a6054",
  gold: "#f6b73c",
  cardBg: "#ffffff",
  cardShadow: "rgba(26,29,26,0.08)",
  chipGreen: "#5dcaa5",
  chipCoral: "#f08f72",
};

const CENTER_PHONE_W = Math.min(SCREEN_W * 0.46, 200);
const SIDE_PHONE_W = Math.min(SCREEN_W * 0.36, 155);

export default function Landing() {
  const { t } = useTranslation();

  return (
    <View style={styles.root}>
      {/* Soft background wash — a radial-ish lighter patch behind the
          phones so the stacked group feels anchored on a stage rather
          than floating on a flat color. */}
      <View style={styles.bgWash} />

      <View style={styles.hero}>
        {/* Left phone — tilted back, slightly behind. Log tab: shows a
            lived-in meal history so new users see "this is what you'll
            fill up". */}
        <View style={[styles.phoneSlot, styles.phoneLeft]}>
          <DeviceFrame
            source={require("../assets/landing/landing-log.png")}
            width={SIDE_PHONE_W}
          >
            <PlaceholderGulf />
          </DeviceFrame>
        </View>

        {/* Right phone — tilted forward, slightly behind. Progress tab:
            trend chart = "you'll see yourself change". */}
        <View style={[styles.phoneSlot, styles.phoneRight]}>
          <DeviceFrame
            source={require("../assets/landing/landing-progress.png")}
            width={SIDE_PHONE_W}
          >
            <PlaceholderCoach />
          </DeviceFrame>
        </View>

        {/* Center phone — upright, front. Home dashboard = the hero
            moment of clarity, matches /screens/home.png in the web
            marketing hero. */}
        <View style={[styles.phoneSlot, styles.phoneCenter]}>
          <DeviceFrame
            source={require("../assets/landing/landing-home.png")}
            width={CENTER_PHONE_W}
          >
            <PlaceholderRanges />
          </DeviceFrame>
        </View>

        {/* Floating callout chips — positioned absolutely around the
            phone stack. Keep them in the GAPS between phones and the
            screen edges so no chip ever occludes screenshot content. */}
        <View style={[styles.chip, styles.chipTopLeft]}>
          <Text style={styles.chipLabel}>540 kcal</Text>
        </View>
        <View style={[styles.chip, styles.chipTopRight, { backgroundColor: LANDING.chipGreen }]}>
          <Text style={[styles.chipLabel, { color: LANDING.ink }]}>honest ranges</Text>
        </View>
        <View style={[styles.chip, styles.chipBotLeft, { backgroundColor: LANDING.chipCoral }]}>
          <Text style={[styles.chipLabel, { color: LANDING.ink }]}>Gulf-aware</Text>
        </View>
        <View style={[styles.chip, styles.chipBotRight, { backgroundColor: LANDING.gold }]}>
          <Text style={[styles.chipLabel, { color: LANDING.ink }]}>AI coach</Text>
        </View>
      </View>

      <View style={styles.copyBlock}>
        <Text style={styles.wordmark}>
          SE<Text style={styles.wordmark7}>7</Text>A
        </Text>
        <Text style={styles.headline}>{t("landing.hero_h")}</Text>
        <Text style={styles.subhead}>{t("landing.hero_sub")}</Text>
      </View>

      <View style={styles.ctaBar}>
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
            pressed && { opacity: 0.6 },
          ]}
        >
          <Text style={styles.secondaryBtnText}>{t("landing.sign_in")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Placeholder screens inside the device frames ─────────────────────
// Mini renders of real SE7A UI language. These will swap out as soon as
// real screenshots land in apps/mobile/assets/landing/ and the
// require() paths are wired up.

function PlaceholderRanges() {
  return (
    <View style={placeholderStyles.root}>
      <View style={placeholderStyles.statusBar} />
      <Text style={placeholderStyles.mono}>TODAY</Text>
      <Text style={placeholderStyles.bigRange}>540{"–"}680</Text>
      <Text style={placeholderStyles.monoSmall}>KCAL · REMAINING</Text>
      <View style={placeholderStyles.macroRow}>
        {["P 32–38", "C 65–82", "F 18–24"].map((m) => (
          <View key={m} style={placeholderStyles.macroPill}>
            <Text style={placeholderStyles.macroText}>{m}</Text>
          </View>
        ))}
      </View>
      <View style={placeholderStyles.mealCard}>
        <Text style={placeholderStyles.mealTitle}>Lunch · Machboos</Text>
        <Text style={placeholderStyles.mealKcal}>540{"–"}680 kcal</Text>
      </View>
    </View>
  );
}

function PlaceholderGulf() {
  const dishes = [
    { ar: "مكبوس", range: "520–640" },
    { ar: "شاورما", range: "420–510" },
    { ar: "كرك", range: "95–130" },
    { ar: "كنافة", range: "380–470" },
  ];
  return (
    <View style={placeholderStyles.root}>
      <View style={placeholderStyles.statusBar} />
      <Text style={placeholderStyles.mono}>MENU</Text>
      {dishes.map((d) => (
        <View key={d.ar} style={placeholderStyles.dishLine}>
          <Text style={placeholderStyles.dishName}>{d.ar}</Text>
          <Text style={placeholderStyles.dishKcal}>{d.range}</Text>
        </View>
      ))}
    </View>
  );
}

function PlaceholderCoach() {
  return (
    <View style={placeholderStyles.root}>
      <View style={placeholderStyles.statusBar} />
      <Text style={placeholderStyles.mono}>COACH</Text>
      <View style={placeholderStyles.coachList}>
        <View style={[placeholderStyles.bubble, placeholderStyles.bubbleUser]}>
          <Text style={placeholderStyles.bubbleText}>شو أفضل عشا؟</Text>
        </View>
        <View style={[placeholderStyles.bubble, placeholderStyles.bubbleCoach]}>
          <Text style={placeholderStyles.bubbleText}>
            ٤٢٠ سعرة متبقية — شاورما دجاج + سلطة.
          </Text>
        </View>
        <View style={[placeholderStyles.bubble, placeholderStyles.bubbleUser]}>
          <Text style={placeholderStyles.bubbleText}>شكرا!</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: LANDING.bg,
  },
  bgWash: {
    position: "absolute",
    top: SCREEN_H * 0.05,
    left: 0,
    right: 0,
    height: SCREEN_H * 0.55,
    backgroundColor: LANDING.bgAccent,
    borderBottomLeftRadius: SCREEN_W,
    borderBottomRightRadius: SCREEN_W,
    opacity: 0.65,
  },
  hero: {
    height: SCREEN_H * 0.5,
    marginTop: SCREEN_H * 0.04,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  phoneSlot: {
    position: "absolute",
  },
  phoneCenter: {
    zIndex: 3,
  },
  phoneLeft: {
    left: SCREEN_W * 0.02,
    zIndex: 1,
    transform: [{ rotate: "-8deg" }, { translateY: 32 }],
  },
  phoneRight: {
    right: SCREEN_W * 0.02,
    zIndex: 2,
    transform: [{ rotate: "8deg" }, { translateY: 32 }],
  },
  chip: {
    position: "absolute",
    backgroundColor: LANDING.cardBg,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    shadowColor: LANDING.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 5,
  },
  // Chips float in the corner-regions outside the central phone stack
  // so they never overlap screenshot content, only the cream background.
  chipTopLeft: {
    top: -4,
    left: SCREEN_W * 0.04,
  },
  chipTopRight: {
    top: -4,
    right: SCREEN_W * 0.04,
  },
  chipBotLeft: {
    bottom: 8,
    left: SCREEN_W * 0.04,
  },
  chipBotRight: {
    bottom: 8,
    right: SCREEN_W * 0.04,
  },
  chipLabel: {
    fontFamily: font.bodyBold,
    fontSize: 12,
    color: LANDING.ink,
    letterSpacing: 0.2,
  },
  copyBlock: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  wordmark: {
    fontFamily: font.displayBold,
    fontSize: 22,
    color: LANDING.ink,
    letterSpacing: 1.5,
  },
  wordmark7: {
    color: LANDING.gold,
  },
  headline: {
    fontFamily: font.displayBold,
    fontSize: 30,
    color: LANDING.ink,
    textAlign: "center",
    lineHeight: 36,
    marginTop: spacing.xs,
  },
  subhead: {
    fontFamily: font.body,
    fontSize: 14,
    color: LANDING.dim,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 320,
  },
  ctaBar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl + spacing.md,
    paddingTop: spacing.md,
    gap: spacing.xs,
    backgroundColor: LANDING.bg,
  },
  secondaryBtn: {
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  secondaryBtnText: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    color: LANDING.ink,
    letterSpacing: 0.3,
    textDecorationLine: "underline",
  },
});

const placeholderStyles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 10,
    paddingTop: 8,
    gap: 6,
    alignItems: "center",
  },
  statusBar: {
    height: 16,
  },
  mono: {
    fontFamily: font.mono,
    fontSize: 8,
    color: "#8a937f",
    letterSpacing: 1.5,
    alignSelf: "flex-start",
  },
  monoSmall: {
    fontFamily: font.mono,
    fontSize: 7,
    color: "#8a937f",
    letterSpacing: 1.3,
  },
  bigRange: {
    fontFamily: font.displayBold,
    fontSize: 30,
    color: "#f6b73c",
    letterSpacing: -0.5,
  },
  macroRow: {
    flexDirection: "row",
    gap: 4,
    width: "100%",
    marginTop: 4,
  },
  macroPill: {
    flex: 1,
    backgroundColor: "#121512",
    borderRadius: 6,
    paddingVertical: 4,
    alignItems: "center",
  },
  macroText: {
    fontFamily: font.mono,
    fontSize: 7,
    color: "#eef2e9",
  },
  mealCard: {
    backgroundColor: "#121512",
    borderWidth: 1,
    borderColor: "#242a22",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    width: "100%",
    marginTop: 6,
  },
  mealTitle: {
    fontFamily: font.bodyBold,
    fontSize: 9,
    color: "#eef2e9",
  },
  mealKcal: {
    fontFamily: font.mono,
    fontSize: 8,
    color: "#f6b73c",
    marginTop: 1,
  },
  dishLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#121512",
    borderWidth: 1,
    borderColor: "#242a22",
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
    width: "100%",
  },
  dishName: {
    fontFamily: font.displayBold,
    fontSize: 11,
    color: "#eef2e9",
  },
  dishKcal: {
    fontFamily: font.mono,
    fontSize: 9,
    color: "#f6b73c",
  },
  coachList: {
    gap: 5,
    width: "100%",
    marginTop: 2,
  },
  bubble: {
    paddingVertical: 5,
    paddingHorizontal: 7,
    borderRadius: 8,
    maxWidth: "88%",
  },
  bubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: "#f6b73c",
  },
  bubbleCoach: {
    alignSelf: "flex-start",
    backgroundColor: "#121512",
    borderWidth: 1,
    borderColor: "#242a22",
  },
  bubbleText: {
    fontFamily: font.body,
    fontSize: 8,
    color: "#1a1d1a",
    lineHeight: 11,
  },
});
