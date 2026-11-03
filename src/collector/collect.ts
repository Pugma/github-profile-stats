import { nextCursor, twelveMonthsAgo, yearRanges } from "./collection-helpers.ts";
import type { Repository } from "./collection-helpers.ts";
import { buildSnapshot } from "./aggregate.ts";
import type {
  AuthoredItem,
  ContributionPeriod,
  PullRequest,
  ReviewContribution,
} from "./aggregate.ts";
import { maxAvatarBytes, validateSnapshot } from "../stats/schema.ts";

type Page<T> = {
  totalCount: number;
  nodes: T[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};
type ReviewNode = {
  occurredAt: string;
  isRestricted: boolean;
  repository: Repository;
  pullRequest: { id: string };
  pullRequestReview: { id: string; submittedAt: string };
};
type GitHubCollection = {
  contributionCalendar: { totalContributions: number };
  restrictedContributionsCount: number;
  totalCommitContributions: number;
  totalPullRequestReviewContributions: number;
  totalRepositoriesWithContributedCommits: number;
  commitContributionsByRepository: {
    repository: Repository;
    contributions: { totalCount: number };
  }[];
  pullRequestReviewContributions: Page<ReviewNode>;
};
const repositoryFields = "id nameWithOwner visibility isFork owner { login }";
const reviews = `pullRequestReviewContributions(first:100, after:$after) {
	totalCount pageInfo { hasNextPage endCursor }
	nodes { occurredAt isRestricted repository { ${repositoryFields} } pullRequest { id } pullRequestReview { id submittedAt } }
}`;
const contributionQuery = `query($login:String!, $from:DateTime!, $to:DateTime!, $after:String) {
	user(login:$login) { contributionsCollection(from:$from, to:$to) {
		contributionCalendar { totalContributions }
		restrictedContributionsCount totalCommitContributions totalPullRequestReviewContributions totalRepositoriesWithContributedCommits
		commitContributionsByRepository(maxRepositories:100) { repository { ${repositoryFields} } contributions { totalCount } }
		${reviews}
	} } rateLimit { cost remaining }
}`;
const reviewQuery = `query($login:String!, $from:DateTime!, $to:DateTime!, $after:String) {
	user(login:$login) { contributionsCollection(from:$from, to:$to) { ${reviews} } } rateLimit { cost remaining }
}`;
const searchQuery = `query($query:String!, $after:String) {
	search(query:$query, type:ISSUE, first:100, after:$after) {
		issueCount pageInfo { hasNextPage endCursor }
		nodes {
			... on PullRequest { id createdAt mergedAt repository { ${repositoryFields} } }
			... on Issue { id createdAt repository { ${repositoryFields} } }
		}
	} rateLimit { cost remaining }
}`;

export type CollectOptions = {
  login: string;
  token: string;
  now?: Date;
  fetcher?: typeof fetch;
  steps?: { do<T>(name: string, callback: () => Promise<T>): Promise<T> };
};

export async function collectSnapshot({
  login,
  token,
  now = new Date(),
  fetcher = fetch,
  steps = { do: async (_name, callback) => callback() },
}: CollectOptions) {
  const startedAt = performance.now();
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(login)) throw new Error("Invalid GitHub login");
  const metrics = { requests: 0, responseBytes: 0, graphqlCost: 0, remaining: 0 };
  const encoder = new TextEncoder();
  function step<T>(name: string, callback: () => Promise<T>) {
    return steps.do(name, async () => {
      try {
        return await callback();
      } catch (error) {
        throw new Error(collectionError(error));
      }
    });
  }
  async function request(path: string, body?: object) {
    metrics.requests++;
    const response = await fetcher(`https://api.github.com${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "github-profile-stats",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`GitHub collection HTTP ${response.status}`);
    const text = await response.text();
    metrics.responseBytes += encoder.encode(text).byteLength;
    return { response, value: JSON.parse(text) as unknown };
  }
  async function graphql<T>(query: string, variables: object): Promise<T> {
    const { value } = await request("/graphql", { query, variables });
    const result = value as {
      data?: T & { rateLimit: { cost: number; remaining: number } };
      errors?: unknown[];
    };
    if (result.errors?.length || !result.data || !result.data.rateLimit)
      throw new Error("Incomplete GitHub GraphQL collection");
    metrics.graphqlCost += result.data.rateLimit.cost;
    metrics.remaining = result.data.rateLimit.remaining;
    return result.data;
  }

  // The avatar only decorates Overview, so an unavailable image is omitted rather than blocking
  // a statistics refresh. The token is never sent outside api.github.com.
  async function avatar(url: string) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.hostname !== "avatars.githubusercontent.com")
        return undefined;
      metrics.requests++;
      const response = await fetcher(parsed, { signal: AbortSignal.timeout(30_000) });
      const type = response.headers.get("content-type")?.split(";")[0].trim();
      if (!response.ok || !/^image\/(?:png|jpeg|gif|webp)$/.test(type ?? "")) return undefined;
      const bytes = new Uint8Array(await response.arrayBuffer());
      metrics.responseBytes += bytes.byteLength;
      if (!bytes.byteLength || bytes.byteLength > maxAvatarBytes) return undefined;
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return `data:${type};base64,${btoa(binary)}`;
    } catch {
      return undefined;
    }
  }

  // Public-only totals require a public-repositories-only token. Reject known broader access;
  // never silently reuse an owner's private-readable calendar as public statistics.
  await step("verify-public-token", async () => {
    const access = await request("/user/repos?visibility=private&per_page=1");
    const scopes =
      access.response.headers
        .get("x-oauth-scopes")
        ?.split(",")
        .map((scope) => scope.trim()) ?? [];
    if (
      !Array.isArray(access.value) ||
      access.value.length ||
      scopes.some((scope) => ["repo", "user", "read:user"].includes(scope))
    ) {
      throw new Error("Public-repositories-only GitHub token required");
    }
    return true;
  });
  const { avatarUrl, ranges } = await step("account-metadata", async () => {
    const metadata = await graphql<{
      user: {
        createdAt: string;
        avatarUrl: string;
        contributionsCollection: { contributionYears: number[] };
      } | null;
    }>(
      "query($login:String!) { user(login:$login) { createdAt avatarUrl(size:128) contributionsCollection { contributionYears } } rateLimit { cost remaining } }",
      { login },
    );
    if (!metadata.user) throw new Error("GitHub collection user not found");
    const { avatarUrl } = metadata.user;
    const availableYears = metadata.user.contributionsCollection.contributionYears;
    if (
      !availableYears.every(
        (year) => Number.isInteger(year) && year > 0 && year <= now.getUTCFullYear(),
      )
    )
      throw new Error("Invalid contribution years");
    const accountYear = new Date(metadata.user.createdAt).getUTCFullYear();
    if (!Number.isInteger(accountYear) || accountYear < 1 || accountYear > now.getUTCFullYear())
      throw new Error("Invalid contribution years");
    // Authored PRs/issues on forks may predate the first year eligible for the contribution calendar.
    const firstYear = Math.min(accountYear, ...availableYears);
    const ranges = yearRanges(new Date(Date.UTC(firstYear, 0, 1)).toISOString(), now);
    return { avatarUrl, ranges };
  });

  async function collectPeriod(from: string, to: string): Promise<ContributionPeriod> {
    const variables = { login, from, to, after: null as string | null };
    const result = await graphql<{ user: { contributionsCollection: GitHubCollection } }>(
      contributionQuery,
      variables,
    );
    const collection = result.user.contributionsCollection;
    if (collection.restrictedContributionsCount !== 0)
      throw new Error(
        "Restricted contribution totals require separate public-visibility verification",
      );
    const groups = collection.commitContributionsByRepository;
    if (groups.length !== collection.totalRepositoriesWithContributedCommits)
      throw new Error("Incomplete commit repository groups");
    if (groups.some((group) => group.repository.visibility !== "PUBLIC"))
      throw new Error("Non-public commit contribution rejected");
    const commits = groups.map((group) => ({
      repository: group.repository,
      count: group.contributions.totalCount,
    }));
    if (commits.reduce((sum, row) => sum + row.count, 0) !== collection.totalCommitContributions)
      throw new Error("Incomplete public commit contributions");
    let page = collection.pullRequestReviewContributions;
    const expected = page.totalCount;
    const reviews: ReviewContribution[] = [];
    const prIds = new Set<string>();
    const reviewIds = new Set<string>();
    while (true) {
      if (page.totalCount !== expected)
        throw new Error("Review collection changed during pagination");
      for (const review of page.nodes) {
        if (!review || review.isRestricted || review.repository?.visibility !== "PUBLIC")
          throw new Error("Non-public review contribution rejected");
        if (
          !review.pullRequest?.id ||
          !review.pullRequestReview?.id ||
          !review.pullRequestReview.submittedAt
        )
          throw new Error("Incomplete review identity");
        if (prIds.has(review.pullRequest.id) || reviewIds.has(review.pullRequestReview.id))
          throw new Error("Duplicate review contribution page");
        prIds.add(review.pullRequest.id);
        reviewIds.add(review.pullRequestReview.id);
        reviews.push({
          repository: review.repository,
          pullRequestId: review.pullRequest.id,
          reviewId: review.pullRequestReview.id,
          occurredAt: review.occurredAt,
          submittedAt: review.pullRequestReview.submittedAt,
        });
      }
      variables.after = nextCursor(page.pageInfo, variables.after);
      if (!variables.after) break;
      const more = await graphql<{
        user: { contributionsCollection: Pick<GitHubCollection, "pullRequestReviewContributions"> };
      }>(reviewQuery, variables);
      page = more.user.contributionsCollection.pullRequestReviewContributions;
    }
    if (
      reviews.length !== expected ||
      reviews.length !== collection.totalPullRequestReviewContributions
    )
      throw new Error("Incomplete public review contributions");
    return {
      from,
      to,
      totalContributions: collection.contributionCalendar.totalContributions,
      commits,
      reviews,
    };
  }

  const years: ContributionPeriod[] = [];
  for (const range of ranges)
    years.push(
      await step(`contributions-${range.label}`, () => collectPeriod(range.from, range.to)),
    );
  const last12Months = await step("contributions-last12Months", () =>
    collectPeriod(twelveMonthsAgo(now).toISOString(), now.toISOString()),
  );
  const pullRequests: PullRequest[] = [];
  const issues: AuthoredItem[] = [];
  for (const kind of ["pr", "issue"] as const) {
    const seen = new Set<string>();
    for (const range of ranges) {
      const items = await step(`authored-${kind}-${range.label}`, async () => {
        const items: PullRequest[] = [];
        const pageIds = new Set<string>();
        let after: string | null = null;
        let expected: number | undefined;
        let received = 0;
        do {
          const query = `author:${login} is:public is:${kind} created:${range.from}..${range.to} sort:created-asc`;
          const result: { search: Omit<Page<PullRequest>, "totalCount"> & { issueCount: number } } =
            await graphql(searchQuery, { query, after });
          const page = result.search;
          expected ??= page.issueCount;
          if (expected > 1000)
            throw new Error("Search interval exceeds 1000 results; collection incomplete");
          if (page.issueCount !== expected)
            throw new Error("Search collection changed during pagination");
          for (const item of page.nodes) {
            if (!item?.id || !item.createdAt || item.repository?.visibility !== "PUBLIC")
              throw new Error("Non-public or incomplete authored activity rejected");
            if (pageIds.has(item.id)) throw new Error("Duplicate authored activity page");
            pageIds.add(item.id);
            items.push({
              id: item.id,
              createdAt: item.createdAt,
              repository: item.repository,
              mergedAt: kind === "pr" ? item.mergedAt : null,
            });
          }
          received += page.nodes.length;
          after = nextCursor(page.pageInfo, after);
        } while (after);
        if (received !== expected) throw new Error("Incomplete authored activity pagination");
        return items;
      });
      for (const item of items) {
        if (seen.has(item.id)) throw new Error("Duplicate authored activity page");
        seen.add(item.id);
        if (kind === "pr") pullRequests.push(item);
        else issues.push({ id: item.id, createdAt: item.createdAt, repository: item.repository });
      }
    }
  }
  const snapshot = await step("aggregate-snapshot", async () =>
    buildSnapshot({
      login,
      to: now,
      updatedAt: new Date(Math.max(Date.now(), now.getTime())).toISOString(),
      years,
      last12Months,
      pullRequests,
      issues,
    }),
  );
  const recent = snapshot.recentRepositories!.repositories;
  if (recent.length) {
    const repositories = await step("displayed-repository-metadata", async () => {
      // Fetch metadata only for displayed repositories, rather than every historical contribution.
      const variables: Record<string, string> = {};
      for (const [index, row] of recent.entries()) {
        const [owner, name] = row.repository.split("/");
        variables[`owner${index}`] = owner;
        variables[`name${index}`] = name;
      }
      const parameters = recent.map((_, i) => `$owner${i}:String!, $name${i}:String!`).join(",");
      const fields = recent
        .map(
          (_, i) =>
            `repo${i}:repository(owner:$owner${i}, name:$name${i}) { visibility description primaryLanguage { name color } }`,
        )
        .join("\n");
      const metadata = await graphql<
        Record<
          string,
          {
            visibility: string;
            description: string | null;
            primaryLanguage: { name: string; color: string | null } | null;
          } | null
        >
      >(`query(${parameters}) { ${fields} rateLimit { cost remaining } }`, variables);
      return recent.map((_, index) => {
        const repository = metadata[`repo${index}`];
        if (!repository || repository.visibility !== "PUBLIC")
          throw new Error("Incomplete public repository metadata");
        return { description: repository.description, primaryLanguage: repository.primaryLanguage };
      });
    });
    for (const [index, row] of recent.entries()) {
      row.description = repositories[index].description;
      row.primaryLanguage = repositories[index].primaryLanguage;
    }
  }
  const avatarDataUrl = await step("avatar", async () => (await avatar(avatarUrl)) ?? null);
  if (avatarDataUrl) snapshot.avatarDataUrl = avatarDataUrl;
  validateSnapshot(snapshot);
  return { snapshot, metrics: { ...metrics, wallMs: performance.now() - startedAt } };
}

export function collectionError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /^(Invalid public statistics snapshot|Invalid GitHub login|GitHub collection HTTP \d+|Incomplete GitHub GraphQL collection|Public-repositories-only GitHub token required|GitHub collection user not found|Invalid contribution years|Restricted contribution totals require separate public-visibility verification|Incomplete commit repository groups|Non-public commit contribution rejected|Incomplete public commit contributions|Review collection changed during pagination|Non-public review contribution rejected|Duplicate review contribution page|Incomplete review identity|Duplicate authored activity page|Incomplete public review contributions|Search interval exceeds 1000 results; collection incomplete|Search collection changed during pagination|Non-public or incomplete authored activity rejected|Incomplete authored activity pagination|Incomplete public repository metadata|Pagination did not advance)$/.test(
    message,
  )
    ? message
    : "Statistics collection failed; upstream details omitted";
}
