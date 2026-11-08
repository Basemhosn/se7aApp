import { Text, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { useAuth } from "@/auth/AuthContext";
import {
  Info,
  RowLink,
  settingsStyles,
} from "@/components/SettingsAtoms";

/**
 * Account sub-screen. Hosts the five Account rows previously inlined
 * on /settings so the main Settings page can collapse to a lean menu
 * list. State is minimal — just user.email for display; the rest are
 * navigation targets.
 */
export default function AccountScreen() {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const isArabic = i18n.language === "ar";

  return (
    <Screen>
      <View style={settingsStyles.head}>
        <BackButton />
      </View>
      <Text style={settingsStyles.title}>
        {isArabic ? "الحساب" : "Account"}
      </Text>
      <View style={settingsStyles.card}>
        <Info
          label={isArabic ? "البريد" : "Email"}
          value={user?.email ?? "—"}
        />
        <RowLink
          label={isArabic ? "تعديل الملف الشخصي" : "Edit profile"}
          onPress={() => router.push("/edit-profile" as never)}
        />
        {/*
         * 'Change goals' was removed in favor of 'Edit profile' alone.
         * Both routes touched the same macro-affecting fields (height,
         * weight, activity, goal, rate, goal weight) and the server
         * (/api/profile/edit) already recomputes macros whenever any
         * of those fields changes. Keeping two entry points was
         * confusing — users couldn't tell which was authoritative.
         */}
        <RowLink
          label={isArabic ? "عدّل أهداف التغذية" : "Edit nutrition goals"}
          onPress={() => router.push("/edit-goals" as never)}
        />
        <RowLink
          label={isArabic ? "اللغة" : "Language"}
          value={isArabic ? "العربية" : "English"}
          onPress={() => router.push("/language")}
        />
      </View>
    </Screen>
  );
}
