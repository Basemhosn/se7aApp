import { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useAuth } from "@/auth/AuthContext";
import { supabase } from "@/lib/supabase";
import { colors, font, radius, spacing } from "@/lib/theme";

type IoniconName = keyof typeof Ionicons.glyphMap;

interface Slide {
  icon: IoniconName;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    icon: "scan-outline",
    title: "Scan what you eat",
    body: "Snap a photo of any plate. SE7A returns honest calorie and macro ranges — no guessing, no fake precision.",
  },
  {
    icon: "restaurant-outline",
    title: "Scan menus before you order",
    body: "Point at any restaurant menu. SE7A ranks dishes against what you've got left for the day.",
  },
  {
    icon: "chatbubbles-outline",
    title: "Ask the coach anything",
    body: "\"Is shawarma OK tonight?\" SE7A answers using your actual logs, not generic advice.",
  },
  {
    icon: "trending-up-outline",
    title: "Track your week",
    body: "Honest ranges and consistent logs make progress visible. Unlock meal plans and body scans with Pro.",
  },
];

const { width } = Dimensions.get("window");

export default function TutorialScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const flatRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);

  const markSeenAndExit = useCallback(async () => {
    if (user?.id) {
      try {
        await supabase
          .from("profiles")
          .update({ tutorial_seen_at: new Date().toISOString() })
          .eq("user_id", user.id);
      } catch {
        // Schema-cache lag or network blip — ship them home anyway.
        // Next launch will route back here if the write failed; one
        // double-show beats trapping the user on the tutorial screen.
      }
    }
    router.replace("/");
  }, [router, user?.id]);

  const onNext = useCallback(() => {
    if (index < SLIDES.length - 1) {
      flatRef.current?.scrollToIndex({ index: index + 1, animated: true });
    } else {
      void markSeenAndExit();
    }
  }, [index, markSeenAndExit]);

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / width);
      if (i !== index) setIndex(i);
    },
    [index]
  );

  const isLast = index === SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <StatusBar style="light" />

      <View style={styles.topRow}>
        <TouchableOpacity
          onPress={() => void markSeenAndExit()}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel="Skip tutorial"
        >
          <Text style={styles.skip}>Skip</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatRef}
        data={SLIDES}
        keyExtractor={(_, i) => `slide-${i}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={styles.iconWrap}>
              <Ionicons name={item.icon} size={56} color={colors.gold} />
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === index && styles.dotActive]}
          />
        ))}
      </View>

      <View style={styles.cta}>
        <TouchableOpacity
          onPress={onNext}
          activeOpacity={0.85}
          style={styles.ctaBtn}
          accessibilityRole="button"
          accessibilityLabel={isLast ? "Get started" : "Next"}
        >
          <Text style={styles.ctaLabel}>
            {isLast ? "Get started" : "Next"}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topRow: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  skip: {
    fontFamily: font.body,
    color: colors.dim,
    fontSize: 15,
    padding: spacing.xs,
  },
  slide: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl + 8,
    flex: 1,
  },
  iconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 36,
  },
  title: {
    fontFamily: font.displayBold,
    fontSize: 28,
    lineHeight: 34,
    color: colors.ink,
    textAlign: "center",
    marginBottom: 14,
  },
  body: {
    fontFamily: font.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.dim,
    textAlign: "center",
    maxWidth: 320,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: spacing.lg,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.line,
  },
  dotActive: {
    width: 22,
    backgroundColor: colors.gold,
  },
  cta: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  ctaBtn: {
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaLabel: {
    fontFamily: font.displayBold,
    fontSize: 16,
    color: colors.bg,
  },
});
