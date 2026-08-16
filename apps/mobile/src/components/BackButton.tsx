import { Pressable, StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, spacing } from "@/lib/theme";

/**
 * Explicit back button for any screen pushed over the tab bar
 * (scan/*, calendar, workout, fasting, manual-meal, onboarding).
 * Falls back to '/' if there's nothing to go back to.
 */
export function BackButton({ label = "Back" }: { label?: string }) {
  return (
    <Pressable
      onPress={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/");
      }}
      hitSlop={12}
      style={styles.btn}
    >
      <Ionicons name="chevron-back" size={22} color={colors.ink} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginLeft: -6, // pull the chevron flush with content edge
  },
  label: {
    fontFamily: font.body,
    fontSize: 15,
    color: colors.ink,
  },
});
