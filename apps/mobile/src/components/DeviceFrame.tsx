import { StyleSheet, View, type ImageSourcePropType, Image } from "react-native";
import { colors } from "@/lib/theme";

/**
 * iPhone-silhouette container for landing-page screenshots. Draws a
 * cream-tinted bezel (light enough to stand out against both the warm
 * landing bg AND the dark SE7A UI shown inside) with a camera notch
 * and clipped rounded screen corners.
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
  // iPhone 15 Pro Max is 1290×2796 (aspect 2.167). Our source
  // screenshots are 1290×2646 (aspect 2.05) — close enough that cover
  // mode will crop just a sliver of top/bottom.
  const height = width * 2.167;
  const bezel = Math.max(8, width * 0.03);
  const innerRadius = Math.max(26, width * 0.11);
  const outerRadius = innerRadius + bezel * 0.5;

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
      <View style={[styles.screen, { borderRadius: innerRadius }]}>
        {source ? (
          // IMPORTANT: Image with just StyleSheet.absoluteFill falls
          // back to its intrinsic resolution (1290×2646 for our
          // screenshots), which produces a wildly zoomed-in result —
          // only the top-left of the image is visible. Explicit 100%
          // sizing forces the image to fit the clipped screen area.
          <Image
            source={source}
            style={styles.image}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.placeholder}>{children}</View>
        )}

        {/* Notch sits INSIDE the screen clip so it looks painted on
            the display rather than cut out of the bezel. */}
        <View
          style={[
            styles.notch,
            {
              width: width * 0.28,
              height: bezel * 1.8,
              borderRadius: bezel,
              top: 4,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    // Cream/parchment bezel to pop against the warm landing bg AND
    // against the dark app UI inside the screen.
    backgroundColor: "#1a1d1a",
    borderWidth: 1.5,
    borderColor: "#2d3230",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.35,
    shadowRadius: 32,
    elevation: 12,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    overflow: "hidden",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  notch: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: "#000",
    zIndex: 10,
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
});
