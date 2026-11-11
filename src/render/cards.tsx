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
const displayWidth = 360;
const fontFamily = "Arial, Helvetica, sans-serif";
const padding = 20;
const contentRight = cardWidth - padding;
// Gaps widen as elements become less related; every gap is a multiple of 4 px.
const space = { part: 4, sibling: 8, header: 12, group: 16, section: 24 };
// Text is centred in boxes of these heights, so gaps are measured between box edges.
const lineHeight = {
  meta: 12,
  body: 16,
  section: 16,
  legend: 16,
  line: 20,
  recentName: 16,
  row: 24,
  title: 24,
};
const contentTop = padding + lineHeight.title + space.group;
const footerHeight = space.group + lineHeight.meta + padding;
// Lower tables reuse the Last 12 Months / All Time columns so values line up vertically.
const valueColumns = { last12Months: 412, allTime: contentRight };
const rowIconSize = 16;
const legendIconSize = 12;
const labelX = padding + rowIconSize + space.part;
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
  profile: 18,
};
// Background bars of consecutive rows read as one chart, so they sit only a part gap apart.
const listHeight = (count: number) => count * lineHeight.row + Math.max(0, count - 1) * space.part;
const rowTop = (top: number, index: number) => top + index * (lineHeight.row + space.part);
// Bars start just outside the row content and the longest one spans 70% of the card on every
// card, so bar lengths compare consistently across cards.
const barLeft = padding - space.part;
const barWidth = (value: number, max: number) => (max > 0 ? (cardWidth * 0.7 * value) / max : 0);
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
      width={displayWidth}
      height={(height * displayWidth) / cardWidth}
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
      <text
        x={padding}
        y={padding + lineHeight.title / 2}
        dominant-baseline="central"
        font-size={typography.title}
        font-weight="700"
        fill={colors.title}
      >
        {cardTitles[name]}
      </text>
      {children}
      <text
        x={contentRight}
        y={height - padding - lineHeight.meta / 2}
        text-anchor="end"
        dominant-baseline="central"
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
// Without background bars, metric rows are plain lines of text, so they stack like line breaks
// rather than as separate sibling rows.
const plainLinesHeight = (count: number) =>
  count * lineHeight.line + Math.max(0, count - 1) * space.part;
const metricsHeight = (count: number, relativeShare = false) =>
  lineHeight.meta + space.header + (relativeShare ? listHeight(count) : plainLinesHeight(count));
function Metrics({
  rows,
  colors,
  top,
  relativeShare = false,
}: {
  rows: MetricRow[];
  colors: Palette;
  top: number;
  relativeShare?: boolean;
}) {
  const shares = rows.map((row) => (row.allTime > 0 ? row.last12Months / row.allTime : 0));
  const maxShare = Math.max(0, ...shares);
  const headerY = top + lineHeight.meta / 2;
  const rowsTop = top + lineHeight.meta + space.header;
  return (
    <g>
      {relativeShare && (
        <text
          x={padding}
          y={headerY}
          dominant-baseline="central"
          font-size={typography.meta}
          fill={colors.muted}
        >
          Relative share of All Time
        </text>
      )}
      <text
        x={valueColumns.last12Months}
        y={headerY}
        text-anchor="end"
        dominant-baseline="central"
        font-size={typography.meta}
        fill={colors.muted}
      >
        Last 12 Months
      </text>
      <text
        x={valueColumns.allTime}
        y={headerY}
        text-anchor="end"
        dominant-baseline="central"
        font-size={typography.meta}
        fill={colors.muted}
      >
        All Time
      </text>
      {rows.map((row, index) => {
        const y = relativeShare
          ? rowTop(rowsTop, index)
          : rowsTop + index * (lineHeight.line + space.part);
        const centerY = y + (relativeShare ? lineHeight.row : lineHeight.line) / 2;
        const valueSize = row.emphasize ? typography.totalValue : typography.value;
        return (
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
                  x={barLeft}
                  y={y}
                  width={barWidth(shares[index], maxShare)}
                  height={lineHeight.row}
                  opacity="0.18"
                  fill={
                    row.icon === "activity" || row.icon === "repo"
                      ? colors.accent
                      : colors[row.icon]
                  }
                />
              </g>
            )}
            <Icon
              name={row.icon}
              x={padding}
              y={centerY - rowIconSize / 2}
              color={
                row.icon === "activity" || row.icon === "repo" ? colors.icon : colors[row.icon]
              }
            />
            <text
              x={labelX}
              y={centerY}
              dominant-baseline="central"
              font-size={typography.label}
              fill={colors.text}
            >
              {row.label}
            </text>
            {(["last12Months", "allTime"] as const).map((column) => (
              <text
                key={column}
                x={valueColumns[column]}
                y={centerY}
                text-anchor="end"
                dominant-baseline="central"
                font-size={valueSize}
                font-weight={row.emphasize ? 700 : 400}
                fill={colors.value}
              >
                {number(row[column])}
              </text>
            ))}
          </g>
        );
      })}
    </g>
  );
}

function SectionHeading({
  top,
  title,
  meta,
  colors,
}: {
  top: number;
  title: string;
  meta: string;
  colors: Palette;
}) {
  const centerY = top + lineHeight.section / 2;
  return (
    <g>
      <text
        x={padding}
        y={centerY}
        dominant-baseline="central"
        font-size={typography.section}
        font-weight="600"
        fill={colors.title}
      >
        {title}
      </text>
      <text
        x={contentRight}
        y={centerY}
        text-anchor="end"
        dominant-baseline="central"
        font-size={typography.meta}
        fill={colors.muted}
      >
        {meta}
      </text>
    </g>
  );
}

// Sized so Overview is exactly as tall as My Projects with five repositories.
const avatarSize = 72;

function ProfileHeader({ snapshot, colors }: CardProps) {
  const r = avatarSize / 2;
  const cx = padding + r;
  const cy = contentTop + r;
  return (
    <g>
      {snapshot.avatarDataUrl ? (
        <g>
          <defs>
            <clipPath id="overview-avatar">
              <circle cx={cx} cy={cy} r={r} />
            </clipPath>
          </defs>
          <image
            href={snapshot.avatarDataUrl}
            x={cx - r}
            y={cy - r}
            width={avatarSize}
            height={avatarSize}
            preserveAspectRatio="xMidYMid slice"
            clip-path="url(#overview-avatar)"
          />
        </g>
      ) : (
        <g>
          <circle cx={cx} cy={cy} r={r} fill={colors.border} />
          <text
            x={cx}
            y={cy}
            text-anchor="middle"
            dominant-baseline="central"
            font-size={typography.title}
            font-weight="700"
            fill={colors.muted}
          >
            {snapshot.user.slice(0, 1).toUpperCase()}
          </text>
        </g>
      )}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={colors.border} />
      <text
        x={padding + avatarSize + space.group}
        y={cy}
        dominant-baseline="central"
        font-size={typography.profile}
        font-weight="700"
        fill={colors.title}
      >
        @{snapshot.user}
      </text>
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
  const keys = Object.keys(labels) as (keyof typeof labels)[];
  const metricsTop = contentTop + avatarSize + space.section;
  return (
    <Card
      name="overview"
      colors={colors}
      height={metricsTop + metricsHeight(keys.length, true) + footerHeight}
      updatedAt={snapshot.updatedAt}
      note="Total follows GitHub's calendar; public-only. Reviews count each PR once per period. Background bars compare Last 12 Months / All Time, scaled to the largest share."
    >
      <ProfileHeader snapshot={snapshot} colors={colors} />
      <Metrics
        colors={colors}
        top={metricsTop}
        relativeShare
        rows={keys.map((key) => ({
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
  const slashWidth = estimateTextWidth("/", size);
  const columnCount = rows[0]?.length ?? 0;
  const ends: number[] = [];
  const separators: number[] = [];
  let x = right;
  for (let column = columnCount - 1; column >= 0; column--) {
    ends.unshift(x);
    x -= Math.max(...rows.map((row) => estimateTextWidth(String(row[column]), size)));
    if (column > 0) {
      separators.unshift(x - space.part - slashWidth / 2);
      x -= slashWidth + space.part * 2;
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
}) {
  return (
    <g>
      {values.map((value, column) => (
        <text
          key={column}
          x={layout.ends[column]}
          text-anchor="end"
          dominant-baseline="central"
          {...attributes}
        >
          {value}
        </text>
      ))}
      {layout.separators.map((x, column) => (
        <text key={column} x={x} text-anchor="middle" dominant-baseline="central" {...attributes}>
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
  let x = barLeft;
  return (
    <g opacity="0.18" aria-hidden="true">
      {segments.map((segment, index) => {
        const width = barWidth(segment.count, max);
        const start = x;
        x += width;
        return (
          <rect
            key={index}
            x={start}
            y={y}
            width={width}
            height={lineHeight.row}
            fill={segment.color}
          />
        );
      })}
    </g>
  );
}

function RepositoryName({
  card,
  repository,
  width,
  y,
  size,
  ...attributes
}: {
  card: CardName;
  repository: string;
  width: number;
  y: number;
  size: number;
  fill: string;
  "font-weight"?: string;
}) {
  return (
    <text
      x={labelX}
      y={y}
      dominant-baseline="central"
      font-size={size}
      clip-path={`url(#${card}-repository)`}
      {...attributes}
    >
      {fitText(repository, width, size)}
    </text>
  );
}
function RepositoryClip({
  card,
  width,
  height,
}: {
  card: CardName;
  width: number;
  height: number;
}) {
  return (
    <defs>
      <clipPath id={`${card}-repository`}>
        <rect x={labelX} width={Math.max(0, width)} height={height} />
      </clipPath>
    </defs>
  );
}

function Projects({ snapshot, colors }: CardProps) {
  const { myProjects } = snapshot;
  const rows = myProjects.topRepositories;
  const sectionTop = contentTop + metricsHeight(2) + space.section;
  const rowsTop = sectionTop + lineHeight.section + space.header;
  const height = rowsTop + listHeight(Math.max(1, rows.length)) + footerHeight;
  const max = Math.max(1, ...rows.map((row) => row.commits));
  const commitsWidth = Math.max(
    0,
    ...rows.map((row) => estimateTextWidth(number(row.commits), typography.repository)),
  );
  const nameWidth = contentRight - commitsWidth - space.group - labelX;
  return (
    <Card
      name="projects"
      colors={colors}
      height={height}
      updatedAt={snapshot.updatedAt}
      note="Qualifying commits to owned public non-forks; profile repository excluded; archived repositories included."
    >
      <RepositoryClip card="projects" width={nameWidth} height={height} />
      <Metrics
        colors={colors}
        top={contentTop}
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
      <SectionHeading
        top={sectionTop}
        title="Most Active Repositories"
        meta="Last 12 Months · commits"
        colors={colors}
      />
      {rows.length === 0 ? (
        <text
          x={padding}
          y={rowsTop + lineHeight.row / 2}
          dominant-baseline="central"
          font-size={typography.body}
          fill={colors.muted}
        >
          No qualifying commits in this period.
        </text>
      ) : (
        rows.map((row, index) => {
          const y = rowTop(rowsTop, index);
          const centerY = y + lineHeight.row / 2;
          return (
            <g key={row.repository}>
              <title>
                {row.repository}: {row.commits} commits
              </title>
              <RepositoryBackground
                y={y}
                max={max}
                segments={[{ count: row.commits, color: colors.commit }]}
              />
              <Icon name="repo" x={padding} y={centerY - rowIconSize / 2} color={colors.icon} />
              <RepositoryName
                card="projects"
                repository={row.repository}
                width={nameWidth}
                y={centerY}
                size={typography.repository}
                fill={colors.text}
              />
              <text
                x={contentRight}
                y={centerY}
                text-anchor="end"
                dominant-baseline="central"
                font-size={typography.repository}
                fill={colors.value}
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
  const keys = Object.keys(labels) as (keyof typeof labels)[];
  const sectionTop = contentTop + metricsHeight(keys.length) + space.section;
  // The legend explains the heading's table, so the two lines form one header.
  const legendTop = sectionTop + lineHeight.section + space.part;
  const legendY = legendTop + lineHeight.legend / 2;
  const rowsTop = legendTop + lineHeight.legend + space.header;
  const height = rowsTop + listHeight(Math.max(1, rows.length)) + footerHeight;
  const max = Math.max(1, ...rows.map((row) => row.prs + row.reviews + row.issues));
  const countLayout = separatedColumns(
    rows.map((row) => [row.prs, row.reviews, row.issues]),
    valueColumns.last12Months,
    typography.body,
  );
  const nameWidth = valueColumns.last12Months - countLayout.width - space.group - labelX;
  let legendX = padding;
  const legend = (
    [
      { label: "PRs", color: colors.pr, icon: "pr" },
      { label: "Reviews", color: colors.review, icon: "review" },
      { label: "Issues", color: colors.issue, icon: "issue" },
    ] satisfies { label: string; color: string; icon: IconName }[]
  ).map((item) => {
    const iconX = legendX;
    const textX = iconX + legendIconSize + space.part;
    legendX = textX + estimateTextWidth(item.label, typography.meta) + space.sibling;
    return { ...item, iconX, textX };
  });
  const commitsLabelX =
    valueColumns.allTime - estimateTextWidth("Commits", typography.meta) - space.part;
  return (
    <Card
      name="oss"
      colors={colors}
      height={height}
      updatedAt={snapshot.updatedAt}
      note="External public repositories. Ranking = PRs + Reviews + Issues; commits are reference values only."
    >
      <RepositoryClip card="oss" width={nameWidth} height={height} />
      <Metrics
        colors={colors}
        top={contentTop}
        rows={keys.map((key) => ({
          label: labels[key],
          icon: metricIcons[key],
          last12Months: oss.last12Months[key],
          allTime: oss.allTime[key],
        }))}
      />
      <SectionHeading
        top={sectionTop}
        title="Most Active Repositories"
        meta="Last 12 Months · activity count"
        colors={colors}
      />
      {legend.map(({ label, color, icon, iconX, textX }) => (
        <g key={label}>
          <Icon
            name={icon}
            x={iconX}
            y={legendY - legendIconSize / 2}
            size={legendIconSize}
            color={color}
          />
          <text
            x={textX}
            y={legendY}
            dominant-baseline="central"
            font-size={typography.meta}
            fill={colors.muted}
          >
            {label}
          </text>
        </g>
      ))}
      <text
        x={valueColumns.last12Months}
        y={legendY}
        text-anchor="end"
        dominant-baseline="central"
        font-size={typography.meta}
        fill={colors.muted}
      >
        PRs / Reviews / Issues
      </text>
      <Icon
        name="commit"
        x={commitsLabelX - legendIconSize}
        y={legendY - legendIconSize / 2}
        size={legendIconSize}
        color={colors.commit}
      />
      <text
        x={valueColumns.allTime}
        y={legendY}
        text-anchor="end"
        dominant-baseline="central"
        font-size={typography.meta}
        fill={colors.muted}
      >
        Commits
      </text>
      {rows.length === 0 ? (
        <text
          x={padding}
          y={rowsTop + lineHeight.row / 2}
          dominant-baseline="central"
          font-size={typography.body}
          fill={colors.muted}
        >
          No PR, review or issue contributions in this period.
        </text>
      ) : (
        rows.map((row, index) => {
          const y = rowTop(rowsTop, index);
          const centerY = y + lineHeight.row / 2;
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
              <Icon name="repo" x={padding} y={centerY - rowIconSize / 2} color={colors.icon} />
              <RepositoryName
                card="oss"
                repository={row.repository}
                width={nameWidth}
                y={centerY}
                size={typography.repository}
                fill={colors.text}
              />
              <SeparatedCounts
                values={[row.prs, row.reviews, row.issues]}
                layout={countLayout}
                y={centerY}
                font-size={typography.body}
                fill={colors.value}
              />
              <text
                x={valueColumns.allTime}
                y={centerY}
                text-anchor="end"
                dominant-baseline="central"
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
  const headerY = contentTop + lineHeight.legend / 2;
  const rowsTop = contentTop + lineHeight.legend + space.header;
  // Every entry keeps the three-line height so the card height is predictable. The text block
  // and the counts are centred on the entry; these box heights keep all of their offsets
  // (0, 12 and 20 px) on the 4 px grid, with or without a description.
  const twoLineHeight = lineHeight.recentName + space.part + lineHeight.meta;
  const recordHeight = twoLineHeight + lineHeight.line + space.part;
  const records = rows.map((row, index) => ({
    row,
    description: row.description?.trim(),
    top: rowsTop + index * (recordHeight + space.group),
  }));
  const contentHeight = !recent
    ? lineHeight.body * 2 + space.part
    : rows.length === 0
      ? lineHeight.body
      : rows.length * recordHeight + (rows.length - 1) * space.group;
  const height = rowsTop + contentHeight + footerHeight;
  const countLayout = separatedColumns(
    rows.map((row) => [row.mergedPullRequests, row.reviews]),
    contentRight,
    typography.recentRepository,
  );
  const nameWidth = contentRight - countLayout.width - space.group - labelX;
  const descriptionWidth = contentRight - countLayout.width - space.group - padding;
  const reviewedX = contentRight - estimateTextWidth("Reviewed PRs", typography.meta);
  const reviewedIconX = reviewedX - space.part - legendIconSize;
  const slashX = reviewedIconX - space.part;
  const mergedRight = slashX - estimateTextWidth("/", typography.meta) - space.part;
  const mergedIconX =
    mergedRight - estimateTextWidth("Merged PRs", typography.meta) - space.part - legendIconSize;
  return (
    <Card
      name="recent"
      colors={colors}
      height={height}
      updatedAt={snapshot.updatedAt}
      note="Last 90 days · Reviews count distinct PRs. Repo language describes the repository, not your changes."
    >
      <RepositoryClip card="recent" width={nameWidth} height={height} />
      <text
        x={padding}
        y={headerY}
        dominant-baseline="central"
        font-size={typography.meta}
        fill={colors.muted}
      >
        {recent
          ? `Last 90 days · ${recent.from.slice(0, 10)} — ${recent.to.slice(0, 10)}`
          : "Awaiting updated collection"}
      </text>
      <Icon
        name="merged"
        x={mergedIconX}
        y={headerY - legendIconSize / 2}
        size={legendIconSize}
        color={colors.merged}
      />
      <text
        x={mergedRight}
        y={headerY}
        text-anchor="end"
        dominant-baseline="central"
        font-size={typography.meta}
        fill={colors.muted}
      >
        Merged PRs
      </text>
      <text
        x={slashX}
        y={headerY}
        text-anchor="end"
        dominant-baseline="central"
        font-size={typography.meta}
        fill={colors.muted}
      >
        /
      </text>
      <Icon
        name="review"
        x={reviewedIconX}
        y={headerY - legendIconSize / 2}
        size={legendIconSize}
        color={colors.review}
      />
      <text
        x={reviewedX}
        y={headerY}
        dominant-baseline="central"
        font-size={typography.meta}
        fill={colors.muted}
      >
        Reviewed PRs
      </text>
      {!recent ? (
        <g>
          <text
            x={padding}
            y={rowsTop + lineHeight.body / 2}
            dominant-baseline="central"
            font-size={typography.body}
            fill={colors.muted}
          >
            Repository activity needs a new collection.
          </text>
          <text
            x={padding}
            y={rowsTop + lineHeight.body + space.part + lineHeight.body / 2}
            dominant-baseline="central"
            font-size={typography.body}
            fill={colors.muted}
          >
            Existing totals remain available.
          </text>
        </g>
      ) : rows.length === 0 ? (
        <text
          x={padding}
          y={rowsTop + lineHeight.body / 2}
          dominant-baseline="central"
          font-size={typography.body}
          fill={colors.muted}
        >
          No merged PRs or reviews in the last 90 days.
        </text>
      ) : (
        records.map(({ row, description, top }, index) => {
          const centerY = top + recordHeight / 2;
          const blockTop = description ? top : top + (recordHeight - twoLineHeight) / 2;
          const nameY = blockTop + lineHeight.recentName / 2;
          const descriptionTop = blockTop + lineHeight.recentName + space.part;
          const languageY = description
            ? descriptionTop + lineHeight.line + space.part + lineHeight.meta / 2
            : descriptionTop + lineHeight.meta / 2;
          // Hangs below the centred counts rather than sharing the language line, which moves up
          // for two-line entries; the gap lines it up with the language of three-line entries.
          const lastActivityY =
            centerY + lineHeight.recentName / 2 + space.sibling + lineHeight.meta / 2;
          const descriptionClip = `recent-description-${index}`;
          return (
            <g key={row.repository}>
              <title>
                {row.repository}
                {description ? `: ${description}` : ""}; {row.mergedPullRequests} merged PRs,{" "}
                {row.reviews} reviewed PRs
              </title>
              <Icon
                name="repo"
                x={padding}
                y={nameY - rowIconSize / 2}
                size={rowIconSize}
                color={colors.accent}
              />
              <RepositoryName
                card="recent"
                repository={row.repository}
                width={nameWidth}
                y={nameY}
                size={typography.recentRepository}
                font-weight="600"
                fill={colors.accent}
              />
              <SeparatedCounts
                values={[row.mergedPullRequests, row.reviews]}
                layout={countLayout}
                y={centerY}
                font-size={typography.recentRepository}
                fill={colors.value}
              />
              {description && (
                <g>
                  <defs>
                    <clipPath id={descriptionClip}>
                      <rect
                        x={padding}
                        y={descriptionTop}
                        width={descriptionWidth}
                        height={lineHeight.line}
                      />
                    </clipPath>
                  </defs>
                  <text
                    x={padding}
                    y={descriptionTop + lineHeight.line / 2}
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
                    cx={padding + space.part}
                    cy={languageY}
                    r={space.part}
                    fill={languageOverride ?? row.primaryLanguage.color ?? colors.language}
                  />
                  <text
                    x={padding + space.part * 3}
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
                  x={padding}
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
                y={lastActivityY}
                dominant-baseline="central"
                text-anchor="end"
                font-size={typography.meta}
                fill={colors.muted}
              >
                Last activity {row.lastActivityAt.slice(0, 10)}
              </text>
              {index < records.length - 1 && (
                <line
                  x1={padding}
                  x2={contentRight}
                  y1={top + recordHeight + space.group / 2}
                  y2={top + recordHeight + space.group / 2}
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

const pendingHeight = contentTop + lineHeight.body * 2 + space.part + padding;

export function renderPendingCard(name: CardName, appearance = resolveTheme()) {
  const colors = appearance.colors;
  return `<?xml version="1.0" encoding="UTF-8"?>\n${(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={displayWidth}
      height={(pendingHeight * displayWidth) / cardWidth}
      viewBox={`0 0 ${cardWidth} ${pendingHeight}`}
      role="img"
      font-family={fontFamily}
    >
      <title>{cardTitles[name]} — Preparing statistics</title>
      <rect
        x="0.5"
        y="0.5"
        width={cardWidth - 1}
        height={pendingHeight - 1}
        rx="14"
        fill={colors.background}
        stroke={colors.border}
      />
      <text
        x={padding}
        y={padding + lineHeight.title / 2}
        dominant-baseline="central"
        font-size={typography.title}
        font-weight="700"
        fill={colors.title}
      >
        {cardTitles[name]}
      </text>
      {["Preparing statistics.", "Please check again after the next successful update."].map(
        (line, index) => (
          <text
            key={line}
            x={padding}
            y={contentTop + index * (lineHeight.body + space.part) + lineHeight.body / 2}
            dominant-baseline="central"
            font-size={typography.body}
            fill={colors.muted}
          >
            {line}
          </text>
        ),
      )}
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
          <style>{`body{margin:0;background:${colors.pageBackground};color:${colors.text};font-family:${fontFamily}}main{max-width:1140px;margin:32px auto;padding:0 20px}h1{font-size:28px;margin:0 0 10px;color:${colors.title}}p{color:${colors.muted};margin:0 0 20px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,${displayWidth}px),1fr));gap:20px;align-items:start}article{min-width:0;max-width:${displayWidth}px}h2{font-size:15px;margin:0 0 10px}img{display:block;width:100%;height:auto}a{color:${colors.accent};text-decoration:none}.controls{border:1px solid ${colors.border};background:${colors.background};border-radius:12px;padding:16px;margin-bottom:24px}.preset{display:flex;gap:12px;align-items:center;flex-wrap:wrap}select,button{font:inherit;color:${colors.text};background:${colors.background};border:1px solid ${colors.border};border-radius:6px;padding:7px 12px}button{cursor:pointer}summary{cursor:pointer;color:${colors.title};margin:16px 0}.tokens{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:12px 0 18px}.token{display:flex;align-items:center;gap:10px;font-size:13px}.token span{display:grid;gap:3px}.token code{color:${colors.muted};font-size:11px}input[type=color]{width:40px;height:32px;padding:2px;background:${colors.background};border:1px solid ${colors.border};border-radius:5px}.actions{display:flex;gap:16px;align-items:center;flex-wrap:wrap}`}</style>
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
                    width={displayWidth}
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
