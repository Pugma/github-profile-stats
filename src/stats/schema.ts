import * as v from "valibot";

export const maxAvatarBytes = 64 * 1024;
const maxAvatarDataUrlLength = "data:image/jpeg;base64,".length + Math.ceil(maxAvatarBytes / 3) * 4;
const recentWindow = 90 * 86400_000;
const maxRankedRows = 5;

const time = (value: string) => Date.parse(value);
const within = (value: string, range: { from: string; to: string }) =>
  time(range.from) <= time(value) && time(value) <= time(range.to);

const count = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const date = v.pipe(
  v.string(),
  v.endsWith("Z"),
  v.check((value) => Number.isFinite(time(value))),
);
const text = v.pipe(v.string(), v.nonEmpty());
const repository = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/));
const hexColor = v.pipe(v.string(), v.regex(/^#[\da-f]{6}$/i));
// Embedded rather than linked: README images cannot load external resources from inside an SVG.
const avatarDataUrl = v.pipe(
  v.string(),
  v.maxLength(maxAvatarDataUrlLength),
  v.regex(/^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
);

function ranked<TRow extends v.GenericSchema>(
  row: TRow,
  score: (row: v.InferOutput<TRow>) => number,
) {
  return v.pipe(
    v.array(row),
    v.maxLength(maxRankedRows),
    v.check((rows) => rows.every((row, i) => i === 0 || score(row) <= score(rows[i - 1]))),
  );
}
function periods<TCounts extends v.GenericSchema>(counts: TCounts) {
  return { last12Months: counts, allTime: counts };
}

const overviewCounts = v.strictObject({
  totalContributions: count,
  commits: count,
  pullRequests: count,
  reviews: count,
  issues: count,
});

const projectCounts = v.strictObject({ commits: count, activeRepositories: count });
const projectRanking = v.strictObject({ repository, commits: v.pipe(count, v.minValue(1)) });

const externalCounts = v.strictObject({
  pullRequests: count,
  mergedPullRequests: count,
  reviews: count,
  issues: count,
  commits: count,
  activeRepositories: count,
});
const externalActivity = (row: { prs: number; reviews: number; issues: number }) =>
  row.prs + row.reviews + row.issues;
const externalRanking = v.pipe(
  v.strictObject({ repository, prs: count, reviews: count, issues: count, commits: count }),
  v.check((row) => externalActivity(row) > 0),
);

const recentRepository = v.pipe(
  v.strictObject({
    repository,
    mergedPullRequests: count,
    reviews: count,
    lastActivityAt: date,
    description: v.nullable(v.string()),
    primaryLanguage: v.nullable(v.strictObject({ name: text, color: v.nullable(hexColor) })),
  }),
  v.check((row) => row.mergedPullRequests + row.reviews > 0),
);
const recentRepositories = v.pipe(
  v.strictObject({
    from: date,
    to: date,
    repositories: ranked(recentRepository, (row) => time(row.lastActivityAt)),
  }),
  v.check((recent) => time(recent.to) - time(recent.from) === recentWindow),
  v.check((recent) => {
    const names = recent.repositories.map((row) => row.repository);
    return new Set(names).size === names.length;
  }),
  v.check((recent) => recent.repositories.every((row) => within(row.lastActivityAt, recent))),
);

const snapshotSchema = v.pipe(
  v.strictObject({
    schemaVersion: v.literal(2),
    user: text,
    updatedAt: date,
    period: v.pipe(
      v.strictObject({ from: date, to: date }),
      v.check((period) => time(period.from) <= time(period.to)),
    ),
    coverage: v.strictObject({
      totalContributions: v.literal("public-only"),
      reviews: v.literal("latest-review-per-pr-in-period"),
      allTimeFrom: date,
    }),
    overview: v.strictObject(periods(overviewCounts)),
    myProjects: v.strictObject({
      ...periods(projectCounts),
      topRepositories: ranked(projectRanking, (row) => row.commits),
    }),
    oss: v.strictObject({
      ...periods(externalCounts),
      topRepositories: ranked(externalRanking, externalActivity),
    }),
    recentRepositories: v.exactOptional(recentRepositories),
    avatarDataUrl: v.exactOptional(avatarDataUrl),
  }),
  v.check((snapshot) => time(snapshot.updatedAt) >= time(snapshot.period.to)),
  v.check(
    (snapshot) =>
      snapshot.recentRepositories === undefined ||
      snapshot.recentRepositories.to === snapshot.period.to,
  ),
);

export type OverviewCounts = v.InferOutput<typeof overviewCounts>;
export type ProjectCounts = v.InferOutput<typeof projectCounts>;
export type ExternalCounts = v.InferOutput<typeof externalCounts>;
export type RecentRepositories = v.InferOutput<typeof recentRepositories>;
export type Snapshot = v.InferOutput<typeof snapshotSchema>;

export function validateSnapshot(value: unknown): asserts value is Snapshot {
  if (!v.is(snapshotSchema, value)) throw new Error("Invalid public statistics snapshot");
}
