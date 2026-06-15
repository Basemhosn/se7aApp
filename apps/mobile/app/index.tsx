import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/auth/AuthContext";
import { colors } from "@/lib/theme";

/**
 * Auth-aware redirect. Boot lands here; depending on session, push to
 * login or dashboard. Profile-completeness check happens on dashboard.
 */
export default function Index() {
  const { loading, session } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (session) router.replace("/dashboard");
    else router.replace("/login");
  }, [loading, session]);

  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.gold} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});
