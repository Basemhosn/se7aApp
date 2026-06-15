import { Pressable, StyleSheet, Text, ActivityIndicator } from "react-native";
import { colors, font, radius, spacing } from "@/lib/theme";

export function Btn({
  label,
  onPress,
  loading,
  disabled,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "ghost";
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        variant === "ghost" ? styles.ghost : styles.primary,
        pressed && !isDisabled && { opacity: 0.85 },
        isDisabled && { opacity: 0.5 },
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "ghost" ? colors.ink : colors.bg}
        />
      ) : (
        <Text
          style={[
            styles.label,
            variant === "ghost" ? styles.ghostLabel : styles.primaryLabel,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  primary: { backgroundColor: colors.gold },
  ghost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.line,
  },
  label: {
    fontFamily: font.displayBold,
    fontSize: 15,
    letterSpacing: 0.5,
  },
  primaryLabel: { color: colors.bg },
  ghostLabel: { color: colors.ink },
});
