import { useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { api } from "@/lib/api";
import { useAuth } from "@/auth/AuthContext";
import { colors, font, radius, spacing } from "@/lib/theme";

const WEB_BASE = "https://se7a.vercel.app";

type Deleting = "idle" | "confirming" | "typing" | "deleting";

export default function Settings() {
  const { user, signOut } = useAuth();
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [deleting, setDeleting] = useState<Deleting>("idle");

  const openTerms = () => Linking.openURL(`${WEB_BASE}/terms`);
  const openPrivacy = () => Linking.openURL(`${WEB_BASE}/privacy`);
  const openSupport = () =>
    Linking.openURL("mailto:hello@se7a.app?subject=SE7A%20support");

  const doDelete = async () => {
    setDeleting("deleting");
    try {
      await api("/api/account/delete", { method: "POST" });
    } catch (e) {
      Alert.alert(
        isArabic ? "تعذّر الحذف" : "Delete failed",
        (e as Error).message
      );
      setDeleting("idle");
      return;
    }
    await signOut();
    router.replace("/login");
  };

  const confirmDelete = () => {
    Alert.alert(
      isArabic ? "احذف الحساب؟" : "Delete account?",
      isArabic
        ? "سيمحو هذا كل شيء — الملف الشخصي، السجلات، التمارين، الصور. لا يمكن التراجع."
        : "This erases everything — profile, logs, workouts, photos. Can't be undone.",
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: isArabic ? "احذف نهائياً" : "Delete forever",
          style: "destructive",
          onPress: doDelete,
        },
      ]
    );
  };

  return (
    <Screen>
      <View style={styles.head}>
        <BackButton />
      </View>
      <Text style={styles.title}>{isArabic ? "الإعدادات" : "Settings"}</Text>

      <Section title={isArabic ? "الحساب" : "Account"}>
        <Info label={isArabic ? "البريد" : "Email"} value={user?.email ?? "—"} />
        <RowLink
          label={t("home.change_my_plan")}
          onPress={() => router.push("/onboarding")}
        />
        <RowLink
          label={t("language.title")}
          value={isArabic ? "العربية" : "English"}
          onPress={() => router.push("/language")}
        />
      </Section>

      <Section title={isArabic ? "قانوني" : "Legal"}>
        <RowLink
          label={isArabic ? "الشروط والأحكام" : "Terms of Service"}
          onPress={openTerms}
          external
        />
        <RowLink
          label={isArabic ? "سياسة الخصوصية" : "Privacy Policy"}
          onPress={openPrivacy}
          external
        />
        <RowLink
          label={isArabic ? "الدعم" : "Support"}
          value="hello@se7a.app"
          onPress={openSupport}
          external
        />
      </Section>

      <Section title={isArabic ? "المنطقة الخطرة" : "Danger zone"} tint={colors.coral}>
        <RowLink
          label={t("common.sign_out")}
          onPress={signOut}
        />
        <Pressable
          onPress={confirmDelete}
          disabled={deleting === "deleting"}
          style={[styles.dangerBtn, deleting === "deleting" && { opacity: 0.5 }]}
        >
          <Text style={styles.dangerLabel}>
            {deleting === "deleting"
              ? isArabic
                ? "جارٍ الحذف…"
                : "Deleting…"
              : isArabic
                ? "احذف حسابي"
                : "Delete my account"}
          </Text>
        </Pressable>
      </Section>

      <Text style={styles.foot}>SE7A · v0.1.0</Text>
    </Screen>
  );
}

function Section({
  title,
  tint,
  children,
}: {
  title: string;
  tint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[styles.sectionH, tint ? { color: tint } : null]}>
        {title.toUpperCase()}
      </Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function RowLink({
  label,
  value,
  onPress,
  external,
}: {
  label: string;
  value?: string;
  onPress: () => void;
  external?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {value && <Text style={styles.rowValue}>{value}</Text>}
        <Ionicons
          name={external ? "open-outline" : "chevron-forward"}
          size={16}
          color={colors.dim}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { marginTop: spacing.sm },
  title: {
    fontFamily: font.displayBold,
    fontSize: 32,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  sectionH: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.4,
    marginTop: spacing.md,
  },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowLabel: {
    fontFamily: font.body,
    fontSize: 15,
    color: colors.ink,
  },
  rowValue: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.dim,
  },
  dangerBtn: {
    padding: spacing.md,
    alignItems: "center",
  },
  dangerLabel: {
    fontFamily: font.displayBold,
    fontSize: 15,
    color: colors.coral,
  },
  foot: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    textAlign: "center",
    marginTop: spacing.xl,
  },
});
