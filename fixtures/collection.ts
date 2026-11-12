import assert from "node:assert/strict";

import { publicRepository, snapshotInput } from "./snapshot.ts";

type Fault =
  | "private-access"
  | "private-commit"
  | "restricted-review"
  | "private-review"
  | "private-authored"
  | "partial"
  | "restricted"
  | "truncated-commits"
  | "commit-total-mismatch"
  | "truncated-reviews"
  | "truncated-search"
  | "duplicate-review"
  | "search-overflow"
  | "earlier-authored"
  | "private-metadata"
  | "avatar-unavailable";
const avatarPng = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  ),
  (character) => character.charCodeAt(0),
);
export function fixtureFetch(fault?: Fault): typeof fetch {
  const input = snapshotInput();
  if (fault === "earlier-authored")
    input.pullRequests.push({
      id: "early-fork-pr",
      repository: publicRepository("early-fork", "Pugma/early-fork", true),
      createdAt: "2024-06-01T00:00:00Z",
      mergedAt: null,
    });
  return async (url, init) => {
    if (String(url).startsWith("https://avatars.githubusercontent.com/")) {
      if (new Headers(init?.headers).has("Authorization"))
        throw new Error("Token sent to avatar host");
      return fault === "avatar-unavailable"
        ? new Response(null, { status: 503 })
        : new Response(avatarPng, { headers: { "Content-Type": "image/png" } });
    }
    if (String(url).includes("/user/repos"))
      return Response.json(fault === "private-access" ? [{ private: true }] : []);
    const { query, variables } = JSON.parse(String(init?.body)) as {
      query: string;
      variables: { from?: string; to?: string; query?: string };
    };
    if (fault === "partial")
      return Response.json({ data: {}, errors: [{ message: "secret/repo" }] });
    let data: object;
    if (query.includes("contributionYears"))
      data = {
        user: {
          createdAt: fault === "earlier-authored" ? "2024-01-01T00:00:00Z" : "2025-05-01T10:00:00Z",
          avatarUrl: "https://avatars.githubusercontent.com/u/1?s=128&v=4",
          contributionsCollection: { contributionYears: [2026, 2025] },
        },
      };
    else if (query.includes("commitContributionsByRepository")) {
      const period = variables.to?.startsWith("2024")
        ? { commits: [], reviews: [], totalContributions: 0 }
        : variables.to?.startsWith("2025")
          ? input.years[0]
          : variables.from?.startsWith("2026")
            ? input.years[1]
            : input.last12Months;
      const nodes = period.reviews.map((review) => ({
        repository: review.repository,
        occurredAt: review.occurredAt,
        isRestricted: false,
        pullRequest: { id: review.pullRequestId },
        pullRequestReview: { id: review.reviewId, submittedAt: review.submittedAt },
      }));
      if (fault === "duplicate-review") nodes.push(nodes[0]);
      if (fault === "restricted-review" && nodes[0]) nodes[0].isRestricted = true;
      if (fault === "private-review" && nodes[0])
        nodes[0].repository = { ...nodes[0].repository, visibility: "PRIVATE" };
      const commits = period.commits.map((row) => ({
        repository: row.repository,
        contributions: { totalCount: row.count },
      }));
      if (fault === "private-commit" && commits[0])
        commits[0].repository = { ...commits[0].repository, visibility: "PRIVATE" };
      data = {
        user: {
          contributionsCollection: {
            contributionCalendar: { totalContributions: period.totalContributions },
            restrictedContributionsCount: fault === "restricted" ? 1 : 0,
            totalCommitContributions:
              period.commits.reduce((sum, row) => sum + row.count, 0) +
              (fault === "commit-total-mismatch" ? 1 : 0),
            totalPullRequestReviewContributions: nodes.length,
            totalRepositoriesWithContributedCommits:
              period.commits.length + (fault === "truncated-commits" ? 1 : 0),
            commitContributionsByRepository: commits,
            pullRequestReviewContributions: {
              totalCount: nodes.length,
              nodes: fault === "truncated-reviews" ? nodes.slice(0, -1) : nodes,
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      };
    } else if (query.includes("primaryLanguage")) {
      data = {
        repo0: {
          visibility: fault === "private-metadata" ? "PRIVATE" : "PUBLIC",
          description: "Public repository description",
          primaryLanguage: { name: "TypeScript", color: "#3178c6" },
        },
      };
    } else {
      const items = variables.query?.includes("is:pr") ? input.pullRequests : input.issues;
      const nodes = items.filter(
        (item) =>
          Date.parse(item.createdAt) >=
            Date.parse(variables.query!.match(/created:(.*?)\.\./)![1]) &&
          Date.parse(item.createdAt) <= Date.parse(variables.query!.match(/\.\.(\S+)/)![1]),
      );
      if (fault === "private-authored" && nodes[0])
        nodes[0] = { ...nodes[0], repository: { ...nodes[0].repository, visibility: "PRIVATE" } };
      data = {
        search: {
          issueCount: fault === "search-overflow" ? 1001 : nodes.length,
          nodes: fault === "truncated-search" ? nodes.slice(0, -1) : nodes,
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      };
    }
    return Response.json({ data: { ...data, rateLimit: { cost: 1, remaining: 4900 } } });
  };
}

export function paginatedFixture() {
  const base = fixtureFetch();
  const reviews = new Map<string, unknown[]>();
  function page(nodes: unknown[], after: string | null, kind: string) {
    let offset = 0;
    if (after !== null) {
      assert.match(after, new RegExp(`^${kind}-[1-9]\\d*$`));
      offset = Number(after.slice(kind.length + 1));
      assert.ok(offset < nodes.length, "cursor must point to a remaining page");
    }
    const end = offset + 1;
    return {
      totalCount: nodes.length,
      nodes: nodes.slice(offset, end),
      pageInfo: {
        hasNextPage: end < nodes.length,
        endCursor: end < nodes.length ? `${kind}-${end}` : null,
      },
    };
  }
  const fetcher: typeof fetch = async (url, init) => {
    if (!String(url).endsWith("/graphql")) return base(url, init);
    const { query, variables } = JSON.parse(String(init?.body)) as {
      query: string;
      variables: { from?: string; to?: string; query?: string; after: string | null };
    };
    const key = `${variables.from}/${variables.to}`;
    if (
      query.includes("pullRequestReviewContributions") &&
      !query.includes("commitContributionsByRepository")
    ) {
      assert.ok(reviews.has(key), "review continuation must use the original period");
      return Response.json({
        data: {
          user: {
            contributionsCollection: {
              pullRequestReviewContributions: page(reviews.get(key)!, variables.after, "review"),
            },
          },
          rateLimit: { cost: 1, remaining: 4900 },
        },
      });
    }
    const response = await base(url, init);
    const envelope = (await response.json()) as {
      data: {
        user?: {
          contributionsCollection: { pullRequestReviewContributions: ReturnType<typeof page> };
        };
        search?: {
          nodes: unknown[];
          issueCount: number;
          pageInfo: ReturnType<typeof page>["pageInfo"];
        };
      };
    };
    if (query.includes("commitContributionsByRepository")) {
      const collection = envelope.data.user!.contributionsCollection;
      reviews.set(key, collection.pullRequestReviewContributions.nodes);
      collection.pullRequestReviewContributions = page(
        reviews.get(key)!,
        variables.after,
        "review",
      );
    } else if (envelope.data.search) {
      const kind = variables.query!.includes("is:pr") ? "pr" : "issue";
      const result = page(envelope.data.search.nodes, variables.after, kind);
      envelope.data.search = {
        issueCount: result.totalCount,
        nodes: result.nodes,
        pageInfo: result.pageInfo,
      };
    }
    return Response.json(envelope);
  };
  return { fetcher };
}
