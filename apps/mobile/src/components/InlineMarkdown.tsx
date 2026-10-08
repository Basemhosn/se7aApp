import { Text, type TextStyle } from "react-native";

/**
 * Minimal inline markdown renderer — handles the only emphasis we
 * actually want from the coach: `**bold**` and `*italic*`.
 *
 * Deliberately not pulling in react-native-markdown-display or similar
 * because:
 *   - Those libs add ~30KB + extra RN view trees for features we don't
 *     want (headers, blockquotes, code blocks, link cards).
 *   - We've asked the prompt to stay in a tight format subset, so the
 *     renderer only needs to match that subset.
 *   - RTL / Arabic text support in third-party markdown libs is
 *     uneven; a native Text with inline spans just works.
 *
 * If future features (coach, insights, etc) need headers or lists,
 * extend here rather than reaching for a library.
 */

interface Props {
  text: string;
  style?: TextStyle;
  boldStyle?: TextStyle;
  italicStyle?: TextStyle;
}

export function InlineMarkdown({
  text,
  style,
  boldStyle = { fontWeight: "700" },
  italicStyle = { fontStyle: "italic" },
}: Props) {
  const segments = parse(text);
  return (
    <Text style={style}>
      {segments.map((seg, i) => {
        if (seg.kind === "bold") {
          return (
            <Text key={i} style={boldStyle}>
              {seg.text}
            </Text>
          );
        }
        if (seg.kind === "italic") {
          return (
            <Text key={i} style={italicStyle}>
              {seg.text}
            </Text>
          );
        }
        return <Text key={i}>{seg.text}</Text>;
      })}
    </Text>
  );
}

type Segment =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string };

/**
 * Parse `**bold**` first (double asterisks are strictly greedier than
 * single), then split what remains on `*italic*`. Deliberately simple:
 * no escaping, no nesting. The coach prompt stays within what this
 * supports.
 */
function parse(input: string): Segment[] {
  const boldRe = /\*\*([^*\n]+)\*\*/g;
  const italicRe = /(?<!\*)\*([^*\n]+)\*(?!\*)/g;

  const out: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = boldRe.exec(input)) !== null) {
    if (m.index > last) {
      pushItalicSplit(out, input.slice(last, m.index));
    }
    out.push({ kind: "bold", text: m[1]! });
    last = m.index + m[0].length;
  }
  if (last < input.length) {
    pushItalicSplit(out, input.slice(last));
  }
  return out;
}

function pushItalicSplit(out: Segment[], chunk: string): void {
  const italicRe = /(?<!\*)\*([^*\n]+)\*(?!\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = italicRe.exec(chunk)) !== null) {
    if (m.index > last) {
      out.push({ kind: "text", text: chunk.slice(last, m.index) });
    }
    out.push({ kind: "italic", text: m[1]! });
    last = m.index + m[0].length;
  }
  if (last < chunk.length) {
    out.push({ kind: "text", text: chunk.slice(last) });
  }
}
