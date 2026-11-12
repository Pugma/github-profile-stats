import assert from "node:assert/strict";

import { test, vi } from "vitest";

import { executionContext, unexpectedCloudflareCall } from "../fixtures/cloudflare.ts";
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
  const purge = vi.fn(async () => ({ success: true, errors: [] }));
  const instance: WorkflowInstance = {
    id: "test-instance",
    pause: unexpectedCloudflareCall,
    resume: unexpectedCloudflareCall,
    terminate: unexpectedCloudflareCall,
    restart: unexpectedCloudflareCall,
    delete: unexpectedCloudflareCall,
    status: unexpectedCloudflareCall,
    sendEvent: unexpectedCloudflareCall,
    subscribe: unexpectedCloudflareCall,
  };
  const create = vi.fn(
    async (_options?: WorkflowInstanceCreateOptions<{ scheduledTime?: number }>) => instance,
  );
  const context = executionContext({
    cache: { purge, invalidate: unexpectedCloudflareCall },
    exports: {
      get default() {
        return unexpectedCloudflareCall();
      },
      ProfileRefresh: {
        create,
        get: unexpectedCloudflareCall,
        createBatch: unexpectedCloudflareCall,
        deleteBatch: unexpectedCloudflareCall,
      },
    },
  });
  const env = {
    PROFILE_STATS: {
      async get(key: string) {
        reads.push(key);
        return value;
      },
    },
  };
  return { entrypoint: new ProfileCards(context, env), reads, purge, create };
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

test("a scheduled event starts the refresh workflow with its scheduled time", async () => {
  const { entrypoint, create } = worker(null);
  const scheduledTime = Date.parse("2026-11-03T03:17:00Z");

  await entrypoint.scheduled({
    scheduledTime,
    cron: "17 3 * * *",
    noRetry: unexpectedCloudflareCall,
  });

  assert.deepEqual(create.mock.calls, [[{ params: { scheduledTime } }]]);
});

test("a scheduled event fails if the refresh workflow cannot be started", async () => {
  const { entrypoint, create } = worker(null);
  create.mockRejectedValueOnce(new Error("Workflow unavailable"));

  await assert.rejects(
    entrypoint.scheduled({
      scheduledTime: Date.parse("2026-11-03T03:17:00Z"),
      cron: "17 3 * * *",
      noRetry: unexpectedCloudflareCall,
    }),
    /Workflow unavailable/,
  );
});
