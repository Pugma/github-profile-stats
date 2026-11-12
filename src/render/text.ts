// Approximate Helvetica advances in 1/1000 em; fallback fonts can still differ at rendering time.
const latinAdvances = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

function advance(grapheme: string) {
  if (/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(grapheme)) return 1100;
  const base = Array.from(grapheme.normalize("NFD")).find((point) => !/\p{Mark}/u.test(point));
  if (!base) return 0;
  if (/\s/u.test(base)) return 278;
  const code = base.codePointAt(0);
  if (code === undefined) return 0;
  if (code >= 32 && code <= 126) return latinAdvances[code - 32];
  if (base === "…") return 1000;
  return code >= 0x2e80 ? 1050 : 750;
}

export function estimateTextWidth(value: string, size: number) {
  let width = 0;
  for (const { segment } of segmenter.segment(value)) width += advance(segment);
  return ((width * size) / 1000) * 1.03;
}

export function fitText(value: string, width: number, size: number) {
  const text = value.replace(/\s+/gu, " ").trim();
  if (estimateTextWidth(text, size) <= width) return text;
  const ellipsisWidth = estimateTextWidth("…", size);
  if (width < ellipsisWidth) return "";
  let prefix = "";
  let used = 0;
  for (const { segment } of segmenter.segment(text)) {
    const next = ((advance(segment) * size) / 1000) * 1.03;
    if (used + next + ellipsisWidth > width) break;
    prefix += segment;
    used += next;
  }
  return prefix.trimEnd() + "…";
}
