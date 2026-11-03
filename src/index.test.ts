import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { snapshotInput } from "../fixtures/snapshot.ts";
import { buildSnapshot } from "./collector/aggregate.ts";
import ProfileCards from "./index.ts";
import { SNAPSHOT_KEY } from "./stats/storage.ts";

vi.mock("cloudflare:workers", () => ({
  WorkerEntrypoint: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
  WorkflowEntrypoint: class {},
}));

function worker(value: string | null) {
  const reads: string[] = [];
  const purge = vi.fn(async () => ({ success: true }));
  const context = { cache: { purge } } as unknown as ExecutionContext;
  const env = {
    PROFILE_STATS: {
      async get(key: string) {
        reads.push(key);
        return value;
      },
    },
  };
  return { entrypoint: new ProfileCards(context, env), reads, purge };
}

test("the Worker serves a card using its snapshot binding", async () => {
  const { entrypoint, reads } = worker(JSON.stringify(buildSnapshot(snapshotInput())));
  const response = await entrypoint.fetch(
    new Request("https://example.invalid/cards/overview.svg"),
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type")!, /^image\/svg\+xml/);
  assert.match(await response.text(), /<svg[^>]*>/);
  assert.deepEqual(reads, [SNAPSHOT_KEY]);
});

test("the Worker serves a pending card when no snapshot exists", async () => {
  const { entrypoint, reads } = worker(null);
  const response = await entrypoint.fetch(
    new Request("https://example.invalid/cards/overview.svg"),
  );

  assert.equal(response.status, 200);
  assert.match(await response.text(), /<svg[^>]*>/);
  assert.deepEqual(reads, [SNAPSHOT_KEY]);
});

test("the Worker redirects the gallery root and rejects unknown routes without reading KV", async () => {
  const { entrypoint, reads } = worker(null);
  const root = await entrypoint.fetch(new Request("https://example.invalid/"));
  const missing = await entrypoint.fetch(new Request("https://example.invalid/unknown"));

  assert.equal(root.status, 308);
  assert.equal(root.headers.get("location"), "/cards/");
  assert.equal(missing.status, 404);
  assert.deepEqual(reads, []);
});

test("the Worker exposes cache purging to the refresh workflow", async () => {
  const { entrypoint, purge } = worker(null);
  await entrypoint.purgeCache();
  assert.deepEqual(purge.mock.calls, [[{ purgeEverything: true }]]);
});
