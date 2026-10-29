import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// T11.11: k6 itself needs a staging tenant, so this guards the part that decides pass or fail: each script must keep a p95 < 1 s threshold on its
// own requests, and a request failure threshold. Removing or loosening either makes the load run stop failing when the budget is missed.
for (const [name, kind] of [["list", "list"], ["detail", "detail"]] as const) {
  test(`scripts/load/${name}.js fails the run when p95 reaches 1 s`, () => {
    const script = readFileSync(new URL(`./load/${name}.js`, import.meta.url), "utf8");
    assert.match(script, new RegExp(`"http_req_duration\\{kind:${kind}\\}": \\["p\\(95\\)<1000"\\]`));
    assert.match(script, /http_req_failed: \["rate<0\.01"\]/);
    assert.match(script, new RegExp(`tags: \\{ kind: "${kind}" \\}`));
    assert.doesNotMatch(script, /abortOnFail:\s*false/);
  });
}
