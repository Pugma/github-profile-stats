import assert from "node:assert/strict";

import { test } from "vitest";

import { snapshotInput } from "../../fixtures/snapshot.ts";
import { svgElements, svgGroup, svgText } from "../../fixtures/svg.ts";
import { buildSnapshot } from "../collector/aggregate.ts";
import { renderCard, renderGallery, renderPendingCard } from "./cards.tsx";
import {
  appearanceQuery,
  colorTokens,
  parseAppearance,
  resolveTheme,
  themeNames,
  themes,
} from "./themes.ts";

const snapshot = buildSnapshot(snapshotInput());

test("presets retain GitHub PR/merge colors and distinguish issues, with manual overrides available", () => {
  for (const theme of ["light", "warm"]) {
    const { colors } = resolveTheme(theme);
    assert.equal(colors.pr, "#1a7f37");
    assert.equal(colors.merged, "#8250df");
  }
  for (const theme of ["dark", "midnight"]) {
    const { colors } = resolveTheme(theme);
    assert.equal(colors.pr, "#3fb950");
    assert.equal(colors.merged, "#ab7df8");
  }
  for (const theme of themeNames) {
    const { colors } = resolveTheme(theme);
    assert.notEqual(colors.issue, colors.pr);
    assert.notEqual(colors.issue, colors.review);
  }
  assert.equal(resolveTheme("midnight", { merged: "ff0000" }).colors.merged, "#ff0000");
});

test("presets provide all color tokens and per-request overrides do not mutate them", () => {
  for (const name of themeNames) {
    assert.deepEqual(Object.keys(resolveTheme(name).colors).sort(), [...colorTokens].sort());
  }
  const original = themes.dark.colors.accent;
  const custom = parseAppearance(new URLSearchParams("theme=dark&accent=F80&background=%23ABCDEF"));
  assert.equal(custom.colors.accent, "#ff8800");
  assert.equal(custom.colors.background, "#abcdef");
  assert.equal(custom.colors.text, themes.dark.colors.text);
  assert.equal(resolveTheme("dark").colors.accent, original);
  assert.deepEqual(parseAppearance(new URLSearchParams(appearanceQuery(custom))), custom);
});

test("every color token accepts a manual override", () => {
  const overrides = Object.fromEntries(colorTokens.map((token) => [token, "123abc"]));
  assert.ok(
    Object.values(resolveTheme("light", overrides).colors).every((value) => value === "#123abc"),
  );
});

test.each([
  ["unknown theme", "theme=missing"],
  ["empty theme", "theme="],
  ["URL color", "accent=url(https://invalid)"],
  ["named color", "text=red"],
  ["eight-digit color", "background=12345678"],
  ["empty color", "accent="],
  ["unknown token", "ink=ffffff"],
  ["repeated theme", "theme=light&theme=dark"],
  ["repeated color", "accent=fff&accent=000"],
  ["prototype property", "__proto__=ffffff"],
])("rejects %s", (_reason, query) => {
  assert.throws(() => parseAppearance(new URLSearchParams(query)), /Invalid theme options/);
});

test("card color overrides style their intended elements", () => {
  const overrides = Object.fromEntries(
    colorTokens.map((token, index) => [token, (0x100000 + index * 0x1111).toString(16)]),
  );
  const appearance = resolveTheme("light", overrides);
  const colors = appearance.colors;
  const overview = renderCard(snapshot, "overview", appearance);
  const background = svgElements(overview, "rect")[0].attributes;
  assert.equal(background.fill, colors.background);
  assert.equal(background.stroke, colors.border);
  assert.equal(svgText(overview, "Overview").attributes.fill, colors.title);
  assert.equal(svgText(overview, "Commits").attributes.fill, colors.text);
  assert.equal(svgText(overview, "Last 12 Months").attributes.fill, colors.muted);
  const total = svgGroup(overview, svgText(overview, "Total Contributions"));
  const neutralIcon = svgElements(total, "svg")[0].attributes;
  assert.equal(neutralIcon.color, colors.icon);
  assert.equal(neutralIcon.stroke, "currentColor");
  assert.equal(svgElements(total, "rect")[0].attributes.fill, colors.accent);
  const values = svgElements(total, "text").filter(
    (element) => element.attributes["text-anchor"] === "end",
  );
  assert.equal(values.length, 2);
  assert.ok(values.every((element) => element.attributes.fill === colors.value));

  const oss = renderCard(snapshot, "oss", appearance);
  for (const [label, color] of [
    ["Commits", colors.commit],
    ["Pull Requests", colors.pr],
    ["Merged PRs", colors.merged],
    ["Reviews", colors.review],
    ["Issues", colors.issue],
  ]) {
    const row = svgGroup(oss, svgText(oss, label));
    const icon = svgElements(row, "svg")[0].attributes;
    assert.equal(icon.color, color, label);
    assert.equal(icon.stroke, "currentColor", label);
  }
  const rankingTitle = svgElements(oss, "title").find((element) =>
    element.text.startsWith(snapshot.oss.topRepositories[0].repository + ":"),
  );
  assert.ok(rankingTitle);
  const ranking = svgGroup(oss, rankingTitle);
  assert.deepEqual(
    svgElements(ranking, "rect").map((element) => element.attributes.fill),
    [colors.pr, colors.review, colors.issue],
  );
  const projects = renderCard(snapshot, "projects", appearance);
  const projectTitle = svgElements(projects, "title").find((element) =>
    element.text.startsWith(snapshot.myProjects.topRepositories[0].repository + ":"),
  );
  assert.ok(projectTitle);
  assert.equal(
    svgElements(svgGroup(projects, projectTitle), "rect")[0].attributes.fill,
    colors.commit,
  );

  const enriched = structuredClone(snapshot);
  const repository = enriched.recentRepositories!.repositories[0];
  repository.primaryLanguage = { name: "Go", color: "#ffffff" };
  const recent = renderCard(enriched, "recent", appearance);
  assert.equal(svgText(recent, repository.repository).attributes.fill, colors.accent);
  const language = svgGroup(recent, svgText(recent, "Go"));
  assert.equal(svgElements(language, "circle")[0].attributes.fill, colors.language);
  assert.ok(renderGallery(appearance).includes("background:" + colors.pageBackground));
});

test("rendering another palette does not change an earlier palette", () => {
  const before = renderCard(snapshot, "oss", resolveTheme("dark"));
  renderCard(snapshot, "oss", resolveTheme("light"));
  assert.equal(renderCard(snapshot, "oss", resolveTheme("dark")), before);
});

test("cards, pending data and gallery share the selected palette and preserve overrides in URLs", () => {
  const appearance = resolveTheme("midnight", {
    background: "123456",
    title: "abcdef",
    value: "fedcba",
  });
  assert.match(renderCard(snapshot, "overview", appearance), /fill="#123456"/);
  assert.match(renderCard(snapshot, "overview", appearance), /fill="#abcdef"/);
  assert.match(renderCard(snapshot, "overview", appearance), /fill="#fedcba"/);
  assert.match(renderPendingCard("overview", appearance), /fill="#123456"/);
  const gallery = renderGallery(appearance);
  assert.match(gallery, /overview\.svg\?theme=midnight&amp;background=123456/);
  for (const token of colorTokens) assert.ok(gallery.includes(`name="${token}"`));
  for (const theme of themeNames) assert.ok(gallery.includes(`value="${theme}"`));
});

test("language markers use GitHub colors by default, allow manual overrides and fall back when absent", () => {
  const enriched = structuredClone(snapshot);
  const repo = enriched.recentRepositories!.repositories[0];
  repo.primaryLanguage = { name: "Go", color: "#00add8" };
  for (const theme of themeNames) {
    assert.match(renderCard(enriched, "recent", resolveTheme(theme)), /<circle[^>]+fill="#00add8"/);
    assert.match(
      renderCard(enriched, "recent", resolveTheme(theme, { language: "ff8844" })),
      /<circle[^>]+fill="#ff8844"/,
    );
  }
  assert.deepEqual(resolveTheme("dark", { language: "auto" }).overrides, {});
  repo.primaryLanguage.color = null;
  const appearance = resolveTheme("midnight");
  assert.match(
    renderCard(enriched, "recent", appearance),
    new RegExp(`<circle[^>]+fill="${appearance.colors.language}"`),
  );
  const gallery = renderGallery(appearance);
  assert.match(gallery, /name="language" value="auto"/);
});
