import { useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, radius, spacing } from "@/lib/theme";

interface Action {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  tint?: string;
}

/**
 * Floating quick-log button that expands into a vertical stack of
 * shortcut actions (scan plate, add water, log weight, etc.). Meant to
 * live in the bottom-right of any tab that benefits from fast logging.
 *
 * Uses the simple Animated API rather than reanimated — the animation
 * is one prop (opacity+translateY) so a spring here would be overkill.
 */
export function QuickLogFab({ actions }: { actions: Action[] }) {
  const [open, setOpen] = useState(false);
  const [anim] = useState(new Animated.Value(0));

  const toggle = () => {
    const next = !open;
    setOpen(next);
    Animated.timing(anim, {
      toValue: next ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  return (
    <>
      {open && (
        <Pressable style={styles.scrim} onPress={toggle} pointerEvents="auto" />
      )}
      <View style={styles.stack} pointerEvents="box-none">
        {actions.map((a, i) => {
          const translateY = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [12, 0],
          });
          const opacity = anim;
          return (
            <Animated.View
              key={a.key}
              style={{
                opacity,
                transform: [{ translateY }],
                marginBottom: spacing.sm,
              }}
              pointerEvents={open ? "auto" : "none"}
            >
              <Pressable
                onPress={() => {
                  toggle();
                  requestAnimationFrame(a.onPress);
                }}
                style={styles.actionRow}
              >
                <Text style={styles.actionLabel}>{a.label}</Text>
                <View
                  style={[
                    styles.actionIcon,
                    { backgroundColor: a.tint ?? colors.panel },
                  ]}
                >
                  <Ionicons name={a.icon} size={20} color={colors.bg} />
                </View>
              </Pressable>
            </Animated.View>
          );
        })}

        <Pressable onPress={toggle} style={styles.fab}>
          <Animated.View
            style={{
              transform: [
                {
                  rotate: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0deg", "45deg"],
                  }),
                },
              ],
            }}
          >
            <Ionicons name="add" size={30} color={colors.bg} />
          </Animated.View>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(11,13,11,0.55)",
  },
  stack: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.xl,
    alignItems: "flex-end",
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.gold,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  actionLabel: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
});
