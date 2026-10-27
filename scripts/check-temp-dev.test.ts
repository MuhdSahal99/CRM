import assert from "node:assert/strict";
import { test } from "node:test";
import { listedIds, unlistedMarkers } from "./check-temp-dev.ts";

const READINESS = `# Production Readiness

## TEMP-DEV flags

| ID | Flag | Why | Remove by |
|----|------|-----|-----------|
| TD-1 | \`MAIL_SINK\` | dev mail | slice 9 |

## Launch checklist
| TD-9 | not in the flags table | | |
`;

test("reads the IDs of the TEMP-DEV flags table only", () => {
  assert.deepEqual([...listedIds(READINESS)], ["TD-1"]);
});

test("fails on a marker whose id is not listed, and names where it is", () => {
  const files = { "a.ts": "const x = 1; // TEMP-DEV: TD-1", "b.ts": "if (dev) {} // TEMP-DEV: TD-2" };
  assert.deepEqual(unlistedMarkers(files, listedIds(READINESS)), ["b.ts: TD-2"]);
});

test("passes when every marker is listed", () => {
  assert.deepEqual(unlistedMarkers({ "a.ts": "// TEMP-DEV: TD-1" }, listedIds(READINESS)), []);
});
