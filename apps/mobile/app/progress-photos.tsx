import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/Screen";
import { Btn } from "@/components/Btn";
import { BackButton } from "@/components/BackButton";
import { api, apiUpload } from "@/lib/api";
import { colors, font, radius, spacing } from "@/lib/theme";

type Angle = "front" | "side" | "back";

interface Photo {
  id: number;
  taken_at: string;
  angle: Angle;
  weight_kg_snapshot: number | null;
  notes: string | null;
  url: string | null;
}

interface ListResponse {
  photos: Photo[];
  count: number;
}

const ANGLES: Angle[] = ["front", "side", "back"];

export default function ProgressPhotos() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === "ar";
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedAngle, setSelectedAngle] = useState<Angle>("front");
  const [compareLeft, setCompareLeft] = useState<number | null>(null);
  const [compareRight, setCompareRight] = useState<number | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<ListResponse>("/api/progress/photos");
      setPhotos(res.photos);
      // Default compare = first vs latest of the currently selected angle.
      const forAngle = res.photos.filter((p) => p.angle === selectedAngle);
      if (forAngle.length >= 2) {
        setCompareLeft(forAngle[forAngle.length - 1]!.id);
        setCompareRight(forAngle[0]!.id);
      } else {
        setCompareLeft(null);
        setCompareRight(null);
      }
    } catch (e) {
      setErr((e as Error).message);
    }
    setLoading(false);
  }, [selectedAngle]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    const forAngle = photos.filter((p) => p.angle === selectedAngle);
    if (forAngle.length >= 2) {
      setCompareLeft(forAngle[forAngle.length - 1]!.id);
      setCompareRight(forAngle[0]!.id);
    } else {
      setCompareLeft(null);
      setCompareRight(null);
    }
  }, [selectedAngle, photos]);

  const takePhoto = async (source: "camera" | "library") => {
    setErr("");
    const perm =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        isArabic ? "الإذن مرفوض" : "Permission denied",
        isArabic
          ? "فعّل الإذن من الإعدادات لالتقاط أو اختيار صور."
          : "Enable it in Settings to take or pick photos."
      );
      return;
    }
    const r =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ quality: 0.9 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.9,
          });
    if (r.canceled || !r.assets?.[0]) return;

    const resized = await ImageManipulator.manipulateAsync(
      r.assets[0].uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
    );

    setUploading(true);
    try {
      await apiUpload(
        "/api/progress/photos/upload",
        "image",
        { uri: resized.uri, mimeType: "image/jpeg", fileName: "progress.jpg" },
        { angle: selectedAngle }
      );
      await load();
    } catch (e) {
      setErr((e as Error).message || "Couldn't upload.");
    }
    setUploading(false);
  };

  const deletePhoto = (id: number) => {
    Alert.alert(
      isArabic ? "احذف الصورة؟" : "Delete this photo?",
      isArabic
        ? "لا يمكن التراجع."
        : "This can't be undone.",
      [
        { text: isArabic ? "إلغاء" : "Cancel", style: "cancel" },
        {
          text: isArabic ? "احذف" : "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api(`/api/progress/photos/${id}`, { method: "DELETE" });
              await load();
            } catch (e) {
              Alert.alert(
                isArabic ? "فشل" : "Failed",
                (e as Error).message
              );
            }
          },
        },
      ]
    );
  };

  const forAngle = photos.filter((p) => p.angle === selectedAngle);
  const leftPhoto = photos.find((p) => p.id === compareLeft);
  const rightPhoto = photos.find((p) => p.id === compareRight);
  const weightDelta =
    leftPhoto?.weight_kg_snapshot != null &&
    rightPhoto?.weight_kg_snapshot != null
      ? Math.round(
          (Number(rightPhoto.weight_kg_snapshot) -
            Number(leftPhoto.weight_kg_snapshot)) *
            10
        ) / 10
      : null;

  return (
    <Screen>
      <View style={styles.head}>
        <BackButton />
      </View>
      <Text style={styles.kicker}>
        {isArabic ? "صور التقدم" : "PROGRESS PHOTOS"}
      </Text>
      <Text style={styles.h1}>
        {isArabic ? "شوف نفسك تتغير" : "Watch yourself change."}
      </Text>
      <Text style={styles.sub}>
        {isArabic
          ? "خاص. مرئي لك فقط. احذف أي صورة في أي وقت."
          : "Private. Visible only to you. Delete any photo any time."}
      </Text>

      <View style={styles.angleRow}>
        {ANGLES.map((a) => (
          <Pressable
            key={a}
            onPress={() => setSelectedAngle(a)}
            style={[
              styles.angleTab,
              selectedAngle === a && styles.angleTabOn,
            ]}
          >
            <Text
              style={[
                styles.angleTabLabel,
                selectedAngle === a && styles.angleTabLabelOn,
              ]}
            >
              {a.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={{ paddingVertical: spacing.xl, alignItems: "center" }}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : (
        <>
          {forAngle.length >= 2 && leftPhoto && rightPhoto && (
            <View style={styles.compareCard}>
              <Text style={styles.compareKicker}>
                {isArabic ? "قارن" : "COMPARE"}
              </Text>
              <View style={styles.compareRow}>
                <ComparePane
                  photo={leftPhoto}
                  label={isArabic ? "قبل" : "before"}
                />
                <ComparePane
                  photo={rightPhoto}
                  label={isArabic ? "الآن" : "now"}
                />
              </View>
              {weightDelta !== null && (
                <Text style={styles.compareDelta}>
                  {weightDelta > 0 ? "+" : ""}
                  {weightDelta} kg{" "}
                  {isArabic ? "منذ أول صورة" : "since first photo"}
                </Text>
              )}
            </View>
          )}

          {forAngle.length > 0 && (
            <View>
              <Text style={styles.sectionH}>
                {isArabic ? "الخط الزمني" : "Timeline"}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: spacing.sm, paddingVertical: 4 }}
              >
                {forAngle.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => setCompareRight(p.id)}
                    onLongPress={() => deletePhoto(p.id)}
                    style={styles.thumbCard}
                  >
                    {p.url ? (
                      <Image source={{ uri: p.url }} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumb, styles.thumbPlaceholder]} />
                    )}
                    <Text style={styles.thumbDate}>{shortDate(p.taken_at)}</Text>
                    {p.weight_kg_snapshot != null && (
                      <Text style={styles.thumbWeight}>
                        {Number(p.weight_kg_snapshot).toFixed(1)} kg
                      </Text>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={styles.longPressHint}>
                {isArabic
                  ? "اضغط مطولاً لحذف صورة."
                  : "Long-press a thumbnail to delete."}
              </Text>
            </View>
          )}

          {forAngle.length === 0 && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyH}>
                {isArabic
                  ? `لا ${selectedAngle === "front" ? "أمامية" : selectedAngle === "side" ? "جانبية" : "خلفية"} بعد`
                  : `No ${selectedAngle} photos yet`}
              </Text>
              <Text style={styles.emptyBody}>
                {isArabic
                  ? "خذ الأولى الآن — نفس الإضاءة والزاوية أسبوعياً تعطيك أفضل مقارنة."
                  : "Take your first one now — same lighting + angle weekly gives the best compare."}
              </Text>
            </View>
          )}

          {!!err && <Text style={styles.err}>{err}</Text>}

          <Btn
            label={
              uploading
                ? isArabic
                  ? "جارٍ الرفع…"
                  : "Uploading…"
                : isArabic
                  ? "التقط صورة"
                  : "Take a photo"
            }
            onPress={() => takePhoto("camera")}
            loading={uploading}
          />
          <Btn
            label={isArabic ? "اختر من المكتبة" : "Pick from library"}
            variant="ghost"
            onPress={() => takePhoto("library")}
            disabled={uploading}
          />

          <View style={styles.privacyCard}>
            <Text style={styles.privacyKicker}>
              {isArabic ? "الخصوصية" : "PRIVACY"}
            </Text>
            <Text style={styles.privacyBody}>
              {isArabic
                ? "صورك مُخزّنة في مساحة خاصة، مرئية لك فقط عبر روابط قصيرة الأجل. تُحذف نهائياً عند حذف حسابك."
                : "Your photos live in a private bucket, visible only to you via short-lived signed links. Deleted permanently if you delete your account."}
            </Text>
          </View>
        </>
      )}
    </Screen>
  );
}

function ComparePane({ photo, label }: { photo: Photo; label: string }) {
  return (
    <View style={styles.comparePane}>
      {photo.url ? (
        <Image source={{ uri: photo.url }} style={styles.compareImg} />
      ) : (
        <View style={[styles.compareImg, styles.thumbPlaceholder]} />
      )}
      <Text style={styles.compareLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.compareDate}>{shortDate(photo.taken_at)}</Text>
      {photo.weight_kg_snapshot != null && (
        <Text style={styles.compareWeight}>
          {Number(photo.weight_kg_snapshot).toFixed(1)} kg
        </Text>
      )}
    </View>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  head: { marginTop: spacing.sm },
  kicker: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  h1: { fontFamily: font.displayBold, fontSize: 28, color: colors.ink },
  sub: { fontFamily: font.body, fontSize: 14, color: colors.dim, lineHeight: 21 },
  angleRow: { flexDirection: "row", gap: 4 },
  angleTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
  },
  angleTabOn: {
    borderColor: colors.gold,
    backgroundColor: "rgba(246,183,60,0.10)",
  },
  angleTabLabel: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
    letterSpacing: 1.2,
  },
  angleTabLabelOn: { color: colors.gold },
  compareCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.goldDim,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  compareKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
    letterSpacing: 1.4,
  },
  compareRow: { flexDirection: "row", gap: spacing.sm },
  comparePane: { flex: 1, gap: 2, alignItems: "center" },
  compareImg: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    backgroundColor: colors.panel2,
  },
  compareLabel: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    letterSpacing: 1.4,
    marginTop: 6,
  },
  compareDate: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.dim,
  },
  compareWeight: {
    fontFamily: font.mono,
    fontSize: 11,
    color: colors.gold,
  },
  compareDelta: {
    fontFamily: font.displayBold,
    fontSize: 16,
    color: colors.ink,
    textAlign: "center",
    marginTop: 4,
  },
  sectionH: {
    fontFamily: font.displayBold,
    fontSize: 16,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  thumbCard: { alignItems: "center", gap: 2 },
  thumb: {
    width: 84,
    height: 112,
    borderRadius: radius.sm,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  thumbPlaceholder: {
    backgroundColor: colors.panel2,
  },
  thumbDate: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    marginTop: 4,
  },
  thumbWeight: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.gold,
  },
  longPressHint: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.dim,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  emptyCard: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
    gap: 6,
  },
  emptyH: {
    fontFamily: font.displayBold,
    fontSize: 20,
    color: colors.ink,
  },
  emptyBody: {
    fontFamily: font.body,
    fontSize: 14,
    color: colors.dim,
    lineHeight: 21,
    textAlign: "center",
  },
  privacyCard: {
    backgroundColor: colors.panel2,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  privacyKicker: {
    fontFamily: font.mono,
    fontSize: 10,
    color: colors.mint,
    letterSpacing: 1.4,
  },
  privacyBody: {
    fontFamily: font.body,
    fontSize: 12,
    color: colors.dim,
    lineHeight: 18,
  },
  err: { color: colors.coral, fontFamily: font.body, fontSize: 13 },
});
