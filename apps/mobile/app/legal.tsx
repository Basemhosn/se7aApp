import { useState } from "react";
import { Alert, Linking, Share, StyleSheet, Text, View } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { track } from "@/lib/analytics";
import { RowLink, settingsStyles } from "@/components/SettingsAtoms";
import { colors, font, radius, spacing } from "@/lib/theme";

const WEB_BASE = "https://se7a.vercel.app";

/**
 * Legal sub-screen. Hosts:
 * - PDF progress report export (reports/pdf + share sheet)
 * - Full JSON data export (profile + logs + workouts + plans)
 * - Terms + Privacy + Request-a-feature + Support contact
 * - Medical safety disclaimer card
 *
 * Export state (exporting, exportingPdf) lives here; shared app auth
 * comes via supabase session for the PDF endpoint.
 */
export default function LegalScreen() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const openTerms = () => Linking.openURL(`${WEB_BASE}/terms`);
  const openPrivacy = () => Linking.openURL(`${WEB_BASE}/privacy`);
  const openSupport = () =>
    Linking.openURL("mailto:hello@se7a.app?subject=SE7A%20support");

  const doExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const bundle = await api<Record<string, unknown>>("/api/account/export");
      const json = JSON.stringify(bundle, null, 2);
      const today = new Date().toISOString().slice(0, 10);
      await Share.share({
        message: json,
        title: `SE7A data export · ${today}`,
      });
      track("data_exported", { size_kb: Math.round(json.length / 1024) });
    } catch (e) {
      Alert.alert(
        isArabic ? "تعذّر التصدير" : "Export failed",
        (e as Error).message
      );
    }
    setExporting(false);
  };

  const doPdfExport = async () => {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Not signed in");
      const base = process.env.EXPO_PUBLIC_API_BASE ?? "https://se7a.app";
      const today = new Date().toISOString().slice(0, 10);
      const target = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory}se7a-progress-${today}.pdf`;
      const res = await FileSystem.downloadAsync(
        `${base}/api/reports/pdf`,
        target,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.status !== 200) {
        throw new Error(`Server returned ${res.status}`);
      }
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(res.uri, {
          mimeType: "application/pdf",
          dialogTitle: isArabic ? "تقرير تقدّم SE7A" : "SE7A progress report",
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert(
          isArabic ? "تم الحفظ" : "Saved",
          isArabic ? `حُفظ في:\n${res.uri}` : `Saved to:\n${res.uri}`
        );
      }
      track("pdf_exported", {});
    } catch (e) {
      Alert.alert(
        isArabic ? "تعذّر التصدير" : "Export failed",
        (e as Error).message
      );
    }
    setExportingPdf(false);
  };

  const confirmExport = () => {
    Alert.alert(
      isArabic ? "تحميل بياناتك" : "Download your data",
      isArabic
        ? "سنجهّز نسخة JSON من ملفك الشخصي وسجلاتك وتمارينك وخططك — يمكنك حفظها في الملفات أو إرسالها بالبريد. قد يستغرق ذلك بضع ثوانٍ."
        : "We'll prepare a JSON copy of your profile, logs, workouts, and plans — then hand it to the share sheet so you can save it to Files or email it. Takes a few seconds.",
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: isArabic ? "متابعة" : "Continue", onPress: doExport },
      ]
    );
  };

  return (
    <Screen>
      <View style={settingsStyles.head}>
        <BackButton />
      </View>
      <Text style={settingsStyles.title}>
        {isArabic ? "قانوني" : "Legal"}
      </Text>
      <View style={settingsStyles.card}>
        <RowLink
          label={
            exportingPdf
              ? isArabic
                ? "جارٍ التحضير…"
                : "Preparing…"
              : isArabic
                ? "صدّر تقرير PDF"
                : "Export PDF progress report"
          }
          onPress={doPdfExport}
        />
        <RowLink
          label={
            exporting
              ? isArabic
                ? "جارٍ التحضير…"
                : "Preparing…"
              : isArabic
                ? "حمّل بياناتي"
                : "Download my data"
          }
          onPress={confirmExport}
        />
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
          label={isArabic ? "اقترح ميزة" : "Request a feature"}
          onPress={() =>
            Linking.openURL(
              "mailto:hello@se7a.app?subject=SE7A%20feature%20request"
            )
          }
          external
        />
        <RowLink
          label={isArabic ? "الدعم" : "Support"}
          value="hello@se7a.app"
          onPress={openSupport}
          external
        />
      </View>

      <View style={styles.safetyCard}>
        <Text style={styles.safetyKicker}>
          {isArabic ? "ملاحظة أمان" : "SAFETY"}
        </Text>
        <Text style={styles.safetyBody}>
          {isArabic
            ? "SE7A أداة تتبع وتدريب — ليس جهازًا طبيًا. النطاقات تقديرات لا تشخيصات. لو عندك حالة طبية، حامل، أو تاريخ اضطراب أكل — استشيري طبيبك قبل أي تغيير كبير في النظام أو التمرين."
            : "SE7A is a tracking and coaching tool — not a medical device. Ranges are estimates, not diagnoses. If you have a medical condition, are pregnant, or have a history of disordered eating, talk to your doctor before any significant change in diet or training."}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safetyCard: {
    marginTop: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
  },
  safetyKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.coral,
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  safetyBody: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    lineHeight: 20,
  },
});
