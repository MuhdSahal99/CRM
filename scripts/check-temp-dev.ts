import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// CLAUDE.md / TRD § TEMP-DEV flags: every `// TEMP-DEV: <id>` in code must be a row of the TEMP-DEV flags table in
// docs/PRODUCTION_READINESS.md. Run by `pnpm check` and CI.

const MARKER = /TEMP-DEV:\s*([A-Za-z0-9_-]+)/g;

/** IDs in the first column of the table under "## TEMP-DEV flags". */
export function listedIds(readiness: string): Set<string> {
  const section = readiness.split(/^## /m).find((s) => s.startsWith("TEMP-DEV flags")) ?? "";
  const rows = section.split("\n").filter((line) => line.startsWith("|")).slice(2); // header and separator
  return new Set(rows.map((row) => row.split("|")[1]!.trim()).filter(Boolean));
}

/** `file: id` for every marker whose id is not listed. */
export function unlistedMarkers(files: Record<string, string>, listed: Set<string>): string[] {
  return Object.entries(files).flatMap(([file, text]) =>
    [...text.matchAll(MARKER)].map((m) => m[1]!).filter((id) => !listed.has(id)).map((id) => `${file}: ${id}`),
  );
}

if (import.meta.main) {
  const tracked = execFileSync("git", ["ls-files", "--", "*.ts", "*.tsx", "*.js", "*.mjs"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => f && !f.startsWith("scripts/check-temp-dev"));
  const files = Object.fromEntries(tracked.map((f) => [f, readFileSync(f, "utf8")]));
  const missing = unlistedMarkers(files, listedIds(readFileSync("docs/PRODUCTION_READINESS.md", "utf8")));
  if (missing.length > 0) {
    console.error(`TEMP-DEV markers missing from docs/PRODUCTION_READINESS.md § TEMP-DEV flags:\n  ${missing.join("\n  ")}`);
    process.exit(1);
  }
}
