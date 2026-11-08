import { Linking, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { RowLink, settingsStyles } from "@/components/SettingsAtoms";

/**
 * Follow us sub-screen. Three external social links — Instagram, TikTok,
 * X. No state. Each row uses the RowLink external variant which shows
 * an open-in-browser icon instead of a chevron.
 */
export default function FollowUsScreen() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === "ar";

  return (
    <Screen>
      <View style={settingsStyles.head}>
        <BackButton />
      </View>
      <Text style={settingsStyles.title}>
        {isArabic ? "تابعنا" : "Follow us"}
      </Text>
      <View style={settingsStyles.card}>
        <RowLink
          label="Instagram"
          onPress={() => Linking.openURL("https://instagram.com/se7a.app")}
          external
        />
        <RowLink
          label="TikTok"
          onPress={() => Linking.openURL("https://tiktok.com/@se7a.app")}
          external
        />
        <RowLink
          label="X"
          onPress={() => Linking.openURL("https://x.com/se7a_app")}
          external
        />
      </View>
    </Screen>
  );
}
