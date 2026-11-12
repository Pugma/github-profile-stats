import assert from "node:assert/strict";

import { test } from "vitest";

import { sampleSnapshot } from "../../fixtures/stats.ts";
import { validateSnapshot } from "./schema.ts";
import type { Snapshot } from "./schema.ts";

test("snapshot validation accepts an absent Recent section", () => {
  const pending = sampleSnapshot();
  delete pending.recentRepositories;
  validateSnapshot(pending);
});

test("snapshot validation accepts a JSON round trip without an avatar", () => {
  const valid = sampleSnapshot();
  validateSnapshot(JSON.parse(JSON.stringify(valid)));
});

const invalidSnapshots: { name: string; change: (snapshot: Snapshot) => unknown }[] = [
  {
    name: "unknown top-level fields",
    change: (value) => ({ ...value, privateRepository: "secret/repo" }),
  },
  {
    name: "negative counters",
    change: (value) => {
      value.overview.allTime.commits = -1;
      return value;
    },
  },
  {
    name: "fractional counters",
    change: (value) => {
      value.overview.allTime.commits = 0.5;
      return value;
    },
  },
  {
    name: "My Projects rankings with increasing commit counts",
    change: (value) => {
      value.myProjects.topRepositories.reverse();
      return value;
    },
  },
  {
    name: "My Projects ranking rows with no commits",
    change: (value) => {
      value.myProjects.topRepositories = [{ ...value.myProjects.topRepositories[0], commits: 0 }];
      return value;
    },
  },
  {
    name: "OSS rankings with increasing activity counts",
    change: (value) => {
      value.oss.topRepositories.reverse();
      return value;
    },
  },
  {
    name: "OSS ranking rows without PRs, reviews or issues",
    change: (value) => {
      value.oss.topRepositories = [
        { ...value.oss.topRepositories[0], prs: 0, reviews: 0, issues: 0 },
      ];
      return value;
    },
  },
  {
    name: "Recent rows without merged PRs or reviews",
    change: (value) => {
      const recent = value.recentRepositories!;
      recent.repositories = [{ ...recent.repositories[0], mergedPullRequests: 0, reviews: 0 }];
      return value;
    },
  },
  {
    name: "duplicate Recent repositories",
    change: (value) => {
      const first = value.recentRepositories!.repositories[0];
      value.recentRepositories!.repositories = [first, { ...first }];
      return value;
    },
  },
  {
    name: "an update earlier than the snapshot period end",
    change: (value) => {
      value.updatedAt = new Date(Date.parse(value.period.to) - 1).toISOString();
      return value;
    },
  },
  {
    name: "Recent repositories with increasing activity dates",
    change: (value) => {
      const latest = value.recentRepositories!.repositories[0];
      value.recentRepositories!.repositories = [
        { ...latest, repository: "org/older", lastActivityAt: "2026-10-20T00:00:00Z" },
        latest,
      ];
      return value;
    },
  },
  {
    name: "more than five My Projects repositories",
    change: (value) => {
      value.myProjects.topRepositories = Array.from({ length: 6 }, (_, index) => ({
        repository: `org/repo-${index}`,
        commits: 1,
      }));
      return value;
    },
  },
  {
    name: "more than five OSS repositories",
    change: (value) => {
      value.oss.topRepositories = Array.from({ length: 6 }, (_, index) => ({
        repository: `org/repo-${index}`,
        prs: 1,
        reviews: 0,
        issues: 0,
        commits: 0,
      }));
      return value;
    },
  },
  {
    name: "more than five Recent repositories",
    change: (value) => {
      const latest = value.recentRepositories!.repositories[0];
      value.recentRepositories!.repositories = Array.from({ length: 6 }, (_, index) => ({
        ...latest,
        repository: `org/repo-${index}`,
      }));
      return value;
    },
  },
  {
    name: "a Recent end that differs from the snapshot period end",
    change: (value) => {
      const recent = value.recentRepositories!;
      recent.from = new Date(Date.parse(recent.from) + 1000).toISOString();
      recent.to = new Date(Date.parse(recent.to) + 1000).toISOString();
      return value;
    },
  },
  {
    name: "a Recent window shorter than 90 days",
    change: (value) => {
      const recent = value.recentRepositories!;
      recent.from = new Date(Date.parse(recent.from) + 1000).toISOString();
      return value;
    },
  },
  { name: "obsolete schema versions", change: (value) => ({ ...value, schemaVersion: 1 }) },
  {
    name: "removed individual PR details",
    change: (value) => ({ ...value, recentPullRequests: [] }),
  },
  {
    name: "removed yearly rows",
    change: (value) => ({ ...value, overview: { ...value.overview, byYear: [] } }),
  },
  {
    name: "unsafe primary-language colors",
    change: (value) => {
      value.recentRepositories!.repositories[0].primaryLanguage = {
        name: "TypeScript",
        color: "url(https://invalid)",
      };
      return value;
    },
  },
  {
    name: "activity before the Recent window",
    change: (value) => {
      const recent = value.recentRepositories!;
      recent.repositories = [
        {
          ...recent.repositories[0],
          lastActivityAt: new Date(Date.parse(recent.from) - 1).toISOString(),
        },
      ];
      return value;
    },
  },
  {
    name: "activity after the Recent window",
    change: (value) => {
      const recent = value.recentRepositories!;
      recent.repositories = [
        {
          ...recent.repositories[0],
          lastActivityAt: new Date(Date.parse(recent.to) + 1).toISOString(),
        },
      ];
      return value;
    },
  },
  {
    name: "unknown Recent row fields",
    change: (value) => {
      Object.assign(value.recentRepositories!.repositories[0], { arbitrary: true });
      return value;
    },
  },
];

test("snapshot validation accepts five repositories, tied rankings and zero reference counts", () => {
  const value = sampleSnapshot();
  value.overview.last12Months.issues = 0;
  value.myProjects.topRepositories = Array.from({ length: 5 }, (_, index) => ({
    repository: `org/repo-${index}`,
    commits: 1,
  }));
  value.oss.topRepositories = Array.from({ length: 5 }, (_, index) => ({
    repository: `org/repo-${index}`,
    prs: 1,
    reviews: 0,
    issues: 0,
    commits: 0,
  }));
  const latest = value.recentRepositories!.repositories[0];
  value.recentRepositories!.repositories = Array.from({ length: 5 }, (_, index) => ({
    ...latest,
    repository: `org/repo-${index}`,
  }));
  validateSnapshot(value);
});

test.each(["from", "to"] as const)(
  "snapshot validation accepts activity at the inclusive Recent %s boundary",
  (boundary) => {
    const value = sampleSnapshot();
    const recent = value.recentRepositories!;
    recent.repositories[0].lastActivityAt = recent[boundary];
    validateSnapshot(value);
  },
);

test.each(invalidSnapshots)("snapshot validation rejects $name", ({ change }) => {
  assert.throws(() => validateSnapshot(change(sampleSnapshot())), {
    message: "Invalid public statistics snapshot",
  });
});

test("snapshot validation accepts an embedded raster avatar data URL", () => {
  validateSnapshot({
    ...sampleSnapshot(),
    avatarDataUrl: `data:image/png;base64,${"A".repeat(16)}`,
  });
});

test.each([
  { name: "remote avatar URLs", avatarDataUrl: "https://avatars.githubusercontent.com/u/1" },
  { name: "embedded SVG avatars", avatarDataUrl: "data:image/svg+xml;base64,PHN2Zz4=" },
  { name: "invalid base64", avatarDataUrl: "data:image/png;base64,<script>" },
  { name: "oversized avatars", avatarDataUrl: `data:image/png;base64,${"A".repeat(90_000)}` },
])("snapshot validation rejects $name", ({ avatarDataUrl }) => {
  assert.throws(() => validateSnapshot({ ...sampleSnapshot(), avatarDataUrl }), {
    message: "Invalid public statistics snapshot",
  });
});
