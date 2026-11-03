import type { Child } from "hono/jsx";
import type { Snapshot } from "../stats/schema.ts";
import { Icon } from "./icons.tsx";
import type { IconName } from "./icons.tsx";
import { appearanceQuery, colorTokens, resolveTheme, themeNames, themes } from "./themes.ts";
import type { Appearance, Palette } from "./themes.ts";
import { estimateTextWidth, fitText } from "./text.ts";

export const cardNames = ["overview", "projects", "oss", "recent"] as const;
export type CardName = (typeof cardNames)[number];
export const cardTitles: Record<CardName, string> = {
  overview: "Overview",
  projects: "My Projects",
  oss: "OSS Contributions",
  recent: "Recent Contributions",
};
type CardProps = { snapshot: Snapshot; colors: Palette; languageOverride?: string };
const cardWidth = 560;
const fontFamily = "Arial, Helvetica, sans-serif";
const contentRight = cardWidth - 20;
// Lower tables reuse the Last 12 Months / All Time columns so values line up vertically.
const valueColumns = { last12Months: 410, allTime: contentRight };
const typography = {
  title: 21,
  section: 14,
  repository: 14,
  recentRepository: 15,
  label: 14,
  value: 16,
  totalValue: 18,
  body: 13,
  meta: 11,
};
const repositoryColumns = {
  projects: { x: 42, width: 390 },
  recent: { x: 44, width: 346 },
};
const metricIcons = {
  totalContributions: "activity",
  commits: "commit",
  pullRequests: "pr",
  mergedPullRequests: "merged",
  reviews: "review",
  issues: "issue",
  activeRepositories: "repo",
} satisfies Record<string, IconName>;
const number = (value: number) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function Card({
  name,
  height,
  updatedAt,
  children,
  note,
  colors,
}: {
  name: CardName;
  height: number;
  updatedAt: string;
  children: Child;
  note: string;
  colors: Palette;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={cardWidth}
      height={height}
      viewBox={`0 0 ${cardWidth} ${height}`}
      role="img"
      aria-labelledby={`${name}-title ${name}-description`}
      font-family={fontFamily}
    >
      <title id={`${name}-title`}>{cardTitles[name]}</title>
      <desc id={`${name}-description`}>{note}</desc>
      <rect
        x="0.5"
        y="0.5"
        width={cardWidth - 1}
        height={height - 1}
        rx="14"
        fill={colors.background}
        stroke={colors.border}
      />
      <text x="20" y="32" font-size={typography.title} font-weight="700" fill={colors.title}>
        {cardTitles[name]}
      </text>
      {children}
      <text
        x={contentRight}
        y={height - 10}
        text-anchor="end"
        font-size={typography.meta}
        fill={colors.muted}
      >
        Last updated: {updatedAt.slice(0, 16).replace("T", " ")} UTC
      </text>
    </svg>
  );
}

type MetricRow = {
  label: string;
  icon: IconName;
  last12Months: number;
  allTime: number;
  emphasize?: boolean;
};
function Metrics({
  rows,
  colors,
  relativeShare = false,
}: {
  rows: MetricRow[];
  colors: Palette;
  relativeShare?: boolean;
}) {
  const shares = rows.map((row) => (row.allTime > 0 ? row.last12Months / row.allTime : 0));
  const maxShare = Math.max(0, ...shares);
  const maxShareWidth = cardWidth * 0.7;
  return (
    <g>
      {relativeShare && (
        <text x="20" y="58" font-size={typography.meta} fill={colors.muted}>
          Relative share of All Time
        </text>
      )}
      <text
        x={valueColumns.last12Months}
        y="58"
        text-anchor="end"
        font-size={typography.meta}
        fill={colors.muted}
      >
        Last 12 Months
      </text>
      <text
        x={valueColumns.allTime}
        y="58"
        text-anchor="end"
        font-size={typography.meta}
        fill={colors.muted}
      >
        All Time
      </text>
      {rows.map((row, index) => (
        <g key={row.label}>
          {relativeShare && (
            <g>
              <title>
                {row.label}:{" "}
                {row.allTime > 0
                  ? `${(shares[index] * 100).toFixed(1)}% of All Time in the last 12 months`
                  : "share unavailable without All Time activity"}
                . Bar widths are relative to the largest share.
              </title>
              <rect
                x="16"
                y={69 + index * 24}
                width={maxShare > 0 ? (maxShareWidth * shares[index]) / maxShare : 0}
                height="20"
                opacity="0.18"
                fill={
                  row.icon === "activity" || row.icon === "repo" ? colors.accent : colors[row.icon]
                }
              />
            </g>
          )}
          <Icon
            name={row.icon}
            x={20}
            y={71 + index * 24}
            color={row.icon === "activity" || row.icon === "repo" ? colors.icon : colors[row.icon]}
          />
          <text x="44" y={84 + index * 24} font-size={typography.label} fill={colors.text}>
            {row.label}
          </text>
          <text
            x={valueColumns.last12Months}
            y={84 + index * 24}
            text-anchor="end"
            font-size={row.emphasize ? typography.totalValue : typography.value}
            font-weight={row.emphasize ? 700 : 400}
            fill={colors.value}
          >
            {number(row.last12Months)}
          </text>
          <text
            x={valueColumns.allTime}
            y={84 + index * 24}
            text-anchor="end"
            font-size={row.emphasize ? typography.totalValue : typography.value}
            font-weight={row.emphasize ? 700 : 400}
            fill={colors.value}
          >
            {number(row.allTime)}
          </text>
        </g>
      ))}
    </g>
  );
}

function Overview({ snapshot, colors }: CardProps) {
  const { overview } = snapshot;
  const labels = {
    totalContributions: "Total Contributions",
    commits: "Commits",
    pullRequests: "Pull Requests",
    reviews: "Reviews",
    issues: "Issues",
  };
  return (
    <Card
      name="overview"
      colors={colors}
      height={213}
      updatedAt={snapshot.updatedAt}
      note="Total follows GitHub's calendar; public-only. Reviews count each PR once per period. Background bars compare Last 12 Months / All Time, scaled to the largest share."
    >
      <Metrics
        colors={colors}
        relativeShare
        rows={(Object.keys(labels) as (keyof typeof labels)[]).map((key) => ({
          label: labels[key],
          icon: metricIcons[key],
          emphasize: key === "totalContributions",
          last12Months: overview.last12Months[key],
          allTime: overview.allTime[key],
        }))}
      />
    </Card>
  );
}

// Each count is right-aligned in its own column so separators line up across rows; a single
// right-aligned "a / b / c" string shifts them whenever the digit counts differ.
function separatedColumns(rows: number[][], right: number, size: number) {
  const separatorWidth = estimateTextWidth(" / ", size);
  const columnCount = rows[0]?.length ?? 0;
  const ends: number[] = [];
  const separators: number[] = [];
  let x = right;
  for (let column = columnCount - 1; column >= 0; column--) {
    ends.unshift(x);
    x -= Math.max(...rows.map((row) => estimateTextWidth(String(row[column]), size)));
    if (column > 0) {
      separators.unshift(x - separatorWidth / 2);
      x -= separatorWidth;
    }
  }
  return { ends, separators, width: right - x };
}
function SeparatedCounts({
  values,
  layout,
  ...attributes
}: {
  values: number[];
  layout: ReturnType<typeof separatedColumns>;
  y: number;
  "font-size": number;
  fill: string;
  "dominant-baseline"?: string;
}) {
  return (
    <g>
      {values.map((value, column) => (
        <text key={column} x={layout.ends[column]} text-anchor="end" {...attributes}>
          {value}
        </text>
      ))}
      {layout.separators.map((x, column) => (
        <text key={column} x={x} text-anchor="middle" {...attributes}>
          /
        </text>
      ))}
    </g>
  );
}

function RepositoryBackground({
  y,
  max,
  segments,
}: {
  y: number;
  max: number;
  segments: { count: number; color: string }[];
}) {
  const scale = 528 / Math.max(1, max);
  let x = 16;
  return (
    <g opacity="0.18" aria-hidden="true">
      {segments.map((segment, index) => {
        const width = segment.count * scale;
        const start = x;
        x += width;
        return (
          <rect key={index} x={start} y={y - 4} width={width} height="24" fill={segment.color} />
        );
      })}
    </g>
  );
}

function Projects({ snapshot, colors }: CardProps) {
  const { myProjects } = snapshot;
  const rows = myProjects.topRepositories;
  const height = 168 + Math.max(1, rows.length) * 28;
  const max = Math.max(1, ...rows.map((row) => row.commits));
  return (
    <Card
      name="projects"
      colors={colors}
      height={height}
      updatedAt={snapshot.updatedAt}
      note="Qualifying commits to owned public non-forks; profile repository excluded; archived repositories included."
    >
      <defs>
        <clipPath id="projects-repository">
          <rect
            x={repositoryColumns.projects.x}
            width={repositoryColumns.projects.width}
            height={height}
          />
        </clipPath>
      </defs>
      <Metrics
        colors={colors}
        rows={[
          {
            label: "Commits",
            icon: "commit",
            last12Months: myProjects.last12Months.commits,
            allTime: myProjects.allTime.commits,
          },
          {
            label: "Active Repositories",
            icon: "repo",
            last12Months: myProjects.last12Months.activeRepositories,
            allTime: myProjects.allTime.activeRepositories,
          },
        ]}
      />
      <text x="20" y="136" font-size={typography.section} font-weight="600" fill={colors.title}>
        Most Active Repositories
      </text>
      <text
        x={contentRight}
        y="136"
        text-anchor="end"
        font-size={typography.meta}
        fill={colors.muted}
      >
        Last 12 Months · commits
      </text>
      {rows.length === 0 ? (
        <text x="20" y="162" font-size={typography.body} fill={colors.muted}>
          No qualifying commits in this period.
        </text>
      ) : (
        rows.map((row, index) => (
          <g key={row.repository}>
            <title>
              {row.repository}: {row.commits} commits
            </title>
            <RepositoryBackground
              y={149 + index * 28}
              max={max}
              segments={[{ count: row.commits, color: colors.commit }]}
            />
            <Icon name="repo" x={20} y={149 + index * 28} color={colors.icon} />
            <text
              x={repositoryColumns.projects.x}
              y={162 + index * 28}
              font-size={typography.repository}
              fill={colors.text}
              clip-path="url(#projects-repository)"
            >
              {fitText(row.repository, repositoryColumns.projects.width, typography.repository)}
            </text>
            <text
              x={contentRight}
              y={162 + index * 28}
              text-anchor="end"
              font-size={typography.repository}
              fill={colors.value}
            >
              {number(row.commits)}
            </text>
          </g>
        ))
      )}
    </Card>
  );
}

function External({ snapshot, colors }: CardProps) {
  const { oss } = snapshot;
  const rows = oss.topRepositories;
  const labels = {
    pullRequests: "Pull Requests",
    mergedPullRequests: "Merged PRs",
    reviews: "Reviews",
    issues: "Issues",
    commits: "Commits",
    activeRepositories: "Active Repositories",
  };
  const height = 289 + Math.max(1, rows.length) * 28;
  const max = Math.max(1, ...rows.map((row) => row.prs + row.reviews + row.issues));
  const countLayout = separatedColumns(
    rows.map((row) => [row.prs, row.reviews, row.issues]),
    valueColumns.last12Months,
    typography.body,
  );
  const ossRepositoryX = 42;
  const nameWidth = valueColumns.last12Months - countLayout.width - 16 - ossRepositoryX;
  return (
    <Card
      name="oss"
      colors={colors}
      height={height}
      updatedAt={snapshot.updatedAt}
      note="External public repositories. Ranking = PRs + Reviews + Issues; commits are reference values only."
    >
      <defs>
        <clipPath id="oss-repository">
          <rect x={ossRepositoryX} width={Math.max(0, nameWidth)} height={height} />
        </clipPath>
      </defs>
      <Metrics
        colors={colors}
        rows={(Object.keys(labels) as (keyof typeof labels)[]).map((key) => ({
          label: labels[key],
          icon: metricIcons[key],
          last12Months: oss.last12Months[key],
          allTime: oss.allTime[key],
        }))}
      />
      <text x="20" y="232" font-size={typography.section} font-weight="600" fill={colors.title}>
        Most Active Repositories
      </text>
      <text
        x={contentRight}
        y="232"
        text-anchor="end"
        font-size={typography.meta}
        fill={colors.muted}
      >
        Last 12 Months · activity count
      </text>
      {(
        [
          { label: "PRs", color: colors.pr, icon: "pr" },
          { label: "Reviews", color: colors.review, icon: "review" },
          { label: "Issues", color: colors.issue, icon: "issue" },
        ] satisfies { label: string; color: string; icon: IconName }[]
      ).map(({ label, color, icon }, index) => (
        <g key={label}>
          <Icon name={icon} x={20 + index * 88} y={244} size={14} color={color} />
          <text x={42 + index * 88} y="255" font-size={typography.meta} fill={colors.muted}>
            {label}
          </text>
        </g>
      ))}
      <text
        x={valueColumns.last12Months}
        y="255"
        text-anchor="end"
        font-size={typography.meta}
        fill={colors.muted}
      >
        PRs / Reviews / Issues
      </text>
      <Icon name="commit" x={479} y={244} size={13} color={colors.commit} />
      <text
        x={contentRight}
        y="255"
        text-anchor="end"
        font-size={typography.meta}
        fill={colors.muted}
      >
        Commits
      </text>
      {rows.length === 0 ? (
        <text x="20" y="283" font-size={typography.body} fill={colors.muted}>
          No PR, review or issue contributions in this period.
        </text>
      ) : (
        rows.map((row, index) => {
          const y = 270 + index * 28;
          return (
            <g key={row.repository}>
              <title>
                {row.repository}: {row.prs} PRs, {row.reviews} reviews, {row.issues} issues; total{" "}
                {row.prs + row.reviews + row.issues}; {row.commits} commits
              </title>
              <RepositoryBackground
                y={y}
                max={max}
                segments={[
                  { count: row.prs, color: colors.pr },
                  { count: row.reviews, color: colors.review },
                  { count: row.issues, color: colors.issue },
                ]}
              />
              <Icon name="repo" x={20} y={y} color={colors.icon} />
              <text
                x={ossRepositoryX}
                y={y + 13}
                font-size={typography.repository}
                fill={colors.text}
                clip-path="url(#oss-repository)"
              >
                {fitText(row.repository, nameWidth, typography.repository)}
              </text>
              <SeparatedCounts
                values={[row.prs, row.reviews, row.issues]}
                layout={countLayout}
                y={y + 13}
                font-size={typography.body}
                fill={colors.value}
              />
              <text
                x={valueColumns.allTime}
                y={y + 13}
                text-anchor="end"
                font-size={typography.body}
                fill={colors.muted}
              >
                {number(row.commits)}
              </text>
            </g>
          );
        })
      )}
    </Card>
  );
}

function Recent({ snapshot, colors, languageOverride }: CardProps) {
  const recent = snapshot.recentRepositories;
  const rows = recent?.repositories ?? [];
  const rowHeight = 66;
  const rowsTop = 65;
  const height = rowsTop + Math.max(1, rows.length) * rowHeight + 20;
  const countLayout = separatedColumns(
    rows.map((row) => [row.mergedPullRequests, row.reviews]),
    contentRight,
    typography.recentRepository,
  );
  return (
    <Card
      name="recent"
      colors={colors}
      height={height}
      updatedAt={snapshot.updatedAt}
      note="Last 90 days · Reviews count distinct PRs. Repo language describes the repository, not your changes."
    >
      <defs>
        <clipPath id="recent-repository">
          <rect
            x={repositoryColumns.recent.x}
            width={repositoryColumns.recent.width}
            height={height}
          />
        </clipPath>
      </defs>
      <text x="20" y="56" font-size={typography.meta} fill={colors.muted}>
        {recent
          ? `Last 90 days · ${recent.from.slice(0, 10)} — ${recent.to.slice(0, 10)}`
          : "Awaiting updated collection"}
      </text>
      <Icon name="merged" x={327} y={45} size={13} color={colors.merged} />
      <text x="344" y="56" font-size={typography.meta} fill={colors.muted}>
        Merged PRs
      </text>
      <text x="413" y="56" font-size={typography.meta} fill={colors.muted}>
        /
      </text>
      <Icon name="review" x={429} y={45} size={13} color={colors.review} />
      <text x="446" y="56" font-size={typography.meta} fill={colors.muted}>
        Reviewed PRs
      </text>
      {!recent ? (
        <g>
          <text x="20" y="95" font-size={typography.body} fill={colors.muted}>
            Repository activity needs a new collection.
          </text>
          <text x="20" y="116" font-size={typography.body} fill={colors.muted}>
            Existing totals remain available.
          </text>
        </g>
      ) : rows.length === 0 ? (
        <text x="20" y="95" font-size={typography.body} fill={colors.muted}>
          No merged PRs or reviews in the last 90 days.
        </text>
      ) : (
        rows.map((row, index) => {
          const description = row.description?.trim();
          const centerY = rowsTop + (index + 0.5) * rowHeight;
          const nameY = centerY - (description ? 18 : 10);
          const languageY = centerY + (description ? 18 : 10);
          const descriptionWidth = contentRight - 20 - countLayout.width - 16;
          const descriptionClip = `recent-description-${index}`;
          return (
            <g key={row.repository}>
              <title>
                {row.repository}
                {description ? `: ${description}` : ""}; {row.mergedPullRequests} merged PRs,{" "}
                {row.reviews} reviewed PRs
              </title>
              <Icon name="repo" x={20} y={nameY - 8} size={16} color={colors.accent} />
              <text
                x={repositoryColumns.recent.x}
                y={nameY}
                dominant-baseline="central"
                font-size={typography.recentRepository}
                font-weight="600"
                fill={colors.accent}
                clip-path="url(#recent-repository)"
              >
                {fitText(
                  row.repository,
                  repositoryColumns.recent.width,
                  typography.recentRepository,
                )}
              </text>
              <SeparatedCounts
                values={[row.mergedPullRequests, row.reviews]}
                layout={countLayout}
                y={centerY}
                dominant-baseline="central"
                font-size={typography.recentRepository}
                fill={colors.value}
              />
              {description && (
                <g>
                  <defs>
                    <clipPath id={descriptionClip}>
                      <rect
                        x="20"
                        y={centerY - 10}
                        width={Math.max(0, descriptionWidth)}
                        height="20"
                      />
                    </clipPath>
                  </defs>
                  <text
                    x="20"
                    y={centerY}
                    clip-path={`url(#${descriptionClip})`}
                    dominant-baseline="central"
                    font-size={typography.body}
                    fill={colors.text}
                  >
                    {fitText(description, descriptionWidth, typography.body)}
                  </text>
                </g>
              )}
              {row.primaryLanguage ? (
                <g>
                  <circle
                    cx="25"
                    cy={languageY}
                    r="4"
                    fill={languageOverride ?? row.primaryLanguage.color ?? colors.language}
                  />
                  <text
                    x="37"
                    y={languageY}
                    dominant-baseline="central"
                    font-size={typography.meta}
                    fill={colors.muted}
                  >
                    {fitText(row.primaryLanguage.name, 200, typography.meta)}
                  </text>
                </g>
              ) : (
                <text
                  x="20"
                  y={languageY}
                  dominant-baseline="central"
                  font-size={typography.meta}
                  fill={colors.muted}
                >
                  Not specified
                </text>
              )}
              <text
                x={contentRight}
                y={centerY + 18}
                dominant-baseline="central"
                text-anchor="end"
                font-size={typography.meta}
                fill={colors.muted}
              >
                Last activity {row.lastActivityAt.slice(0, 10)}
              </text>
              {index < rows.length - 1 && (
                <line
                  x1="20"
                  x2={contentRight}
                  y1={centerY + rowHeight / 2}
                  y2={centerY + rowHeight / 2}
                  stroke={colors.border}
                />
              )}
            </g>
          );
        })
      )}
    </Card>
  );
}

export function renderCard(snapshot: Snapshot, name: CardName, appearance = resolveTheme()) {
  const components = { overview: Overview, projects: Projects, oss: External, recent: Recent };
  const Component = components[name];
  return `<?xml version="1.0" encoding="UTF-8"?>\n${(<Component snapshot={snapshot} colors={appearance.colors} languageOverride={appearance.overrides.language} />).toString()}`;
}

export function renderPendingCard(name: CardName, appearance = resolveTheme()) {
  const colors = appearance.colors;
  return `<?xml version="1.0" encoding="UTF-8"?>\n${(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={cardWidth}
      height="112"
      viewBox={`0 0 ${cardWidth} 112`}
      role="img"
      font-family={fontFamily}
    >
      <title>{cardTitles[name]} — Preparing statistics</title>
      <rect
        x="0.5"
        y="0.5"
        width={cardWidth - 1}
        height="111"
        rx="14"
        fill={colors.background}
        stroke={colors.border}
      />
      <text x="20" y="32" font-size={typography.title} font-weight="700" fill={colors.title}>
        {cardTitles[name]}
      </text>
      <text x="20" y="64" font-size={typography.body} fill={colors.muted}>
        Preparing statistics.
      </text>
      <text x="20" y="86" font-size={typography.body} fill={colors.muted}>
        Please check again after the next successful update.
      </text>
    </svg>
  ).toString()}`;
}

export function renderGallery(appearance: Appearance = resolveTheme(), basePath = "/") {
  const { colors } = appearance;
  const query = appearanceQuery(appearance);
  const tokenLabels: Record<keyof Palette, string> = {
    background: "Card background",
    border: "Borders & dividers",
    title: "Headings",
    text: "Body text",
    muted: "Secondary text",
    icon: "Neutral icons",
    value: "Numbers",
    accent: "Repository accent",
    commit: "Commits",
    pr: "Pull requests",
    merged: "Merged PRs",
    review: "Reviews",
    issue: "Issues",
    language: "Language marker",
    pageBackground: "Preview background",
  };
  return (
    "<!doctype html>" +
    (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>GitHub Profile Statistics — Preview</title>
          <style>{`body{margin:0;background:${colors.pageBackground};color:${colors.text};font-family:${fontFamily}}main{max-width:1140px;margin:32px auto;padding:0 20px}h1{font-size:28px;margin:0 0 10px;color:${colors.title}}p{color:${colors.muted};margin:0 0 20px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,${cardWidth}px),1fr));gap:20px;align-items:start}article{min-width:0;max-width:${cardWidth}px}h2{font-size:15px;margin:0 0 10px}img{display:block;width:100%;height:auto}a{color:${colors.accent};text-decoration:none}.controls{border:1px solid ${colors.border};background:${colors.background};border-radius:12px;padding:16px;margin-bottom:24px}.preset{display:flex;gap:12px;align-items:center;flex-wrap:wrap}select,button{font:inherit;color:${colors.text};background:${colors.background};border:1px solid ${colors.border};border-radius:6px;padding:7px 12px}button{cursor:pointer}summary{cursor:pointer;color:${colors.title};margin:16px 0}.tokens{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:12px 0 18px}.token{display:flex;align-items:center;gap:10px;font-size:13px}.token span{display:grid;gap:3px}.token code{color:${colors.muted};font-size:11px}input[type=color]{width:40px;height:32px;padding:2px;background:${colors.background};border:1px solid ${colors.border};border-radius:5px}.actions{display:flex;gap:16px;align-items:center;flex-wrap:wrap}`}</style>
        </head>
        <body>
          <main>
            <h1>GitHub Profile Statistics</h1>
            <p>Draft card preview</p>
            <section class="controls" aria-label="Color theme">
              <form action={basePath} method="get" class="preset">
                <label for="theme">Theme</label>
                <select id="theme" name="theme">
                  {themeNames.map((name) => (
                    <option value={name} selected={appearance.theme === name}>
                      {themes[name].label}
                    </option>
                  ))}
                </select>
                <button type="submit">Apply preset</button>
              </form>
              <details open={Object.keys(appearance.overrides).length > 0}>
                <summary>Customize all color tokens</summary>
                <form action={basePath} method="get">
                  <input type="hidden" name="theme" value={appearance.theme} />
                  <div class="tokens">
                    {colorTokens.map((token) => (
                      <label class="token" for={`color-${token}`} key={token}>
                        {token === "language" ? (
                          <input
                            type="text"
                            id={`color-${token}`}
                            name={token}
                            value={appearance.overrides.language ?? "auto"}
                            size={8}
                            style={`width:80px;padding:6px;font-size:12px;color:${colors.text};background:${colors.background};border:1px solid ${colors.border};border-radius:5px`}
                            aria-label="Language color: auto for GitHub colors, or a hex override"
                          />
                        ) : (
                          <input
                            type="color"
                            id={`color-${token}`}
                            name={token}
                            value={colors[token]}
                          />
                        )}
                        <span>
                          {tokenLabels[token]}
                          <code>
                            {token} ·{" "}
                            {token === "language"
                              ? (appearance.overrides.language ?? "auto (GitHub)")
                              : colors[token]}
                          </code>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div class="actions">
                    <button type="submit">Apply custom colors</button>
                    <a href={`${basePath}?theme=${appearance.theme}`}>Reset to preset</a>
                  </div>
                </form>
              </details>
            </section>
            <div class="cards">
              {cardNames.map((name) => (
                <article key={name}>
                  <h2>
                    <a href={`${basePath}${name}.svg?${query}`}>{cardTitles[name]}</a>
                  </h2>
                  <img
                    src={`${basePath}${name}.svg?${query}`}
                    alt={cardTitles[name]}
                    width={cardWidth}
                  />
                </article>
              ))}
            </div>
          </main>
        </body>
      </html>
    ).toString()
  );
}
