import { StyleSheet, View } from "react-native";
import { SvgXml } from "react-native-svg";

/**
 * SE7A wordmark — renders the new pictorial 7/ح hybrid mark via SVG.
 *
 * Replaces the previous HTML-text-styled version (SE + colored "7" + A
 * as three Text spans) with the actual brand mark so the mobile app
 * matches the icon on the home screen and the wordmark on se7a.app.
 *
 * Kept this SVG in sync with public/se7a-wordmark-text.svg on the web —
 * same path data, same cream + gold colors tuned for the app's dark
 * background. If the brand kit regenerates, update both files.
 *
 * Size prop controls the rendered HEIGHT. Aspect ratio is 594:232 so
 * width is derived to keep the glyph proportioned. Default 28 matches
 * the previous text component's visual weight.
 */
const SE_A_PATHS = `<path d="M109.4384765625 195.7578125C136.318359375 195.7578125 152.724609375 182.7939453125 152.724609375 161.7734375C152.724609375 145.3671875 142.3974609375 135.7724609375 119.1064453125 130.865234375L108.6328125 128.5947265625C95.2294921875 125.6650390625 89.8095703125 121.9296875 89.8095703125 115.19140625C89.8095703125 107.2080078125 97.646484375 101.6416015625 108.779296875 101.6416015625C120.498046875 101.6416015625 128.1884765625 108.013671875 128.994140625 118.3408203125H150.087890625C149.4287109375 96.3681640625 133.828125 83.111328125 108.7060546875 83.111328125C83.876953125 83.111328125 67.2509765625 96.44140625 67.2509765625 116.2900390625C67.2509765625 131.890625 77.724609375 141.9248046875 99.3310546875 146.6123046875L110.830078125 149.1025390625C124.6728515625 152.10546875 130.3857421875 156.20703125 130.3857421875 163.23828125C130.3857421875 171.734375 122.109375 177.2275390625 109.5849609375 177.2275390625C95.595703125 177.2275390625 87.1728515625 170.1962890625 86.8798828125 158.1845703125H65.126953125C65.126953125 181.9150390625 81.4599609375 195.7578125 109.4384765625 195.7578125Z M168.1787109375 194.0H246.474609375V174.6640625H190.7373046875V148.296875H242.2998046875V129.4736328125H190.7373046875V104.205078125H246.474609375V84.869140625H168.1787109375Z" fill="INK_COLOR"/><g transform="translate(226.330322265625 35.10546875) scale(0.44431849888392855)"><path d="M100 142 H400 C298 195 178 265 178 325 C178 367 240 377 300 361" fill="none" stroke="#EFB13A" stroke-width="64"/></g><path d="M418.4919084821429 194.0H442.8083147321429L450.7184709821429 170.1962890625H491.5143694196429L499.1315569196429 194.0H524.1071428571429L485.8014787946429 84.869140625H456.7975725446429ZM456.7975725446429 152.1787109375 460.5329241071429 140.8994140625C464.0485491071429 129.7666015625 467.4176897321429 118.6337890625 471.3727678571429 105.083984375C475.2546037946429 118.6337890625 478.6237444196429 129.7666015625 481.9928850446429 140.8994140625L485.6549944196429 152.1787109375Z" fill="INK_COLOR"/>`;

// Light variant uses dark ink so the SE+A letters stay legible on
// cream / warm backgrounds (landing page). The gold 7 stroke color is
// identical across both variants — the 7 is the brand anchor.
const DARK_INK = "#F4EDE0"; // on dark bg (default app theme)
const LIGHT_INK = "#1a1d1a"; // on light bg (landing hero)

const svgForVariant = (variant: "dark" | "light") => {
  const ink = variant === "light" ? LIGHT_INK : DARK_INK;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="594" height="232" viewBox="0 0 594 232">${SE_A_PATHS.replaceAll(
    "INK_COLOR",
    ink
  )}</svg>`;
};

const ASPECT = 594 / 232;

export function Wordmark({
  size = 28,
  variant = "dark",
}: {
  size?: number;
  variant?: "dark" | "light";
}) {
  // `size` controls height of the rendered SVG so callers get a
  // predictable vertical footprint (matches the previous text-based
  // API where size meant font-size).
  const height = size * 1.4;
  const width = height * ASPECT;
  return (
    <View style={styles.row}>
      <SvgXml xml={svgForVariant(variant)} width={width} height={height} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
});
