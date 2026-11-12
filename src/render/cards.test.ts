import assert from "node:assert/strict";
import { test } from "vitest";
import { cardNames, renderCard, renderGallery, renderPendingCard } from "./cards.tsx";
import { buildSnapshot } from "../collector/aggregate.ts";
import { snapshotInput } from "../../fixtures/snapshot.ts";
import { estimateTextWidth } from "./text.ts";
import { svgElements, svgGroup, svgText } from "../../fixtures/svg.ts";

const snapshot = buildSnapshot(snapshotInput());

test.each(cardNames)("%s uses a 360 px layout at its original height", (name) => {
  const empty = structuredClone(snapshot);
  empty.myProjects.topRepositories = [];
  empty.oss.topRepositories = [];
  empty.recentRepositories!.repositories = [];
  for (const svg of [
    renderCard(snapshot, name),
    renderCard(empty, name),
    renderPendingCard(name),
  ]) {
    const { width, height, viewBox } = svgElements(svg, "svg")[0].attributes;
    const [, , layoutWidth, layoutHeight] = viewBox.split(" ").map(Number);
    assert.equal(Number(width), 360);
    assert.equal(layoutWidth, 360);
    assert.equal(Number(height), layoutHeight);
  }
  assert.equal(svgHeight(renderPendingCard(name)), 116);
});

test.each(cardNames)("%s renders a static SVG with a data update time", (name) => {
  const svg = renderCard(snapshot, name);
  assert.match(svg, /^<\?xml[^>]+>\n<svg/);
  assert.match(svg, /xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(svg, /Last updated: 2026-10-26 07:16 UTC/);
  assert.doesNotMatch(svg, /<script|foreignObject|onload=|<iframe/);
  assert.doesNotMatch(svg, /<image(?![^>]*href="data:image\/)/);
});

test("repository descriptions escape markup and ampersands", () => {
  const malicious = structuredClone(snapshot);
  malicious.recentRepositories!.repositories[0].description =
    "</text><script>alert(1)</script> & 日本語";
  const svg = renderCard(malicious, "recent");
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;/);
  assert.match(svg, /&amp;/);
});

test("long repository names are shortened with an ellipsis and clipped within their columns", () => {
  const input = structuredClone(snapshot);
  const repository = "WWWWWWWWWW/" + "W".repeat(100);
  input.myProjects.topRepositories[0].repository = repository;
  input.oss.topRepositories[0].repository = repository;
  input.recentRepositories!.repositories[0].repository = repository;
  for (const name of ["projects", "oss", "recent"] as const) {
    const svg = renderCard(input, name);
    const label = svgElements(svg, "text").find((element) => element.text.startsWith("WWWW"));
    assert.ok(label, `${name}: repository label is present`);
    const clipId = label.attributes["clip-path"].match(/^url\(#(.+)\)$/)?.[1];
    const clip = svgElements(svg, "clipPath").find((element) => element.attributes.id === clipId);
    assert.ok(clip, `${name}: repository label has a clip`);
    const rectangle = svgElements(svg.slice(clip.index), "rect")[0];
    assert.equal(rectangle.attributes.x, label.attributes.x, `${name}: clipping starts at label`);
    const shown = label.text;
    assert.ok(shown.endsWith("…"), `${name}: ${shown}`);
    assert.ok(repository.startsWith(shown.slice(0, -1)));
    const width = Number(rectangle.attributes.width);
    const size = Number(label.attributes["font-size"]);
    assert.ok(estimateTextWidth(shown, size) <= width, `${name}: ellipsis must fit the column`);
  }
});

test("empty repository rankings display their empty states without invalid dimensions", () => {
  const empty = structuredClone(snapshot);
  empty.myProjects.topRepositories = [];
  empty.oss.topRepositories = [];
  empty.recentRepositories!.repositories = [];
  for (const name of cardNames) {
    const svg = renderCard(empty, name);
    if (name !== "overview") assert.match(svg, /No /);
    assert.doesNotMatch(svg, /NaN|Infinity/);
  }
  assert.match(renderPendingCard("overview"), /Preparing statistics/);
});

test("Recent displays repository descriptions, language and activity labels", () => {
  const enriched = structuredClone(snapshot);
  const repo = enriched.recentRepositories!.repositories[0];
  repo.description = "A small compiler";
  repo.primaryLanguage = { name: "TypeScript", color: "#3178c6" };
  const svg = renderCard(enriched, "recent");
  assert.match(svg, /A small compiler/);
  assert.match(svg, />TypeScript</);
  assert.match(svg, />Merged PRs</);
  assert.match(svg, />Reviewed PRs</);
  assert.match(svg, /Last 90 days/);
  delete enriched.recentRepositories;
  assert.match(renderCard(enriched, "recent"), /Awaiting updated collection/);
});

test("overview focuses on the two-period metrics without a yearly chart", () => {
  const svg = renderCard(snapshot, "overview");
  assert.match(svg, /Total Contributions/);
  assert.match(svg, /Last 12 Months/);
  assert.match(svg, /All Time/);
  assert.doesNotMatch(svg, /Contributions by Year|YTD/);
});

test.each([
  {
    card: "overview",
    statistics: "overview",
    last12Months: {
      totalContributions: 1101,
      commits: 102,
      pullRequests: 103,
      reviews: 104,
      issues: 105,
    },
    allTime: {
      totalContributions: 9201,
      commits: 202,
      pullRequests: 203,
      reviews: 204,
      issues: 205,
    },
    expectedRows: [
      ["Total Contributions", "1,101", "9,201"],
      ["Commits", "102", "202"],
      ["Pull Requests", "103", "203"],
      ["Reviews", "104", "204"],
      ["Issues", "105", "205"],
    ],
  },
  {
    card: "projects",
    statistics: "myProjects",
    last12Months: { commits: 3101, activeRepositories: 302 },
    allTime: { commits: 4201, activeRepositories: 402 },
    expectedRows: [
      ["Commits", "3,101", "4,201"],
      ["Active Repositories", "302", "402"],
    ],
  },
  {
    card: "oss",
    statistics: "oss",
    last12Months: {
      pullRequests: 5101,
      mergedPullRequests: 503,
      reviews: 504,
      issues: 505,
      commits: 506,
      activeRepositories: 507,
    },
    allTime: {
      pullRequests: 6201,
      mergedPullRequests: 603,
      reviews: 604,
      issues: 605,
      commits: 606,
      activeRepositories: 607,
    },
    expectedRows: [
      ["Pull Requests", "5,101", "6,201"],
      ["Merged PRs", "503", "603"],
      ["Reviews", "504", "604"],
      ["Issues", "505", "605"],
      ["Commits", "506", "606"],
      ["Active Repositories", "507", "607"],
    ],
  },
] as const)(
  "$card displays each metric under its matching period heading",
  ({ card, statistics, last12Months, allTime, expectedRows }) => {
    const input = structuredClone(snapshot);
    Object.assign(input[statistics].last12Months, last12Months);
    Object.assign(input[statistics].allTime, allTime);
    const svg = renderCard(input, card);
    const headings = ["Last 12 Months", "All Time"].map((heading) => svgText(svg, heading));
    for (const [label, recentValue, lifetimeValue] of expectedRows) {
      const metric = svgText(svg, label);
      const row = svgElements(svgGroup(svg, metric), "text");
      for (const [index, expected] of [recentValue, lifetimeValue].entries()) {
        const values = row.filter(
          (element) => element.attributes.x === headings[index].attributes.x,
        );
        assert.equal(values.length, 1, `${label}: ${headings[index].text}`);
        assert.equal(values[0].text, expected, `${label}: ${headings[index].text}`);
        assert.equal(
          values[0].attributes.y,
          metric.attributes.y,
          `${label}: value stays on its row`,
        );
        assert.equal(
          values[0].attributes["text-anchor"],
          "end",
          `${label}: value is right-aligned`,
        );
      }
    }
  },
);

const svgHeight = (svg: string) => Number(svgElements(svg, "svg")[0].attributes.height);
function fiveRowProjectsHeight() {
  const input = structuredClone(snapshot);
  const [first] = input.myProjects.topRepositories;
  input.myProjects.topRepositories = [5, 4, 3, 2, 1].map((commits) => ({
    repository: `${first.repository}-${commits}`,
    commits,
  }));
  return svgHeight(renderCard(input, "projects"));
}

test("overview shows the avatar and login before the metrics at the five-row Projects height", () => {
  const input = structuredClone(snapshot);
  input.avatarDataUrl = "data:image/png;base64,iVBORw0KGgo=";
  const svg = renderCard(input, "overview");
  assert.equal(svgHeight(svg), fiveRowProjectsHeight());
  assert.equal(svgHeight(svg), 364);
  const avatar = svgElements(svg, "image")[0];
  assert.equal(avatar.attributes.href, input.avatarDataUrl);
  assert.ok(avatar.attributes["clip-path"]);
  const login = svgText(svg, "@Pugma");
  const metrics = svgText(svg, "Total Contributions");
  assert.ok(
    Number(avatar.attributes.y) + Number(avatar.attributes.height) < Number(metrics.attributes.y),
  );
  assert.ok(Number(login.attributes.y) < Number(metrics.attributes.y));
});

test("overview without an avatar shows the login initial at the same height", () => {
  const svg = renderCard(snapshot, "overview");
  assert.equal(svgHeight(svg), fiveRowProjectsHeight());
  assert.doesNotMatch(svg, /<image/);
  assert.match(svg, />P<\/text>/);
  assert.match(svg, />@Pugma</);
});

test("Overview background bars compare period shares rather than absolute counts", () => {
  const input = structuredClone(snapshot);
  input.overview.last12Months = {
    totalContributions: 100,
    commits: 20,
    pullRequests: 9,
    reviews: 0,
    issues: 0,
  };
  input.overview.allTime = {
    totalContributions: 1000,
    commits: 100,
    pullRequests: 10,
    reviews: 10,
    issues: 0,
  };
  const svg = renderCard(input, "overview");
  const bars = svgElements(svg, "rect")
    .filter((element) => element.attributes.opacity === "0.18")
    .map((element) => Number(element.attributes.width));
  assert.equal(bars.length, 5);
  assert.equal(bars[2], Math.max(...bars));
  assert.equal(Math.max(...bars), 360 * 0.7);
  assert.ok(Math.abs(bars[0] / bars[2] - 0.1 / 0.9) < 1e-10);
  assert.ok(Math.abs(bars[1] / bars[2] - 0.2 / 0.9) < 1e-10);
  assert.equal(bars[3], 0);
  assert.equal(bars[4], 0);
  assert.match(svg, /90\.0% of All Time/);
  assert.match(svg, /share unavailable/);
  assert.doesNotMatch(svg, /NaN|Infinity/);
  for (const key of Object.keys(
    input.overview.last12Months,
  ) as (keyof typeof input.overview.last12Months)[]) {
    input.overview.last12Months[key] = 0;
    input.overview.allTime[key] = 0;
  }
  assert.doesNotMatch(renderCard(input, "overview"), /NaN|Infinity/);
});

test("OSS displays each repository's PR, review, issue and commit counts in column order", () => {
  const input = structuredClone(snapshot);
  input.oss.topRepositories = [
    { repository: "org/first", prs: 101, reviews: 202, issues: 303, commits: 404 },
    { repository: "org/second", prs: 11, reviews: 22, issues: 33, commits: 44 },
  ];
  const svg = renderCard(input, "oss");
  for (const repository of input.oss.topRepositories) {
    const title = svgElements(svg, "title").find((element) =>
      element.text.startsWith(`${repository.repository}:`),
    );
    assert.ok(title);
    const row = svgGroup(svg, title);
    const values = svgElements(row, "text")
      .filter((element) => element.attributes["text-anchor"] === "end")
      .sort((left, right) => Number(left.attributes.x) - Number(right.attributes.x));
    assert.deepEqual(
      values.map((element) => element.text),
      [repository.prs, repository.reviews, repository.issues, repository.commits].map(String),
    );
    assert.ok(values.every((element) => element.attributes.y === values[0].attributes.y));
  }
});

test("gallery references only the four same-origin card URLs", () => {
  const html = renderGallery();
  for (const name of cardNames) assert.ok(html.includes(`src="/${name}.svg?theme=light"`));
  assert.doesNotMatch(html, /<script|https:\/\//);
});

test("gallery displays cards at 360 px wide with responsive height", () => {
  const html = renderGallery();
  const images = svgElements(html, "img");
  assert.equal(images.length, cardNames.length);
  assert.ok(images.every((image) => image.attributes.width === "360"));
  assert.match(html, /article\{[^}]*max-width:360px/);
  assert.match(html, /img\{[^}]*width:100%;height:auto/);
});

test("gallery links and theme forms stay under an alternate card path", () => {
  const html = renderGallery(undefined, "/cards/");
  for (const name of cardNames) assert.ok(html.includes(`src="/cards/${name}.svg?theme=light"`));
  assert.match(html, /action="\/cards\/"/);
  assert.match(html, /href="\/cards\/\?theme=light"/);
});

test("slash-separated counts keep their separators in one column across rows", () => {
  const input = structuredClone(snapshot);
  input.oss.topRepositories = [
    { repository: "a/one", prs: 18, reviews: 89, issues: 0, commits: 18 },
    { repository: "a/two", prs: 1, reviews: 73, issues: 0, commits: 74 },
    { repository: "a/three", prs: 1, reviews: 4, issues: 2, commits: 55 },
  ];
  const recent = input.recentRepositories!;
  recent.repositories = [
    { ...recent.repositories[0], repository: "a/one", mergedPullRequests: 12, reviews: 3 },
    { ...recent.repositories[0], repository: "a/two", mergedPullRequests: 1, reviews: 145 },
  ];
  for (const [name, columns, rows] of [
    ["oss", 2, input.oss.topRepositories.length],
    ["recent", 1, recent.repositories.length],
  ] as const) {
    const separators = svgElements(renderCard(input, name), "text").filter(
      (element) => element.text === "/" && element.attributes["text-anchor"] === "middle",
    );
    assert.equal(separators.length, columns * rows, name);
    assert.equal(new Set(separators.map((element) => element.attributes.x)).size, columns, name);
  }
});

test("OSS ranking columns line up under the Last 12 Months and All Time columns", () => {
  const input = structuredClone(snapshot);
  input.oss.topRepositories = [
    { repository: "a/one", prs: 101, reviews: 202, issues: 303, commits: 404 },
  ];
  const svg = renderCard(input, "oss");
  for (const [content, header] of [
    ["303", "Last 12 Months"],
    ["PRs / Reviews / Issues", "Last 12 Months"],
    ["404", "All Time"],
  ]) {
    const value = svgText(svg, content).attributes;
    const heading = svgText(svg, header).attributes;
    assert.equal(value["text-anchor"], "end", content);
    assert.equal(value.x, heading.x, content);
  }
});

test("card layout heights stay on the 4 px grid", () => {
  for (const name of cardNames) {
    for (const svg of [renderCard(snapshot, name), renderPendingCard(name)]) {
      const layoutHeight = Number(svgElements(svg, "svg")[0].attributes.viewBox.split(" ")[3]);
      assert.equal(layoutHeight % 4, 0, name);
    }
  }
});

test("metrics without background bars read as plain lines, tighter than bar rows", () => {
  const rowPitch = (svg: string, labels: string[]) => {
    const ys = labels.map((label) => Number(svgText(svg, label).attributes.y));
    return ys[1] - ys[0];
  };
  assert.equal(rowPitch(renderCard(snapshot, "oss"), ["Pull Requests", "Merged PRs"]), 24);
  assert.equal(rowPitch(renderCard(snapshot, "projects"), ["Commits", "Active Repositories"]), 24);
  assert.equal(rowPitch(renderCard(snapshot, "overview"), ["Total Contributions", "Commits"]), 28);
});

function fiveRowCards() {
  const input = structuredClone(snapshot);
  const [external] = input.oss.topRepositories;
  input.oss.topRepositories = [5, 4, 3, 2, 1].map((prs) => ({
    ...external,
    repository: `a/oss-${prs}`,
    prs,
  }));
  const recent = input.recentRepositories!;
  const [entry] = recent.repositories;
  recent.repositories = [0, 1, 2, 3, 4].map((index) => ({
    ...entry,
    repository: `a/recent-${index}`,
    description: index % 2 ? null : "Description",
  }));
  return input;
}

test("Recent centres each entry's text block and counts on the same row centre", () => {
  const svg = renderCard(fiveRowCards(), "recent");
  const labels = svgElements(svg, "text");
  const ys = (prefix: string) =>
    labels
      .filter((element) => element.text.startsWith(prefix))
      .map((element) => Number(element.attributes.y));
  const names = ys("a/recent-");
  const language = ys("Not specified");
  const centres = labels
    .filter((element) => element.text === "/" && element.attributes["text-anchor"] === "middle")
    .map((element) => Number(element.attributes.y));
  assert.equal(centres.length, 5);
  assert.equal(names.length, 5);
  assert.equal(language.length, 5);
  const pitches = centres.slice(1).map((y, index) => y - centres[index]);
  assert.equal(new Set(pitches).size, 1, "every entry keeps the three-line height");
  for (const [index, centre] of centres.entries()) {
    // The block from the name box top (16 px) to the language box bottom (12 px) is centred.
    const blockTop = names[index] - 8;
    const blockBottom = language[index] + 6;
    assert.equal(centre - blockTop, blockBottom - centre, `entry ${index}`);
  }
  const secondRow = svgGroup(svg, svgText(svg, "a/recent-1"));
  assert.equal(
    svgElements(secondRow, "text").length,
    6,
    "an entry without a description has only its name, two counts, separator, language and date",
  );
});

test("OSS and Recent are equally tall with five entries", () => {
  const input = fiveRowCards();
  assert.equal(svgHeight(renderCard(input, "oss")), svgHeight(renderCard(input, "recent")));
});

test("the longest bar spans 70% of the card width on every card", () => {
  const input = fiveRowCards();
  for (const name of ["overview", "projects", "oss"] as const) {
    const svg = renderCard(input, name);
    const bars = svgElements(svg, "rect").filter((element) => element.attributes.height === "24");
    assert.ok(bars.length > 0, name);
    const left = Math.min(...bars.map((element) => Number(element.attributes.x)));
    const right = Math.max(
      ...bars.map((element) => Number(element.attributes.x) + Number(element.attributes.width)),
    );
    assert.ok(Math.abs(right - left - 360 * 0.7) < 1e-9, name);
  }
});

test("Recent uses more description width when its right-aligned counts are shorter", () => {
  const snapshot = buildSnapshot(snapshotInput());
  const repo = snapshot.recentRepositories!.repositories[0];
  repo.description = "A repository with a detailed description ".repeat(5);
  const visibleDescription = () => {
    const svg = renderCard(snapshot, "recent");
    const description = svgElements(svg, "text").find(
      (element) => element.attributes["clip-path"] === "url(#recent-description-0)",
    );
    assert.ok(description);
    assert.ok(description.text.startsWith("A repository"));
    return description.text;
  };
  const shortCounts = visibleDescription();
  repo.mergedPullRequests = 123456;
  repo.reviews = 123456;
  const longCounts = visibleDescription();
  assert.ok(shortCounts.length > longCounts.length);
  assert.ok(shortCounts.endsWith("…") && longCounts.endsWith("…"));
});
