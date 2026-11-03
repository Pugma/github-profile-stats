import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { purgeCardCache, serveCards } from "./cards-handler.ts";
import { SNAPSHOT_KEY } from "../stats/storage.ts";
import { buildSnapshot } from "../collector/aggregate.ts";
import { snapshotInput } from "../../fixtures/snapshot.ts";
import { assertCardSecurityHeaders } from "../../fixtures/security-headers.ts";
import { svgGroup, svgText } from "../../fixtures/svg.ts";

const snapshot = buildSnapshot(snapshotInput());
const now = Date.parse(snapshot.period.to);
const request = (path: string, method = "GET") =>
  new Request(`https://cards.invalid${path}`, { method });

test.each(["overview", "projects", "oss", "recent"])(
  "public %s cards read only the fixed snapshot key without authentication",
  async (name) => {
    const get = vi.fn(async (_key: string) => JSON.stringify(snapshot));
    const response = await serveCards(
      request(`/cards/${name}.svg?theme=midnight`),
      { get },
      "public",
      now,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/svg+xml; charset=utf-8");
    assert.equal(response.headers.get("cache-control"), "public, max-age=0, s-maxage=72120");
    assertCardSecurityHeaders(response);
    assert.match(await response.text(), /<svg/);
    assert.deepEqual(get.mock.calls, [[SNAPSHOT_KEY]]);
  },
);

test("public gallery links stay below cards without reading KV", async () => {
  const get = vi.fn(async (_key: string) => JSON.stringify(snapshot));
  const gallery = await serveCards(request("/cards/?theme=warm"), { get }, "public");
  assert.equal(gallery.status, 200);
  assert.equal(gallery.headers.get("cache-control"), "no-store");
  assert.match(await gallery.text(), /src="\/cards\/overview\.svg\?theme=warm"/);
  assert.equal(get.mock.calls.length, 0);
});

test.each(["/", "/cards"])(
  "%s redirects to the public gallery preserving theme options",
  async (path) => {
    const get = vi.fn(async (_key: string) => JSON.stringify(snapshot));
    const response = await serveCards(request(`${path}?theme=midnight`), { get }, "public");
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("location"), "/cards/?theme=midnight");
    assert.equal(get.mock.calls.length, 0);
  },
);

test.each([
  { path: "/overview.svg", method: "GET", status: 404 },
  { path: "/refresh", method: "GET", status: 404 },
  { path: "/cards/snapshot.json", method: "GET", status: 404 },
  { path: "/cards/arbitrary.svg", method: "GET", status: 404 },
  { path: "/cards/nested/overview.svg", method: "GET", status: 404 },
  { path: "/cards/overview.svg?theme=unknown", method: "GET", status: 400 },
  { path: "/cards/overview.svg?accent=invalid", method: "GET", status: 400 },
  { path: "/cards/overview.svg?key=secret", method: "GET", status: 400 },
  { path: "/cards/overview.svg?theme=light&theme=dark", method: "GET", status: 400 },
  { path: "/cards/overview.svg", method: "POST", status: 405 },
])("$method $path returns $status before reading KV", async ({ path, method, status }) => {
  const get = vi.fn(async (_key: string) => JSON.stringify(snapshot));
  const response = await serveCards(request(path, method), { get }, "public");
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assertCardSecurityHeaders(response);
  if (status === 405) assert.equal(response.headers.get("allow"), "GET, HEAD");
  assert.equal(get.mock.calls.length, 0);
});

test("public HEAD returns GET headers with an empty body", async () => {
  const storage = { get: async () => JSON.stringify(snapshot) };
  const get = await serveCards(request("/cards/overview.svg"), storage, "public", now);
  const head = await serveCards(request("/cards/overview.svg", "HEAD"), storage, "public", now);
  assert.equal(get.status, 200);
  assert.equal(head.status, get.status);
  assert.deepEqual([...head.headers], [...get.headers]);
  assert.match(await get.text(), /<svg/);
  assert.equal(await head.text(), "");
});

test("missing public snapshots show preparation without caching", async () => {
  const response = await serveCards(request("/cards/oss.svg"), { get: async () => null }, "public");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(await response.text(), /Preparing statistics/);
});

test.each([
  { name: "invalid snapshot", get: async () => '{"secret":"private-repo"}' },
  {
    name: "KV failure",
    get: async () => {
      throw new Error("private-repo");
    },
  },
])("$name returns a generic error without caching", async ({ get }) => {
  const response = await serveCards(request("/cards/oss.svg"), { get }, "public");
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(await response.text(), "Statistics unavailable");
  assertCardSecurityHeaders(response);
});

test("cache invalidation requests a whole-entrypoint purge from Workers Cache", async () => {
  const purge = vi.fn(async (_options: { purgeEverything: true }) => ({ success: true }));
  await purgeCardCache({ purge });
  assert.deepEqual(purge.mock.calls, [[{ purgeEverything: true }]]);
});

test.each([
  { name: "missing cache context", cache: undefined },
  {
    name: "rejected purge",
    cache: { purge: async () => ({ success: false, errors: [{ message: "upstream details" }] }) },
  },
  {
    name: "upstream exception",
    cache: {
      purge: async () => {
        throw new Error("upstream details");
      },
    },
  },
])("$name reports a sanitized purge failure", async ({ cache }) => {
  await assert.rejects(purgeCardCache(cache), { message: "Card cache purge failed" });
});

test("stale public snapshots remain visible with no-store after the scheduled refresh", async () => {
  const response = await serveCards(
    request("/cards/overview.svg"),
    { get: async () => JSON.stringify(snapshot) },
    "public",
    Date.parse("2026-10-27T03:17:00Z"),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assertCardSecurityHeaders(response);
  const body = await response.text();
  const totalRow = svgGroup(body, svgText(body, "Total Contributions"));
  svgText(totalRow, "220");
  svgText(totalRow, "300");
  assert.doesNotMatch(body, /Preparing statistics/);
});
