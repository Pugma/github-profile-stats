import { cardCacheControl } from "../refresh-schedule.ts";
import { validateSnapshot } from "../stats/schema.ts";
import { SNAPSHOT_KEY } from "../stats/storage.ts";
import type { SnapshotReader } from "../stats/storage.ts";
import { cardNames, renderCard, renderGallery, renderPendingCard } from "./cards.tsx";
import type { CardName } from "./cards.tsx";
import { parseAppearance, ThemeError } from "./themes.ts";
import type { Appearance } from "./themes.ts";

export const cardSecurityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
};

export async function purgeCardCache(
  cache: { purge(options: { purgeEverything: true }): Promise<{ success: boolean }> } | undefined,
) {
  try {
    if (!cache || !(await cache.purge({ purgeEverything: true })).success)
      throw new Error("Cache purge rejected");
  } catch {
    throw new Error("Card cache purge failed");
  }
}

export async function serveCards(
  request: Request,
  storage: SnapshotReader,
  visibility: "public" | "private",
  now = Date.now(),
) {
  const headers = {
    ...cardSecurityHeaders,
    "Cache-Control": visibility === "private" ? "private, no-store" : "no-store",
  };
  const respond = (body: string | null, status = 200, extraHeaders: Record<string, string> = {}) =>
    new Response(request.method === "HEAD" ? null : body, {
      status,
      headers: { ...headers, ...extraHeaders },
    });
  if (request.method !== "GET" && request.method !== "HEAD")
    return respond("Method not allowed", 405, { Allow: "GET, HEAD" });
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === "/cards" || (visibility === "public" && path === "/"))
    return respond(null, 308, { Location: `/cards/${url.search}` });
  if (visibility === "public" && !path.startsWith("/cards/")) return respond("Not found", 404);
  const basePath = path.startsWith("/cards/") ? "/cards/" : "/";
  const relativePath = path.slice(basePath.length);
  const name = relativePath.slice(0, -4) as CardName;
  if (relativePath !== "" && (!relativePath.endsWith(".svg") || !cardNames.includes(name)))
    return respond("Not found", 404);
  let appearance: Appearance;
  try {
    appearance = parseAppearance(url.searchParams);
  } catch (error) {
    if (error instanceof ThemeError) return respond(error.message, 400);
    throw error;
  }
  if (relativePath === "")
    return respond(renderGallery(appearance, basePath), 200, {
      "Content-Type": "text/html; charset=utf-8",
    });
  try {
    const raw = await storage.get(SNAPSHOT_KEY);
    const svgHeaders = { "Content-Type": "image/svg+xml; charset=utf-8" };
    if (raw === null) return respond(renderPendingCard(name, appearance), 200, svgHeaders);
    const snapshot: unknown = JSON.parse(raw);
    validateSnapshot(snapshot);
    const svg = renderCard(snapshot, name, appearance);
    return respond(svg, 200, {
      ...svgHeaders,
      ...(visibility === "public"
        ? { "Cache-Control": cardCacheControl(snapshot.period.to, now) }
        : {}),
    });
  } catch {
    return respond("Statistics unavailable", 503);
  }
}
