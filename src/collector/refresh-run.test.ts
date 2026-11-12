import assert from "node:assert/strict";

import { afterEach, beforeEach, test, vi } from "vitest";

import { fixtureTo, snapshotInput } from "../../fixtures/snapshot.ts";
import { SNAPSHOT_KEY } from "../stats/storage.ts";
import { buildSnapshot } from "./aggregate.ts";
import type { CollectOptions } from "./collect.ts";
import { runRefresh } from "./refresh-run.ts";
import type { RefreshBindings, RefreshSteps } from "./refresh-run.ts";

const snapshot = buildSnapshot(snapshotInput());
const result = {
  snapshot,
  metrics: { requests: 0, responseBytes: 0, graphqlCost: 0, remaining: 0, wallMs: 0 },
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(fixtureTo);
});
afterEach(() => vi.useRealTimers());

function fixture() {
  const events: string[] = [];
  const completed = new Map<string, unknown>();
  const put = vi.fn(async (_key: string, _value: string) => {
    events.push("publish");
  });
  const purgeCache = vi.fn(async () => {
    events.push("purge");
  });
  const sleep = vi.fn(async (_name: string, _duration: "2 minutes") => {
    events.push("wait");
  });
  const collect = vi.fn(async (_options: CollectOptions) => result);
  const steps: RefreshSteps = {
    async do(name, callback) {
      if (!completed.has(name)) completed.set(name, structuredClone(await callback()));
      return structuredClone(completed.get(name)) as Awaited<ReturnType<typeof callback>>;
    },
    async sleep(name, duration) {
      if (!completed.has(name)) {
        await sleep(name, duration);
        completed.set(name, true);
      }
    },
  };
  const env: RefreshBindings = {
    PROFILE_USER: "Pugma",
    GITHUB_TOKEN: "test-only-token",
    PROFILE_STATS: { put },
  };
  return { env, steps, events, collect, put, purgeCache, sleep };
}

test("refresh saves the validated snapshot, waits for propagation, then purges the serving cache", async () => {
  const { env, steps, events, collect, put, purgeCache, sleep } = fixture();
  const refreshed = await runRefresh(fixtureTo, env, steps, purgeCache, collect);
  assert.equal(collect.mock.calls.length, 1);
  assert.deepEqual(collect.mock.calls[0][0], {
    login: "Pugma",
    token: "test-only-token",
    now: fixtureTo,
    steps,
  });
  assert.deepEqual(put.mock.calls, [[SNAPSHOT_KEY, JSON.stringify(snapshot)]]);
  assert.deepEqual(sleep.mock.calls, [["wait-for-kv-propagation", "2 minutes"]]);
  assert.equal(purgeCache.mock.calls.length, 1);
  assert.deepEqual(events, ["publish", "wait", "purge"]);
  assert.deepEqual(refreshed, { user: "Pugma", updatedAt: snapshot.updatedAt });
});

test("failed collection leaves storage and cache untouched", async () => {
  const { env, steps, collect, put, purgeCache, sleep } = fixture();
  collect.mockRejectedValueOnce(new Error("Collection failed"));
  await assert.rejects(runRefresh(fixtureTo, env, steps, purgeCache, collect), {
    message: "Collection failed",
  });
  assert.equal(put.mock.calls.length, 0);
  assert.equal(sleep.mock.calls.length, 0);
  assert.equal(purgeCache.mock.calls.length, 0);
});

test.each([
  { name: "another profile", invalid: { ...snapshot, user: "someone-else" } },
  { name: "an unknown field", invalid: { ...snapshot, privateData: true } },
  {
    name: "another collection cutoff",
    invalid: { ...snapshot, period: { ...snapshot.period, to: "2026-10-26T07:15:01.000Z" } },
  },
])("rejects $name before writing to storage", async ({ invalid }) => {
  const { env, steps, collect, put, purgeCache, sleep } = fixture();
  collect.mockResolvedValueOnce({ ...result, snapshot: invalid });
  await assert.rejects(runRefresh(fixtureTo, env, steps, purgeCache, collect), {
    message: "Invalid public statistics snapshot",
  });
  assert.equal(put.mock.calls.length, 0);
  assert.equal(sleep.mock.calls.length, 0);
  assert.equal(purgeCache.mock.calls.length, 0);
});

test("failed publication never starts propagation wait or cache purge", async () => {
  const { env, steps, collect, put, purgeCache, sleep } = fixture();
  put.mockRejectedValueOnce(new Error("Storage unavailable"));
  await assert.rejects(runRefresh(fixtureTo, env, steps, purgeCache, collect), {
    message: "Storage unavailable",
  });
  assert.equal(put.mock.calls.length, 1);
  assert.equal(sleep.mock.calls.length, 0);
  assert.equal(purgeCache.mock.calls.length, 0);
});

test("a failed purge resumes without republishing or repeating the propagation wait", async () => {
  const { env, steps, collect, put, purgeCache, sleep } = fixture();
  purgeCache.mockRejectedValueOnce(new Error("Purge unavailable"));
  await assert.rejects(runRefresh(fixtureTo, env, steps, purgeCache, collect), {
    message: "Purge unavailable",
  });
  assert.equal(put.mock.calls.length, 1);
  assert.equal(sleep.mock.calls.length, 1);
  assert.equal(purgeCache.mock.calls.length, 1);
  await runRefresh(fixtureTo, env, steps, purgeCache, collect);
  assert.equal(put.mock.calls.length, 1);
  assert.equal(sleep.mock.calls.length, 1);
  assert.equal(purgeCache.mock.calls.length, 2);
});

test("an unpublished previous-cycle snapshot is rejected when its execution resumes", async () => {
  const { env, steps, collect, put, purgeCache, sleep } = fixture();
  put.mockRejectedValueOnce(new Error("Storage unavailable"));
  await assert.rejects(runRefresh(fixtureTo, env, steps, purgeCache, collect), {
    message: "Storage unavailable",
  });
  put.mockClear();
  vi.setSystemTime(new Date("2026-10-27T03:17:00Z"));
  await assert.rejects(
    runRefresh(fixtureTo, env, steps, purgeCache, collect),
    /older than the current refresh window/,
  );
  assert.equal(put.mock.calls.length, 0);
  assert.equal(sleep.mock.calls.length, 0);
  assert.equal(purgeCache.mock.calls.length, 0);
});
