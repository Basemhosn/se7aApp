import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { BackButton } from "@/components/BackButton";
import { useAuth } from "@/auth/AuthContext";
import { api } from "@/lib/api";
import { useReferral } from "@/lib/useReferral";
import { supabase } from "@/lib/supabase";
import { clearInviteCode, readInviteCode } from "@/lib/referralInvite";
import { Section, settingsStyles } from "@/components/SettingsAtoms";
import { colors, font, radius, spacing } from "@/lib/theme";

/**
 * Invite friends sub-screen. Hosts both halves of the referral loop:
 *   - Attach a friend's code (visible only during the 7-day
 *     attribution window after signup, and only if the user hasn't
 *     already got a referrer).
 *   - Invite friends card showing counts + link + share/copy actions.
 *
 * All state (referral stats, attach eligibility/code/error/success)
 * lives here now; previously inlined in settings.tsx.
 */
export default function InviteScreen() {
  const { user } = useAuth();
  const { i18n, t } = useTranslation();
  const isArabic = i18n.language === "ar";
  const { stats: referral, refresh: refreshReferral } = useReferral(user?.id);

  const [attachEligible, setAttachEligible] = useState(false);
  const [attachCode, setAttachCode] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [attachSuccess, setAttachSuccess] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("profiles")
      .select("referred_by, created_at")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        if (data.referred_by) return;
        const createdMs = data.created_at
          ? new Date(data.created_at).getTime()
          : 0;
        const withinWindow =
          Date.now() - createdMs <= 7 * 24 * 60 * 60 * 1000;
        setAttachEligible(withinWindow);
        if (withinWindow) {
          void readInviteCode().then((code) => {
            if (code) setAttachCode((prev) => prev || code);
          });
        }
      });
  }, [user?.id]);

  const shareLink = async () => {
    if (!referral?.link) return;
    try {
      await Share.share({
        message: isArabic
          ? `جربت SE7A — مدرب غذاء ولياقة بالذكاء الاصطناعي بناسب الخليج. سجّل من رابطي وكل واحد فينا ياخد شهر Pro مجاناً لما تشترك. ${referral.link}`
          : `I'm using SE7A — AI food + fitness coach built for the Gulf. Sign up with my link and we both get a free month of Pro when you upgrade. ${referral.link}`,
        url: referral.link,
      });
    } catch {
      /* user cancelled */
    }
  };

  const copyLink = async () => {
    if (!referral?.link) return;
    await Clipboard.setStringAsync(referral.link);
    Alert.alert(isArabic ? "تم النسخ" : "Copied", referral.link);
  };

  const doAttach = async () => {
    const trimmed = attachCode.trim().toLowerCase();
    if (!/^[a-f0-9]{6,12}$/.test(trimmed)) {
      setAttachError(
        isArabic ? "الرمز يبدو غير صحيح." : "That code doesn't look right."
      );
      return;
    }
    setAttaching(true);
    setAttachError(null);
    try {
      await api<{ ok: true }>("/api/referrals/attach", {
        method: "POST",
        body: JSON.stringify({ referral_code: trimmed }),
      });
      setAttachSuccess(true);
      setAttachEligible(false);
      setAttachCode("");
      void clearInviteCode();
      refreshReferral();
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (msg.includes("code_not_found")) {
        setAttachError(
          isArabic ? "الرمز غير موجود." : "Code not found."
        );
      } else if (msg.includes("self_referral")) {
        setAttachError(
          isArabic ? "لا يمكنك استخدام رمزك الخاص." : "That's your own code."
        );
      } else if (msg.includes("already_attributed")) {
        setAttachError(
          isArabic ? "لديك مُحيل بالفعل." : "You already have a referrer."
        );
      } else if (msg.includes("outside_attribution_window")) {
        setAttachError(
          isArabic
            ? "نافذة الرموز 7 أيام فقط من الاشتراك."
            : "Codes can only be attached within 7 days of signup."
        );
      } else {
        setAttachError(msg || (isArabic ? "خطأ" : "Something went wrong."));
      }
    }
    setAttaching(false);
  };

  return (
    <Screen>
      <View style={settingsStyles.head}>
        <BackButton />
      </View>
      <Text style={settingsStyles.title}>
        {isArabic ? "ادعُ الأصدقاء" : "Invite friends"}
      </Text>

      {(attachEligible || attachSuccess) && (
        <Section title={isArabic ? "لديك رمز صديق؟" : "Have a friend's code?"}>
          <View style={styles.attachBody}>
            {attachSuccess ? (
              <Text style={styles.attachSuccess}>
                {isArabic
                  ? "تم! ستحصل على شهر مجاني عند اشتراكك في Pro."
                  : "Done — you'll get a free month when you upgrade to Pro."}
              </Text>
            ) : (
              <>
                <Text style={styles.attachHint}>
                  {isArabic
                    ? "أدخل رمز صديقك خلال 7 أيام من التسجيل وستحصل على شهر Pro مجاني."
                    : "Enter a friend's code within 7 days of signing up and you'll get a free month of Pro."}
                </Text>
                <TextInput
                  value={attachCode}
                  onChangeText={(v) => {
                    setAttachCode(v);
                    setAttachError(null);
                  }}
                  placeholder={isArabic ? "الرمز" : "Code"}
                  placeholderTextColor={colors.dim}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  maxLength={12}
                  style={styles.attachInput}
                />
                {attachError && (
                  <Text style={styles.attachError}>{attachError}</Text>
                )}
                <Pressable
                  onPress={doAttach}
                  disabled={attaching || attachCode.trim().length < 6}
                  style={[
                    styles.attachBtn,
                    (attaching || attachCode.trim().length < 6) &&
                      styles.attachBtnDisabled,
                  ]}
                >
                  <Text style={styles.attachBtnLabel}>
                    {attaching
                      ? isArabic
                        ? "جارٍ التطبيق…"
                        : "Attaching…"
                      : isArabic
                        ? "طبّق الرمز"
                        : "Attach code"}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </Section>
      )}

      {/* Render the invite card immediately with placeholder counts +
       * disabled share/copy buttons. Counts flip to real numbers once
       * useReferral resolves (~100-300ms); the share/copy pressables
       * un-disable when referral.link populates. User sees the full
       * structure instantly instead of a 200-400ms blank window. */}
      <View style={{ marginTop: spacing.md }}>
        <View style={styles.inviteBody}>
          <Text style={styles.inviteHeadline}>
            {isArabic
              ? "شهر Pro مجاني لكل صديق يشترك"
              : "1 free month of Pro for every friend who upgrades"}
          </Text>
          <Text style={styles.inviteSubcopy}>
            {isArabic
              ? "شهر مجاني لك وشهر مجاني لهم. يُطبَّق تلقائياً بعد اشتراكهم. لا حدّ للأشهر التي تكسبها."
              : "A free month for you and a free month for them. Auto-applied after they subscribe. No cap on how many months you can stack."}
          </Text>

          <View style={styles.inviteStats}>
            <View style={styles.inviteStatCol}>
              <Text style={styles.inviteStatValue}>
                {referral?.referred_count ?? 0}
              </Text>
              <Text style={styles.inviteStatLabel}>
                {isArabic ? "انضموا" : "Joined"}
              </Text>
            </View>
            <View style={styles.inviteStatDivider} />
            <View style={styles.inviteStatCol}>
              <Text style={styles.inviteStatValue}>
                {Math.floor((referral?.rewards_earned_days ?? 0) / 30)}
              </Text>
              <Text style={styles.inviteStatLabel}>
                {isArabic ? "أشهر مكتسبة" : "Months earned"}
              </Text>
            </View>
            {referral && referral.rewards_pending > 0 && (
              <>
                <View style={styles.inviteStatDivider} />
                <View style={styles.inviteStatCol}>
                  <Text style={styles.inviteStatValue}>
                    {referral.rewards_pending}
                  </Text>
                  <Text style={styles.inviteStatLabel}>
                    {isArabic ? "قيد المعالجة" : "Pending"}
                  </Text>
                </View>
              </>
            )}
          </View>

          <Text style={styles.inviteLink}>
            {referral?.link ?? (isArabic ? "جارٍ التحميل…" : "Loading…")}
          </Text>
          <View style={styles.inviteRow}>
            <Pressable
              onPress={shareLink}
              style={[
                styles.invitePrimary,
                !referral?.link && { opacity: 0.5 },
              ]}
              disabled={!referral?.link}
            >
              <Ionicons name="share-outline" size={16} color={colors.bg} />
              <Text style={styles.invitePrimaryLabel}>
                {isArabic ? "شارك الرابط" : "Share link"}
              </Text>
            </Pressable>
            <Pressable
              onPress={copyLink}
              style={[
                styles.inviteSecondary,
                !referral?.link && { opacity: 0.5 },
              ]}
              disabled={!referral?.link}
            >
              <Ionicons name="copy-outline" size={16} color={colors.ink} />
              <Text style={styles.inviteSecondaryLabel}>
                {isArabic ? "انسخ" : "Copy"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  attachBody: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  attachHint: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    lineHeight: 19,
  },
  attachSuccess: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.mint,
    lineHeight: 19,
  },
  attachInput: {
    fontFamily: font.mono,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.panel2,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    letterSpacing: 2,
  },
  attachError: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.coral,
  },
  attachBtn: {
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingVertical: 10,
    alignItems: "center",
  },
  attachBtnDisabled: {
    backgroundColor: colors.panel2,
  },
  attachBtnLabel: {
    fontFamily: font.displayBold,
    fontSize: 13,
    color: colors.bg,
  },
  inviteBody: {
    padding: spacing.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  inviteHeadline: {
    fontFamily: font.displayBold,
    fontSize: 16,
    color: colors.ink,
    lineHeight: 22,
  },
  inviteSubcopy: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.dim,
    lineHeight: 19,
  },
  inviteStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  inviteStatCol: {
    flex: 1,
    alignItems: "center",
  },
  inviteStatValue: {
    fontFamily: font.displayBold,
    fontSize: 20,
    color: colors.gold,
  },
  inviteStatLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  inviteStatDivider: {
    width: 1,
    backgroundColor: colors.line,
    alignSelf: "stretch",
  },
  inviteLink: {
    fontFamily: font.mono,
    fontSize: 12,
    color: colors.gold,
    backgroundColor: colors.panel2,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    marginTop: spacing.xs,
  },
  inviteRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  invitePrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingVertical: 10,
  },
  invitePrimaryLabel: {
    fontFamily: font.displayBold,
    fontSize: 13,
    color: colors.bg,
  },
  inviteSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingVertical: 10,
  },
  inviteSecondaryLabel: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.ink,
  },
});
