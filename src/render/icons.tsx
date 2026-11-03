export type IconName = "activity" | "commit" | "pr" | "merged" | "review" | "issue" | "repo";

const shapes = {
  activity: (
    <>
      <path d="M1 8h3l2-5 4 10 2-5h3" />
    </>
  ),
  commit: (
    <>
      <path d="M1 8h4m6 0h4" />
      <circle cx="8" cy="8" r="3" />
    </>
  ),
  pr: (
    <>
      <circle cx="4" cy="3" r="1.5" />
      <circle cx="4" cy="13" r="1.5" />
      <circle cx="12" cy="13" r="1.5" />
      <path d="M4 4.5v7m8 0V7a4 4 0 0 0-4-4H7m2-2L7 3l2 2" />
    </>
  ),
  merged: (
    <>
      <circle cx="4" cy="3" r="1.5" />
      <circle cx="4" cy="13" r="1.5" />
      <circle cx="12" cy="3" r="1.5" />
      <path d="M4 4.5v7m8-7c0 3.5-8 1.5-8 7" />
    </>
  ),
  review: (
    <>
      <path d="M3 2h10a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H7l-4 3v-3H2V3a1 1 0 0 1 1-1Z" />
      <path d="m5 7 2 2 4-4" />
    </>
  ),
  issue: (
    <>
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  repo: (
    <>
      <path d="M4 1.5h9v13H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Zm-2 11a2 2 0 0 1 2-2h9M5 2v5l1.5-1L8 7V2" />
    </>
  ),
};

export function Icon({
  name,
  x,
  y,
  size = 16,
  color = "currentColor",
}: {
  name: IconName;
  x: number;
  y: number;
  size?: number;
  color?: string;
}) {
  return (
    <svg
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      color={color}
      aria-hidden="true"
      focusable="false"
    >
      {shapes[name]}
    </svg>
  );
}
