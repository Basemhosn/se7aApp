import { StyleSheet, View, type ImageSourcePropType, Image } from "react-native";
import { colors } from "@/lib/theme";

/**
 * iPhone-silhouette container for landing-page screenshots. Draws a
 * rounded dark bezel with a subtle highlight stroke and a camera notch
 * at the top. The inner area clips to the device's rounded screen
 * corner so screenshots look seated inside hardware, not floating.
 *
 * `source` can be a real `require(...)` screenshot or null to render a
 * neutral placeholder — useful while the real images are still being
 * captured.
 */
export function DeviceFrame({
  source,
  width,
  children,
}: {
  source?: ImageSourcePropType | null;
  width: number;
  children?: React.ReactNode;
}) {
  // iPhone 15 Pro Max has a ~19.5:9 aspect ratio (393pt wide, 852pt tall).
  // We keep the inner screen in that ratio so screenshots don't stretch.
  const height = width * 2.168;
  const bezel = Math.max(10, width * 0.035);
  const innerRadius = Math.max(28, width * 0.11);
  const outerRadius = innerRadius + bezel * 0.6;

  return (
    <View
      style={[
        styles.outer,
        {
          width,
          height,
          borderRadius: outerRadius,
          padding: bezel,
        },
      ]}
    >
      {/* Notch — simplified pill at the top */}
      <View
        style={[
          styles.notch,
          {
            width: width * 0.3,
            height: bezel * 1.6,
            borderRadius: bezel,
            top: bezel * 0.65,
          },
        ]}
      />

      <View
        style={[
          styles.screen,
          { borderRadius: innerRadius },
        ]}
      >
        {source ? (
          <Image
            source={source}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.placeholder}>{children}</View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    backgroundColor: "#1a1d1a",
    borderWidth: 1,
    borderColor: "#2a2e2a",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    position: "relative",
  },
  notch: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: "#0b0d0b",
    zIndex: 10,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    overflow: "hidden",
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
});
