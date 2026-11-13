import { validateSnapshot } from "../stats/schema.ts";
import type { ExternalCounts, OverviewCounts, ProjectCounts, Snapshot } from "../stats/schema.ts";
import type { Repository } from "./collection-helpers.ts";
import { classify, twelveMonthsAgo } from "./collection-helpers.ts";

export type CommitCount = { repository: Repository; count: number };
export type ReviewContribution = {
  reviewId: string;
  pullRequestId: string;
  occurredAt: string;
  submittedAt: string;
  repository: Repository;
};
export type AuthoredItem = { id: string; createdAt: string; repository: Repository };
export type PullRequest = AuthoredItem & {
  mergedAt: string | null;
};
export type ContributionPeriod = {
  from: string;
  to: string;
  totalContributions: number;
  commits: CommitCount[];
  reviews: ReviewContribution[];
};
export type SnapshotInput = {
  login: string;
  to: Date;
  updatedAt: string;
  years: ContributionPeriod[];
  last12Months: ContributionPeriod;
  pullRequests: PullRequest[];
  issues: AuthoredItem[];
};

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const publicRepository = (repository: Repository) => repository.visibility === "PUBLIC";
const inPeriod = (date: string, from: string, to: string) =>
  Date.parse(date) >= Date.parse(from) && Date.parse(date) <= Date.parse(to);

function distinctReviews(reviews: ReviewContribution[]) {
  const latest = new Map<string, ReviewContribution>();
  for (const review of reviews) {
    if (!publicRepository(review.repository)) continue;
    const previous = latest.get(review.pullRequestId);
    if (!previous || Date.parse(review.submittedAt) > Date.parse(previous.submittedAt))
      latest.set(review.pullRequestId, review);
  }
  return [...latest.values()];
}

function aggregatePeriod(input: SnapshotInput, period: ContributionPeriod) {
  const commits = period.commits.filter((row) => publicRepository(row.repository) && row.count > 0);
  const reviews = distinctReviews(period.reviews);
  const prs = input.pullRequests.filter(
    (pr) => publicRepository(pr.repository) && inPeriod(pr.createdAt, period.from, period.to),
  );
  const merged = input.pullRequests.filter(
    (pr) =>
      publicRepository(pr.repository) &&
      pr.mergedAt &&
      inPeriod(pr.mergedAt, period.from, period.to),
  );
  const issues = input.issues.filter(
    (issue) =>
      publicRepository(issue.repository) && inPeriod(issue.createdAt, period.from, period.to),
  );
  const overview: OverviewCounts = {
    totalContributions: period.totalContributions,
    commits: commits.reduce((sum, row) => sum + row.count, 0),
    pullRequests: prs.length,
    reviews: reviews.length,
    issues: issues.length,
  };
  const projectRepositories = new Map<string, { repository: string; commits: number }>();
  for (const row of commits) {
    if (classify(row.repository, input.login) !== "projects") continue;
    const previous = projectRepositories.get(row.repository.id);
    projectRepositories.set(row.repository.id, {
      repository: row.repository.nameWithOwner,
      commits: (previous?.commits ?? 0) + row.count,
    });
  }
  const projects: ProjectCounts = {
    commits: [...projectRepositories.values()].reduce((sum, row) => sum + row.commits, 0),
    activeRepositories: projectRepositories.size,
  };
  const externalRepositories = new Map<
    string,
    { repository: string; prs: number; reviews: number; issues: number; commits: number }
  >();
  function external(repository: Repository) {
    if (classify(repository, input.login) !== "external") return null;
    let row = externalRepositories.get(repository.id);
    if (!row) {
      row = { repository: repository.nameWithOwner, prs: 0, reviews: 0, issues: 0, commits: 0 };
      externalRepositories.set(repository.id, row);
    }
    return row;
  }
  for (const commit of commits) {
    const row = external(commit.repository);
    if (row) row.commits += commit.count;
  }
  for (const pr of prs) {
    const row = external(pr.repository);
    if (row) row.prs++;
  }
  for (const review of reviews) {
    const row = external(review.repository);
    if (row) row.reviews++;
  }
  for (const issue of issues) {
    const row = external(issue.repository);
    if (row) row.issues++;
  }
  const externalRows = [...externalRepositories.values()];
  const sum = (key: "prs" | "reviews" | "issues" | "commits") =>
    externalRows.reduce((sum, row) => sum + row[key], 0);
  const oss: ExternalCounts = {
    pullRequests: sum("prs"),
    mergedPullRequests: merged.filter((pr) => classify(pr.repository, input.login) === "external")
      .length,
    reviews: sum("reviews"),
    issues: sum("issues"),
    commits: sum("commits"),
    activeRepositories: externalRepositories.size,
  };
  const activity = (row: (typeof externalRows)[number]) => row.prs + row.reviews + row.issues;
  return {
    overview,
    projects,
    oss,
    projectTop: [...projectRepositories.values()]
      .sort((a, b) => b.commits - a.commits || compare(a.repository, b.repository))
      .slice(0, 5),
    externalTop: externalRows
      .filter((row) => activity(row) > 0)
      .sort((a, b) => activity(b) - activity(a) || compare(a.repository, b.repository))
      .slice(0, 5),
  };
}

export function buildSnapshot(input: SnapshotInput) {
  if (!input.years.length) throw new Error("Incomplete yearly contribution coverage");
  const allTimePeriod: ContributionPeriod = {
    from: input.years[0].from,
    to: input.to.toISOString(),
    totalContributions: input.years.reduce((sum, year) => sum + year.totalContributions, 0),
    commits: input.years.flatMap((year) => year.commits),
    reviews: input.years.flatMap((year) => year.reviews),
  };
  const allTime = aggregatePeriod(input, allTimePeriod);
  const last12Months = aggregatePeriod(input, input.last12Months);
  const recentFrom = new Date(input.to.getTime() - 90 * 86400_000).toISOString();
  const recent = new Map<
    string,
    NonNullable<Snapshot["recentRepositories"]>["repositories"][number]
  >();
  function recentRepository(repository: Repository, at: string) {
    if (!publicRepository(repository) || !inPeriod(at, recentFrom, input.to.toISOString()))
      return null;
    let row = recent.get(repository.id);
    if (!row) {
      row = {
        repository: repository.nameWithOwner,
        mergedPullRequests: 0,
        reviews: 0,
        lastActivityAt: at,
        description: null,
        primaryLanguage: null,
      };
      recent.set(repository.id, row);
    }
    if (Date.parse(at) > Date.parse(row.lastActivityAt)) row.lastActivityAt = at;
    return row;
  }
  for (const pr of input.pullRequests) {
    if (!pr.mergedAt) continue;
    const row = recentRepository(pr.repository, pr.mergedAt);
    if (row) row.mergedPullRequests++;
  }
  for (const review of distinctReviews(input.last12Months.reviews)) {
    const row = recentRepository(review.repository, review.submittedAt);
    if (row) row.reviews++;
  }
  const snapshot = {
    schemaVersion: 2,
    user: input.login,
    updatedAt: input.updatedAt,
    period: { from: twelveMonthsAgo(input.to).toISOString(), to: input.to.toISOString() },
    coverage: {
      totalContributions: "public-only",
      reviews: "latest-review-per-pr-in-period",
      allTimeFrom: allTimePeriod.from,
    },
    overview: {
      last12Months: last12Months.overview,
      allTime: allTime.overview,
    },
    myProjects: {
      last12Months: last12Months.projects,
      allTime: allTime.projects,
      topRepositories: last12Months.projectTop,
    },
    oss: {
      last12Months: last12Months.oss,
      allTime: allTime.oss,
      topRepositories: last12Months.externalTop,
    },
    recentRepositories: {
      from: recentFrom,
      to: input.to.toISOString(),
      repositories: [...recent.values()]
        .sort(
          (a, b) =>
            Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt) ||
            compare(a.repository, b.repository),
        )
        .slice(0, 5),
    },
  } satisfies Snapshot;
  validateSnapshot(snapshot);
  return snapshot;
}
