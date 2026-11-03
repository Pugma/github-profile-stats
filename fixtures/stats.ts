import type { Snapshot } from "../src/stats/schema.ts";

// A literal keeps schema tests independent of the collector that normally produces snapshots.
export function sampleSnapshot(): Snapshot {
  return {
    schemaVersion: 2,
    user: "Pugma",
    updatedAt: "2026-10-26T07:16:00Z",
    period: {
      from: "2025-10-26T07:15:00.000Z",
      to: "2026-10-26T07:15:00.000Z",
    },
    coverage: {
      totalContributions: "public-only",
      reviews: "latest-review-per-pr-in-period",
      allTimeFrom: "2025-01-01T00:00:00Z",
    },
    overview: {
      last12Months: {
        totalContributions: 220,
        commits: 86,
        pullRequests: 3,
        reviews: 2,
        issues: 3,
      },
      allTime: {
        totalContributions: 300,
        commits: 92,
        pullRequests: 4,
        reviews: 2,
        issues: 3,
      },
    },
    myProjects: {
      last12Months: {
        commits: 4,
        activeRepositories: 2,
      },
      allTime: {
        commits: 6,
        activeRepositories: 2,
      },
      topRepositories: [
        {
          repository: "Pugma/demo",
          commits: 3,
        },
        {
          repository: "Pugma/archive",
          commits: 1,
        },
      ],
    },
    oss: {
      last12Months: {
        pullRequests: 2,
        mergedPullRequests: 2,
        reviews: 2,
        issues: 2,
        commits: 52,
        activeRepositories: 3,
      },
      allTime: {
        pullRequests: 3,
        mergedPullRequests: 2,
        reviews: 2,
        issues: 2,
        commits: 56,
        activeRepositories: 4,
      },
      topRepositories: [
        {
          repository: "org/core",
          prs: 2,
          reviews: 2,
          issues: 1,
          commits: 2,
        },
        {
          repository: "org/fork",
          prs: 0,
          reviews: 0,
          issues: 1,
          commits: 0,
        },
      ],
    },
    recentRepositories: {
      from: "2026-07-28T07:15:00.000Z",
      to: "2026-10-26T07:15:00.000Z",
      repositories: [
        {
          repository: "org/core",
          mergedPullRequests: 1,
          reviews: 0,
          lastActivityAt: "2026-10-26T07:15:00.000Z",
          description: null,
          primaryLanguage: null,
        },
      ],
    },
  };
}
