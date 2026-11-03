import type { Repository } from "../src/collector/collection-helpers.ts";
import type { SnapshotInput } from "../src/collector/aggregate.ts";

export const fixtureTo = new Date("2026-10-26T07:15:00Z");
export const fixtureFrom = "2025-10-26T07:15:00.000Z";
export function publicRepository(id: string, nameWithOwner: string, isFork = false): Repository {
  return {
    id,
    nameWithOwner,
    visibility: "PUBLIC",
    isFork,
    owner: { login: nameWithOwner.split("/")[0] },
  };
}

export function snapshotInput(): SnapshotInput {
  const own = publicRepository("own", "Pugma/demo");
  const archive = { ...publicRepository("archive", "Pugma/archive"), isArchived: true };
  const profile = publicRepository("profile", "Pugma/Pugma");
  const ownFork = publicRepository("own-fork", "Pugma/fork", true);
  const core = publicRepository("core", "org/core");
  const commitOnly = publicRepository("commit-only", "org/commit-only");
  const mergeOnly = publicRepository("merge-only", "org/merge-only");
  const externalFork = publicRepository("external-fork", "org/fork", true);
  const oldReview = {
    repository: core,
    pullRequestId: "shared-pr",
    reviewId: "old-review",
    occurredAt: "2025-06-01T00:00:00Z",
    submittedAt: "2025-06-01T10:00:00Z",
  };
  const newReview = {
    repository: core,
    pullRequestId: "shared-pr",
    reviewId: "new-review",
    occurredAt: "2026-01-01T00:00:00Z",
    submittedAt: "2026-01-01T10:00:00Z",
  };
  const otherReview = { ...newReview, pullRequestId: "other-pr", reviewId: "other-review" };
  const commits = [
    { repository: own, count: 3 },
    { repository: archive, count: 1 },
    { repository: profile, count: 10 },
    { repository: ownFork, count: 20 },
    { repository: core, count: 2 },
    { repository: commitOnly, count: 50 },
  ];
  const reviews = [newReview, otherReview];
  const pr = (id: string, repository: Repository, createdAt: string, mergedAt: string | null) => ({
    id,
    repository,
    createdAt,
    mergedAt,
  });
  return {
    login: "Pugma",
    to: new Date(fixtureTo),
    updatedAt: "2026-10-26T07:16:00Z",
    years: [
      {
        from: "2025-01-01T00:00:00Z",
        to: "2025-12-31T23:59:59Z",
        totalContributions: 100,
        commits: [
          { repository: own, count: 2 },
          { repository: core, count: 4 },
        ],
        reviews: [oldReview],
      },
      {
        from: "2026-01-01T00:00:00Z",
        to: fixtureTo.toISOString(),
        totalContributions: 200,
        commits,
        reviews,
      },
    ],
    last12Months: {
      from: fixtureFrom,
      to: fixtureTo.toISOString(),
      totalContributions: 220,
      commits: structuredClone(commits),
      reviews: structuredClone(reviews),
    },
    pullRequests: [
      pr("old-created", mergeOnly, "2025-01-01T00:00:00Z", "2026-01-01T00:00:00Z"),
      pr("boundary-created", core, fixtureFrom, null),
      pr("latest-merged", core, "2026-10-01T00:00:00Z", fixtureTo.toISOString()),
      pr("own-fork-pr", ownFork, "2026-10-01T00:00:00Z", null),
      pr("future", core, "2026-10-26T07:15:01Z", "2026-10-26T07:15:01Z"),
    ],
    issues: [
      { id: "core-issue", repository: core, createdAt: fixtureFrom },
      { id: "external-fork-issue", repository: externalFork, createdAt: "2026-01-01T00:00:00Z" },
      {
        id: "own-issue-only",
        repository: publicRepository("no-commits", "Pugma/no-commits"),
        createdAt: "2026-01-01T00:00:00Z",
      },
    ],
  };
}
