import assert from "node:assert/strict";
import { test } from "vitest";
import { classify, nextCursor, twelveMonthsAgo, yearRanges } from "./collection-helpers.ts";
import type { Repository } from "./collection-helpers.ts";

const repository: Repository = {
  id: "public-repo",
  nameWithOwner: "Pugma/project",
  visibility: "PUBLIC",
  isFork: false,
  owner: { login: "Pugma" },
};

test.each([
  {
    name: "owned public repository matches a case-insensitive login",
    changes: {},
    expected: "projects",
  },
  { name: "private repository is excluded", changes: { visibility: "PRIVATE" }, expected: null },
  { name: "internal repository is excluded", changes: { visibility: "INTERNAL" }, expected: null },
  { name: "owned fork is excluded", changes: { isFork: true }, expected: null },
  {
    name: "profile repository is excluded",
    changes: { nameWithOwner: "Pugma/Pugma" },
    expected: null,
  },
  {
    name: "external fork remains eligible",
    changes: { isFork: true, owner: { login: "org" } },
    expected: "external",
  },
])("$name", ({ changes, expected }) => {
  assert.equal(classify({ ...repository, ...changes }, "pugma"), expected);
});

test("year windows cover UTC seconds without overlap and stop at collection time", () => {
  assert.deepEqual(yearRanges("2023-05-04T11:29:29Z", new Date("2024-02-29T10:00:00Z")), [
    { label: "2023", from: "2023-05-04T11:29:29.000Z", to: "2023-12-31T23:59:59.000Z" },
    { label: "2024", from: "2024-01-01T00:00:00.000Z", to: "2024-02-29T10:00:00.000Z" },
  ]);
  assert.equal(
    twelveMonthsAgo(new Date("2024-02-29T10:00:00Z")).toISOString(),
    "2023-02-28T10:00:00.000Z",
  );
});

test("pagination rejects missing and repeated cursors", () => {
  assert.throws(() => nextCursor({ hasNextPage: true, endCursor: null }, null));
  assert.throws(() => nextCursor({ hasNextPage: true, endCursor: "same" }, "same"));
  assert.equal(nextCursor({ hasNextPage: false, endCursor: "last" }, null), null);
  assert.equal(nextCursor({ hasNextPage: true, endCursor: "next" }, "previous"), "next");
});
