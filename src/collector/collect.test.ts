import assert from "node:assert/strict";
import { test } from "vitest";
import { collectSnapshot, collectionError } from "./collect.ts";
import type { CollectOptions } from "./collect.ts";
import { fixtureTo, publicRepository } from "../../fixtures/snapshot.ts";
import { fixtureFetch, paginatedFixture } from "../../fixtures/collection.ts";

const options = { login: "Pugma", token: "test-secret", now: fixtureTo };

test("collector returns public totals, repository metadata and an embedded avatar", async () => {
  const result = await collectSnapshot({ ...options, fetcher: fixtureFetch() });
  assert.match(result.snapshot.avatarDataUrl!, /^data:image\/png;base64,iVBORw0KGgo/);
  assert.equal(result.snapshot.coverage.allTimeFrom, "2025-01-01T00:00:00.000Z");
  assert.equal(result.snapshot.overview.allTime.totalContributions, 300);
  assert.equal(result.snapshot.oss.last12Months.mergedPullRequests, 2);
  assert.equal(
    result.snapshot.recentRepositories!.repositories[0].description,
    "Public repository description",
  );
  assert.equal(
    result.snapshot.recentRepositories!.repositories[0].primaryLanguage?.name,
    "TypeScript",
  );
  assert.doesNotMatch(JSON.stringify(result), /test-secret/);
});

test("collector follows review and authored-activity cursors and aggregates every page once", async () => {
  const { fetcher } = paginatedFixture();
  const { snapshot } = await collectSnapshot({ ...options, fetcher });
  assert.deepEqual(snapshot.overview.last12Months, {
    totalContributions: 220,
    commits: 86,
    pullRequests: 3,
    reviews: 2,
    issues: 3,
  });
  assert.deepEqual(snapshot.overview.allTime, {
    totalContributions: 300,
    commits: 92,
    pullRequests: 4,
    reviews: 2,
    issues: 3,
  });
  assert.deepEqual(snapshot.oss.topRepositories, [
    { repository: "org/core", prs: 2, reviews: 2, issues: 1, commits: 2 },
    { repository: "org/fork", prs: 0, reviews: 0, issues: 1, commits: 0 },
  ]);
});

test("an unavailable avatar is omitted instead of failing the statistics refresh", async () => {
  const result = await collectSnapshot({ ...options, fetcher: fixtureFetch("avatar-unavailable") });
  assert.equal(result.snapshot.avatarDataUrl, undefined);
});

test.each([
  { kind: "reviews", message: "Review collection changed during pagination" },
  { kind: "authored activity", message: "Search collection changed during pagination" },
])("collector rejects changing $kind totals between pages", async ({ kind, message }) => {
  const base = paginatedFixture().fetcher;
  const fetcher: typeof fetch = async (url, init) => {
    const response = await base(url, init);
    if (!String(url).endsWith("/graphql")) return response;
    const { variables } = JSON.parse(String(init?.body)) as {
      variables: { after?: string | null };
    };
    if (!variables.after) return response;
    const envelope = (await response.json()) as {
      data: {
        user?: {
          contributionsCollection: { pullRequestReviewContributions: { totalCount: number } };
        };
        search?: { issueCount: number };
      };
    };
    if (kind === "reviews" && envelope.data.user)
      envelope.data.user.contributionsCollection.pullRequestReviewContributions.totalCount++;
    if (kind === "authored activity" && envelope.data.search) envelope.data.search.issueCount++;
    return Response.json(envelope);
  };
  await assert.rejects(collectSnapshot({ ...options, fetcher }), { message });
});

test.each(["repo", "user", "read:user"])(
  "collector rejects the %s scope even when no private repositories are listed",
  async (scope) => {
    const base = fixtureFetch();
    const fetcher: typeof fetch = async (url, init) =>
      String(url).includes("/user/repos")
        ? Response.json([], { headers: { "x-oauth-scopes": `public_repo, ${scope}` } })
        : base(url, init);
    await assert.rejects(collectSnapshot({ ...options, fetcher }), {
      message: "Public-repositories-only GitHub token required",
    });
  },
);

test("collector accepts scopes that do not grant private repository or profile access", async () => {
  const base = fixtureFetch();
  const fetcher: typeof fetch = async (url, init) =>
    String(url).includes("/user/repos")
      ? Response.json([], { headers: { "x-oauth-scopes": "public_repo" } })
      : base(url, init);
  const { snapshot } = await collectSnapshot({ ...options, fetcher });
  assert.equal(snapshot.coverage.totalContributions, "public-only");
  assert.equal(snapshot.overview.allTime.totalContributions, 300);
});

test("durable collection resumes acquired data and replays a complete snapshot after publication failure", async () => {
  const cache = new Map<string, string>();
  const fixture = fixtureFetch();
  const requests: string[] = [];
  let interruptAggregation = true;
  let insideStep = false;
  const steps: NonNullable<CollectOptions["steps"]> = {
    async do(name, callback) {
      assert.equal(insideStep, false, "durable steps must not nest");
      if (cache.has(name)) return JSON.parse(cache.get(name)!);
      if (name === "aggregate-snapshot" && interruptAggregation) {
        interruptAggregation = false;
        throw new Error("Interrupted before aggregation");
      }
      insideStep = true;
      try {
        const serialized = JSON.stringify(await callback());
        assert.equal(typeof serialized, "string", "step results must be serializable");
        cache.set(name, serialized);
        return JSON.parse(serialized);
      } finally {
        insideStep = false;
      }
    },
  };
  const collect = () =>
    collectSnapshot({
      ...options,
      steps,
      fetcher: async (...args) => {
        requests.push(JSON.stringify([String(args[0]), args[1]?.body ?? null]));
        return fixture(...args);
      },
    });
  await assert.rejects(collect(), /Interrupted before aggregation/);
  const acquiredRequests = new Set(requests);
  const requestsBeforeResume = requests.length;
  let completed: Awaited<ReturnType<typeof collectSnapshot>> | undefined;
  await assert.rejects(async () => {
    completed = await collect();
    throw new Error("Publication failed after collection");
  }, /Publication failed after collection/);
  assert.ok(
    requests.slice(requestsBeforeResume).every((request) => !acquiredRequests.has(request)),
    "resuming collection must not repeat completed acquisition requests",
  );
  assert.equal(completed!.snapshot.overview.allTime.totalContributions, 300);
  assert.equal(completed!.snapshot.oss.last12Months.mergedPullRequests, 2);
  assert.equal(
    completed!.snapshot.recentRepositories!.repositories[0].description,
    "Public repository description",
  );
  const callsBeforeReplay = requests.length;
  const replayed = await collect();
  assert.equal(
    requests.length,
    callsBeforeReplay,
    "completed acquisition steps must not refetch GitHub",
  );
  assert.deepEqual(replayed.snapshot, completed!.snapshot);
  assert.equal(replayed.metrics.requests, 0);
  assert.doesNotMatch(JSON.stringify([...cache]), /test-secret/);
});

test("durable steps omit unavailable avatars and sanitize failures before persistence", async () => {
  const results = new Map<string, unknown>();
  const steps: NonNullable<CollectOptions["steps"]> = {
    async do(name, callback) {
      try {
        const result = await callback();
        results.set(name, JSON.parse(JSON.stringify(result)));
        return result;
      } catch (error) {
        assert.doesNotMatch(String(error), /secret\/repo|test-secret/);
        throw error;
      }
    },
  };
  await collectSnapshot({ ...options, steps, fetcher: fixtureFetch("avatar-unavailable") });
  assert.equal(results.get("verify-public-token"), true);
  assert.equal(results.get("avatar"), null);
  results.clear();
  await assert.rejects(
    collectSnapshot({
      ...options,
      steps,
      fetcher: async () => {
        throw new Error("secret/repo test-secret");
      },
    }),
    /Statistics collection failed; upstream details omitted/,
  );
  assert.equal(results.size, 0);
  await assert.rejects(
    collectSnapshot({
      ...options,
      steps,
      fetcher: async () => Response.json([{ name: "secret/repo", private: true }]),
    }),
    /Public-repositories-only/,
  );
  assert.equal(results.size, 0);
});

test("authored public fork activity before the first contribution year is included in All Time", async () => {
  const result = await collectSnapshot({ ...options, fetcher: fixtureFetch("earlier-authored") });
  assert.equal(result.snapshot.coverage.allTimeFrom, "2024-01-01T00:00:00.000Z");
  assert.equal(result.snapshot.overview.allTime.pullRequests, 5);
  assert.equal(result.snapshot.overview.allTime.totalContributions, 300);
});

for (const [fault, message] of [
  ["private-access", /Public-repositories-only/],
  ["private-commit", /Non-public commit contribution rejected/],
  ["restricted-review", /Non-public review contribution rejected/],
  ["private-review", /Non-public review contribution rejected/],
  ["private-authored", /Non-public or incomplete authored activity rejected/],
  ["partial", /Incomplete GitHub GraphQL/],
  ["restricted", /Restricted contribution/],
  ["truncated-commits", /Incomplete commit repository/],
  ["commit-total-mismatch", /Incomplete public commit contributions/],
  ["truncated-reviews", /Incomplete public review contributions/],
  ["truncated-search", /Incomplete authored activity pagination/],
  ["duplicate-review", /Duplicate review/],
  ["search-overflow", /1000 results/],
  ["private-metadata", /Incomplete public repository metadata/],
] as const)
  test(`collector refuses ${fault} instead of producing a successful snapshot`, async () => {
    await assert.rejects(collectSnapshot({ ...options, fetcher: fixtureFetch(fault) }), message);
  });

test("collector accepts and processes all 1000 search results", async () => {
  const base = fixtureFetch();
  const repository = publicRepository("bulk", "org/bulk");
  const rows = Array.from({ length: 1000 }, (_, index) => ({
    id: `bulk-${index}`,
    createdAt: "2025-06-01T00:00:00Z",
    mergedAt: null,
    repository,
  }));
  const pages: number[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    if (!String(url).endsWith("/graphql")) return base(url, init);
    const { variables } = JSON.parse(String(init?.body)) as {
      variables: { query?: string; after?: string | null };
    };
    if (!variables.query?.includes("is:pr") || !variables.query.includes("created:2025-01-01"))
      return base(url, init);
    const start = variables.after ? Number(variables.after) : 0;
    const nodes = rows.slice(start, start + 100);
    const end = start + nodes.length;
    pages.push(start);
    return Response.json({
      data: {
        search: {
          issueCount: rows.length,
          nodes,
          pageInfo: { hasNextPage: end < rows.length, endCursor: String(end) },
        },
        rateLimit: { cost: 1, remaining: 4900 },
      },
    });
  };
  const { snapshot } = await collectSnapshot({ ...options, fetcher });
  assert.deepEqual(pages, [0, 100, 200, 300, 400, 500, 600, 700, 800, 900]);
  assert.equal(snapshot.overview.allTime.pullRequests, 1002);
});

test("collection error reporting omits upstream data", () => {
  assert.equal(
    collectionError(new Error("secret/repo")),
    "Statistics collection failed; upstream details omitted",
  );
});
