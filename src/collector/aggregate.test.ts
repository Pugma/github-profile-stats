import assert from "node:assert/strict";
import { test } from "vitest";
import { buildSnapshot } from "./aggregate.ts";
import { publicRepository, snapshotInput } from "../../fixtures/snapshot.ts";

test("snapshots omit unused yearly rows and individual pull request details", () => {
  const result = buildSnapshot(snapshotInput());
  assert.equal(Object.hasOwn(result.overview, "byYear"), false);
  assert.equal(Object.hasOwn(result, "recentPullRequests"), false);
});

test("snapshot includes both periods and sums yearly calendar totals", () => {
  const result = buildSnapshot(snapshotInput());
  assert.equal(result.overview.last12Months.totalContributions, 220);
  assert.equal(result.overview.allTime.totalContributions, 300);
  assert.equal(result.coverage.totalContributions, "public-only");
});

test("changing Last 12 Months activity does not change All Time totals", () => {
  const input = snapshotInput();
  input.last12Months.commits[0].count += 1;
  const result = buildSnapshot(input);
  assert.equal(result.myProjects.last12Months.commits, 5);
  assert.equal(result.myProjects.allTime.commits, 6);
});

test("My Projects uses commits only, includes archived repositories, excludes own forks and profile", () => {
  const result = buildSnapshot(snapshotInput());
  assert.deepEqual(result.myProjects.last12Months, { commits: 4, activeRepositories: 2 });
  assert.deepEqual(result.myProjects.allTime, { commits: 6, activeRepositories: 2 });
  assert.deepEqual(result.myProjects.topRepositories, [
    { repository: "Pugma/demo", commits: 3 },
    { repository: "Pugma/archive", commits: 1 },
  ]);
});

test("All Time counts each reviewed PR once across yearly collections", () => {
  const result = buildSnapshot(snapshotInput());
  assert.equal(result.overview.allTime.reviews, 2);
  assert.equal(result.overview.last12Months.reviews, 2);
  assert.equal(result.oss.allTime.reviews, 2);
});

test("external activity union uses repository IDs and excludes merge-only activity", () => {
  const result = buildSnapshot(snapshotInput());
  assert.equal(result.oss.last12Months.activeRepositories, 3);
  assert.equal(result.oss.allTime.activeRepositories, 4);
  assert.equal(result.oss.last12Months.pullRequests, 2);
  assert.equal(result.oss.last12Months.mergedPullRequests, 2);
  assert.equal(result.oss.allTime.pullRequests, 3);
});

test("external ranking includes only PRs/reviews/issues, with commits as a reference", () => {
  const result = buildSnapshot(snapshotInput());
  assert.deepEqual(result.oss.topRepositories, [
    { repository: "org/core", prs: 2, reviews: 2, issues: 1, commits: 2 },
    { repository: "org/fork", prs: 0, reviews: 0, issues: 1, commits: 0 },
  ]);
  assert.equal(result.oss.last12Months.commits, 52);
});

test("a commit-only external repository counts as active but is excluded from the ranking", () => {
  const input = snapshotInput();
  input.last12Months.commits = [
    { repository: publicRepository("commit-only", "org/commit-only"), count: 1 },
  ];
  input.last12Months.reviews = [];
  input.pullRequests = [];
  input.issues = [];
  const result = buildSnapshot(input);
  assert.equal(result.oss.last12Months.activeRepositories, 1);
  assert.deepEqual(result.oss.topRepositories, []);
});

test("Last 12 Months includes authored activity at its start but excludes earlier activity", () => {
  const input = snapshotInput();
  const repository = publicRepository("boundary", "org/boundary");
  const from = "2025-10-26T07:15:00.000Z";
  const before = "2025-10-26T07:14:59.999Z";
  input.pullRequests = [
    { id: "at-start-pr", repository, createdAt: from, mergedAt: null },
    { id: "before-start-pr", repository, createdAt: before, mergedAt: null },
  ];
  input.issues = [
    { id: "at-start-issue", repository, createdAt: from },
    { id: "before-start-issue", repository, createdAt: before },
  ];
  const result = buildSnapshot(input);
  assert.equal(result.overview.last12Months.pullRequests, 1);
  assert.equal(result.overview.last12Months.issues, 1);
  assert.equal(result.overview.allTime.pullRequests, 2);
  assert.equal(result.overview.allTime.issues, 2);
});

test("merged timestamps drive Recent and Merged PRs even when PR creation is outside the period", () => {
  const input = snapshotInput();
  input.pullRequests[0].mergedAt = input.to.toISOString();
  const result = buildSnapshot(input);
  assert.equal(result.oss.last12Months.mergedPullRequests, 2);
  assert.equal(
    result.recentRepositories!.repositories.find((row) => row.repository === "org/merge-only")
      ?.mergedPullRequests,
    1,
  );
  assert.equal(result.overview.last12Months.pullRequests, 3);
});

test("non-public authored activity never reaches cards or Recent", () => {
  const input = snapshotInput();
  const baseline = buildSnapshot(input);
  input.pullRequests.push({
    ...input.pullRequests[0],
    id: "private-pr",
    repository: { ...publicRepository("private-id", "secret/repo"), visibility: "PRIVATE" },
    createdAt: "2026-10-01T00:00:00Z",
    mergedAt: input.to.toISOString(),
  });
  assert.deepEqual(buildSnapshot(input), baseline);
});

test.each(["oldest-first", "newest-first"])(
  "Recent uses the latest review of a PR when reviews straddle its 90-day window (%s)",
  (order) => {
    const input = snapshotInput();
    input.pullRequests = [];
    const repository = publicRepository("review-only", "org/review-only");
    const from = new Date(input.to.getTime() - 90 * 86400_000).toISOString();
    const before = new Date(Date.parse(from) - 1).toISOString();
    const latest = "2026-10-20T00:00:00Z";
    const olderReview = {
      repository,
      pullRequestId: "shared-pr",
      reviewId: "older-review",
      occurredAt: before,
      submittedAt: before,
    };
    const newerReview = { ...olderReview, reviewId: "newer-review", submittedAt: latest };
    input.last12Months.reviews =
      order === "oldest-first" ? [olderReview, newerReview] : [newerReview, olderReview];
    assert.deepEqual(buildSnapshot(input).recentRepositories!.repositories, [
      {
        repository: "org/review-only",
        mergedPullRequests: 0,
        reviews: 1,
        lastActivityAt: latest,
        description: null,
        primaryLanguage: null,
      },
    ]);
  },
);

test("empty activity produces valid zeros and empty rankings", () => {
  const input = snapshotInput();
  for (const period of [...input.years, input.last12Months]) {
    period.commits = [];
    period.reviews = [];
    period.totalContributions = 0;
  }
  input.pullRequests = [];
  input.issues = [];
  const result = buildSnapshot(input);
  assert.deepEqual(result.oss.last12Months, {
    pullRequests: 0,
    mergedPullRequests: 0,
    reviews: 0,
    issues: 0,
    commits: 0,
    activeRepositories: 0,
  });
  assert.deepEqual(result.myProjects.topRepositories, []);
  assert.deepEqual(result.recentRepositories!.repositories, []);
});

test("Recent uses a 90-day window, groups by repository ID and counts reviewed PRs once", () => {
  const input = snapshotInput();
  const from = "2026-07-28T07:15:00.000Z";
  const core = input.pullRequests[1].repository;
  const review = {
    repository: core,
    pullRequestId: "reviewed-pr",
    reviewId: "r1",
    occurredAt: from,
    submittedAt: from,
  };
  input.last12Months.reviews = [
    review,
    { ...review, reviewId: "r2", submittedAt: "2026-10-20T00:00:00Z" },
  ];
  input.pullRequests.push(
    {
      ...input.pullRequests[0],
      id: "boundary",
      repository: core,
      mergedAt: from,
    },
    {
      ...input.pullRequests[0],
      id: "before",
      repository: core,
      mergedAt: new Date(Date.parse(from) - 1).toISOString(),
    },
    {
      ...input.pullRequests[0],
      id: "private-recent",
      repository: { ...core, id: "private", visibility: "PRIVATE" },
      mergedAt: from,
    },
  );
  const recent = buildSnapshot(input).recentRepositories!;
  assert.equal(recent.from, from);
  assert.equal(recent.repositories.length, 1);
  assert.equal(recent.repositories[0].repository, "org/core");
  assert.equal(recent.repositories[0].mergedPullRequests, 2);
  assert.equal(recent.repositories[0].reviews, 1);
  assert.equal(recent.repositories[0].lastActivityAt, input.to.toISOString());
});

test("Recent includes a review at its start but excludes one immediately before it", () => {
  const input = snapshotInput();
  input.pullRequests = [];
  const from = "2026-07-28T07:15:00.000Z";
  const before = "2026-07-28T07:14:59.999Z";
  input.last12Months.reviews = [
    {
      repository: publicRepository("at-start", "org/at-start"),
      pullRequestId: "at-start-pr",
      reviewId: "at-start-review",
      occurredAt: from,
      submittedAt: from,
    },
    {
      repository: publicRepository("before-start", "org/before-start"),
      pullRequestId: "before-start-pr",
      reviewId: "before-start-review",
      occurredAt: before,
      submittedAt: before,
    },
  ];
  const recent = buildSnapshot(input).recentRepositories!;
  assert.equal(recent.from, from);
  assert.deepEqual(
    recent.repositories.map(({ repository, reviews }) => ({ repository, reviews })),
    [{ repository: "org/at-start", reviews: 1 }],
  );
});

test("Recent includes review-only repositories and orders by latest activity, capped at five", () => {
  const input = snapshotInput();
  input.pullRequests = [];
  input.last12Months.reviews = Array.from({ length: 7 }, (_, index) => ({
    repository: publicRepository(`review-${index}`, `org/review-${index}`),
    pullRequestId: `pr-${index}`,
    reviewId: `r-${index}`,
    occurredAt: `2026-10-${10 + index}T00:00:00Z`,
    submittedAt: `2026-10-${10 + index}T00:00:00Z`,
  }));
  const rows = buildSnapshot(input).recentRepositories!.repositories;
  assert.equal(rows.length, 5);
  assert.equal(rows[0].repository, "org/review-6");
  assert.equal(rows[0].mergedPullRequests, 0);
  assert.equal(rows[0].reviews, 1);
});
