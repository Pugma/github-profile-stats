export type Repository = {
  id: string;
  nameWithOwner: string;
  visibility: string;
  isFork: boolean;
  owner: { login: string };
};

export function classify(repository: Repository, login: string) {
  if (repository.visibility !== "PUBLIC") return null;
  if (repository.owner.login.toLowerCase() !== login.toLowerCase()) return "external";
  if (
    repository.isFork ||
    repository.nameWithOwner.toLowerCase() === `${login}/${login}`.toLowerCase()
  )
    return null;
  return "projects";
}

export function yearRanges(createdAt: string, now: Date) {
  const first = new Date(createdAt);
  if (!Number.isFinite(first.getTime()) || first > now)
    throw new Error("Invalid account creation date");
  const ranges = [];
  for (let year = first.getUTCFullYear(); year <= now.getUTCFullYear(); year++) {
    ranges.push({
      label: String(year),
      from: new Date(Math.max(first.getTime(), Date.UTC(year, 0, 1))).toISOString(),
      to: new Date(Math.min(now.getTime(), Date.UTC(year + 1, 0, 1) - 1000)).toISOString(),
    });
  }
  return ranges;
}

export function twelveMonthsAgo(now: Date) {
  const from = new Date(now);
  const day = from.getUTCDate();
  from.setUTCDate(1);
  from.setUTCFullYear(from.getUTCFullYear() - 1);
  const lastDay = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0)).getUTCDate();
  from.setUTCDate(Math.min(day, lastDay));
  return from;
}

export function nextCursor(
  page: { hasNextPage: boolean; endCursor: string | null },
  previous: string | null,
) {
  if (!page.hasNextPage) return null;
  if (!page.endCursor || page.endCursor === previous) throw new Error("Pagination did not advance");
  return page.endCursor;
}
