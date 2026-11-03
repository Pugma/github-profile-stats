import assert from "node:assert/strict";
import { test, vi } from "vitest";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { executionContext, unexpectedCloudflareCall } from "../../fixtures/cloudflare.ts";
import { ProfileRefresh } from "./workflow.ts";
import type { RefreshBindings } from "./refresh-run.ts";

const runRefresh = vi.hoisted(() =>
  vi.fn(async (_now: Date, _env: unknown, _step: unknown, _purge: unknown) => ({})),
);

vi.mock("cloudflare:workers", () => ({
  WorkflowEntrypoint: class {
    constructor(
      public ctx: unknown,
      public env: unknown,
    ) {}
  },
}));
vi.mock("./refresh-run.ts", () => ({ runRefresh }));

test.each([
  {
    name: "the time passed by the Worker cron",
    payload: { scheduledTime: Date.parse("2026-11-03T03:17:00Z") },
    schedule: undefined,
    expected: "2026-11-03T03:17:00.000Z",
  },
  {
    name: "the time from an existing direct workflow schedule",
    payload: {},
    schedule: { cron: "17 3 * * *", scheduledTime: Date.parse("2026-11-03T03:17:00Z") },
    expected: "2026-11-03T03:17:00.000Z",
  },
  {
    name: "the trigger time for a manual run",
    payload: {},
    schedule: undefined,
    expected: "2026-11-03T04:00:00.000Z",
  },
])("refresh uses $name", async ({ payload, schedule, expected }) => {
  const env: RefreshBindings = {
    PROFILE_USER: "Pugma",
    GITHUB_TOKEN: "test-only-token",
    PROFILE_STATS: { put: unexpectedCloudflareCall },
  };
  const ctx = executionContext();
  const step: WorkflowStep = {
    do: unexpectedCloudflareCall,
    sleep: unexpectedCloudflareCall,
    sleepUntil: unexpectedCloudflareCall,
    waitForEvent: unexpectedCloudflareCall,
  };
  const event: WorkflowEvent<{ scheduledTime?: number }> = {
    instanceId: "test-instance",
    workflowName: "github-profile-refresh",
    timestamp: new Date("2026-11-03T04:00:00Z"),
    payload,
    schedule,
  };

  await new ProfileRefresh(ctx, env).run(event, step);

  assert.equal(runRefresh.mock.lastCall?.[0].toISOString(), expected);
});
