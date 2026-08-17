import { Component, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Sentry from "@sentry/react-native";
import { colors, font, radius, spacing } from "@/lib/theme";

interface State {
  error: Error | null;
}

/**
 * Last-resort UI when a render tree throws. Sends the error to Sentry,
 * then renders a small "something went wrong" fallback with a reload
 * button rather than a white screen or an iOS crash dialog.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    Sentry.captureException(error, {
      tags: { where: "ErrorBoundary" },
      extra: { componentStack: info?.componentStack ?? undefined },
    });
  }

  reload = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    const msg = this.state.error.message || "Something unexpected happened.";
    return (
      <View style={styles.wrap}>
        <View style={styles.card}>
          <Text style={styles.kicker}>SOMETHING BROKE</Text>
          <Text style={styles.h1}>SE7A hit an error.</Text>
          <Text style={styles.body}>
            The team was notified automatically. Try again — if it keeps
            happening, force-close the app and reopen.
          </Text>
          <Text style={styles.detail} numberOfLines={4}>
            {msg}
          </Text>
          <Pressable onPress={this.reload} style={styles.btn}>
            <Text style={styles.btnLabel}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    maxWidth: 400,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.coral,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 8,
  },
  kicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.coral,
    letterSpacing: 1.4,
  },
  h1: {
    fontFamily: font.displayBold,
    fontSize: 22,
    color: colors.ink,
  },
  body: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
    lineHeight: 21,
    marginTop: 4,
  },
  detail: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    marginTop: 12,
    padding: 10,
    backgroundColor: colors.panel2,
    borderRadius: radius.sm,
  },
  btn: {
    marginTop: 12,
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnLabel: {
    fontFamily: font.displayBold,
    fontSize: 15,
    color: colors.bg,
  },
});
