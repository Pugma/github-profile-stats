import assert from "node:assert/strict";

import { test } from "vitest";

import { latestScheduledRefresh } from "./refresh-schedule.ts";

test.each([
  ["2026-10-26T08:59:59Z", "2026-10-25T21:00:00Z"],
  ["2026-10-26T09:00:00Z", "2026-10-26T09:00:00Z"],
  ["2026-10-26T20:59:59Z", "2026-10-26T09:00:00Z"],
  ["2026-10-26T21:00:00Z", "2026-10-26T21:00:00Z"],
])("latest refresh at %s is %s", (now, expected) => {
  assert.equal(latestScheduledRefresh(Date.parse(now)), Date.parse(expected));
});
