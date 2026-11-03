import assert from "node:assert/strict";
import { test } from "vitest";
import { cardCacheControl } from "./refresh-schedule.ts";

test.each([
  {
    name: "previous-cycle data expires at the upcoming refresh",
    snapshotTo: "2026-10-25T07:15:00Z",
    now: "2026-10-26T03:16:00Z",
    expected: "public, max-age=0, s-maxage=60",
  },
  {
    name: "previous-cycle data is not cached at the refresh boundary",
    snapshotTo: "2026-10-25T07:15:00Z",
    now: "2026-10-26T03:17:00Z",
    expected: "no-store",
  },
  {
    name: "previous-cycle data is not cached after the refresh boundary",
    snapshotTo: "2026-10-25T07:15:00Z",
    now: "2026-10-26T03:17:01Z",
    expected: "no-store",
  },
  {
    name: "current-cycle data can be cached until the next daily refresh",
    snapshotTo: "2026-10-26T03:17:00Z",
    now: "2026-10-26T03:17:00Z",
    expected: "public, max-age=0, s-maxage=86400",
  },
  {
    name: "cache lifetime decreases as the next refresh approaches",
    snapshotTo: "2026-10-26T03:17:00Z",
    now: "2026-10-26T03:17:01Z",
    expected: "public, max-age=0, s-maxage=86399",
  },
  {
    name: "fractional remaining lifetime rounds up to one second",
    snapshotTo: "2026-10-26T03:17:00Z",
    now: "2026-10-27T03:16:59.999Z",
    expected: "public, max-age=0, s-maxage=1",
  },
  {
    name: "current data becomes stale at the next refresh boundary",
    snapshotTo: "2026-10-26T03:17:00Z",
    now: "2026-10-27T03:17:00Z",
    expected: "no-store",
  },
])("$name", ({ snapshotTo, now, expected }) => {
  assert.equal(cardCacheControl(snapshotTo, Date.parse(now)), expected);
});
