export const colorTokens = [
  "background",
  "border",
  "title",
  "text",
  "muted",
  "icon",
  "value",
  "accent",
  "commit",
  "pr",
  "merged",
  "review",
  "issue",
  "language",
  "pageBackground",
] as const;
export type ColorToken = (typeof colorTokens)[number];
export type Palette = Record<ColorToken, string>;
export const themeNames = ["light", "dark", "midnight", "warm"] as const;
export type ThemeName = (typeof themeNames)[number];
// GitHub Primer: fgColor.open / fgColor.done / fgColor.accent.
// https://github.com/primer/primitives/blob/main/src/tokens/functional/color/fgColor.json5
const githubColors = {
  light: { open: "#1a7f37", done: "#8250df", accent: "#0969da" },
  dark: { open: "#3fb950", done: "#ab7df8", accent: "#4493f8" },
};
export const themes: Record<ThemeName, { label: string; colors: Palette }> = {
  light: {
    label: "Light",
    colors: {
      background: "#ffffff",
      border: "#e1e7ef",
      title: "#18243b",
      text: "#18243b",
      muted: "#52627a",
      icon: "#52627a",
      value: "#18243b",
      accent: "#385ee8",
      commit: "#385ee8",
      pr: githubColors.light.open,
      merged: githubColors.light.done,
      review: githubColors.light.accent,
      issue: "#bc4c00",
      language: "#385ee8",
      pageBackground: "#f3f6fb",
    },
  },
  dark: {
    label: "Dark",
    colors: {
      background: "#161b22",
      border: "#30363d",
      title: "#f0f6fc",
      text: "#d1d9e0",
      muted: "#9ba9b8",
      icon: "#9ba9b8",
      value: "#f0f6fc",
      accent: "#79b8ff",
      commit: "#79b8ff",
      pr: githubColors.dark.open,
      merged: githubColors.dark.done,
      review: githubColors.dark.accent,
      issue: "#ffa657",
      language: "#79b8ff",
      pageBackground: "#0d1117",
    },
  },
  midnight: {
    label: "Midnight",
    colors: {
      background: "#191c32",
      border: "#363b5b",
      title: "#eeedff",
      text: "#d1d4ed",
      muted: "#a4aecf",
      icon: "#a4aecf",
      value: "#eeedff",
      accent: "#b6a0ff",
      commit: "#b6a0ff",
      pr: githubColors.dark.open,
      merged: githubColors.dark.done,
      review: githubColors.dark.accent,
      issue: "#ffa657",
      language: "#b6a0ff",
      pageBackground: "#111326",
    },
  },
  warm: {
    label: "Warm",
    colors: {
      background: "#fffcf5",
      border: "#e7dcc9",
      title: "#3f342d",
      text: "#4b4038",
      muted: "#77685a",
      icon: "#77685a",
      value: "#3f342d",
      accent: "#a7472f",
      commit: "#a7472f",
      pr: githubColors.light.open,
      merged: githubColors.light.done,
      review: githubColors.light.accent,
      issue: "#bc4c00",
      language: "#a7472f",
      pageBackground: "#f3ede2",
    },
  },
};
export type Appearance = { theme: ThemeName; colors: Palette; overrides: Partial<Palette> };

export class ThemeError extends Error {
  constructor() {
    super(
      "Invalid theme options. Use a preset theme and 3- or 6-digit hex colors; language also accepts auto.",
    );
  }
}

export function resolveTheme(theme = "light", overrides: Record<string, string> = {}): Appearance {
  if (!themeNames.includes(theme as ThemeName)) throw new ThemeError();
  const normalized: Partial<Palette> = {};
  for (const [token, value] of Object.entries(overrides)) {
    if (token === "language" && value === "auto") continue;
    if (!colorTokens.includes(token as ColorToken) || !/^#?(?:[\da-f]{3}|[\da-f]{6})$/i.test(value))
      throw new ThemeError();
    const hex = value.replace(/^#/, "").toLowerCase();
    normalized[token as ColorToken] =
      "#" + (hex.length === 3 ? Array.from(hex, (digit) => digit + digit).join("") : hex);
  }
  return {
    theme: theme as ThemeName,
    colors: { ...themes[theme as ThemeName].colors, ...normalized },
    overrides: normalized,
  };
}

export function parseAppearance(parameters: URLSearchParams): Appearance {
  const overrides: Record<string, string> = Object.create(null);
  const seen = new Set<string>();
  for (const [name, value] of parameters) {
    if (seen.has(name)) throw new ThemeError();
    seen.add(name);
    if (name !== "theme") overrides[name] = value;
  }
  return resolveTheme(parameters.get("theme") ?? "light", overrides);
}

export function appearanceQuery(appearance: Appearance) {
  const parameters = new URLSearchParams({ theme: appearance.theme });
  for (const token of colorTokens) {
    const value = appearance.overrides[token];
    if (value !== undefined) parameters.set(token, value.slice(1));
  }
  return parameters.toString();
}
