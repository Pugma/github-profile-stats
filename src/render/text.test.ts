import assert from "node:assert/strict";
import { test } from "vitest";
import { estimateTextWidth, fitText } from "./text.ts";

test("text fitting accounts for narrow and wide characters and reserves the ellipsis", () => {
  assert.ok(estimateTextWidth("iiii", 13) < estimateTextWidth("WWWW", 13));
  const narrow = "ill ".repeat(12).trim();
  assert.equal(fitText(narrow, 160, 13), narrow);
  const wide = "W".repeat(30);
  const shortened = fitText(wide, 160, 13);
  assert.ok(shortened.endsWith("…"));
  assert.ok(estimateTextWidth(shortened, 13) <= 160);
  assert.equal(fitText("text", 0, 13), "");
});

test("text truncation preserves graphemes and normalizes SVG whitespace", () => {
  assert.equal(fitText(" A\n  small\tcompiler ", 300, 13), "A small compiler");
  const family = "👨‍👩‍👧‍👦";
  assert.equal(
    fitText(family.repeat(5), estimateTextWidth(family + "…", 13) + 0.1, 13),
    family + "…",
  );
  const japanese = fitText("日本語の説明です".repeat(10), 180, 13);
  assert.ok(japanese.endsWith("…"));
  assert.ok(estimateTextWidth(japanese, 13) <= 180);
});
