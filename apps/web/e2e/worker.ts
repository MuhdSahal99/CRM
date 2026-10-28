import { type ChildProcess, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * Starts the job worker the way `pnpm --filter worker start` does, against the same dev database, Redis and storage as the app under test.
 * It renders the PDFs and sends the mail the specs wait for. The caller kills it in afterAll.
 */
export function startWorker(): ChildProcess {
  return spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: fileURLToPath(new URL("../../worker", import.meta.url)),
    env: { ...process.env, ALLOW_PRIVATE_SMTP: "true" }, // TEMP-DEV: smtp-private-hosts
    stdio: "ignore",
  });
}
