import { closeQueues, log, QUEUES, type QueueName, redis } from "@crm/core";
import { Worker } from "bullmq";
import { closeBrowser } from "./pdf.ts";
import { allOrgIds, runJob, sweepPendingFiles } from "./jobs.ts";

// T8.09 (ADR-0011): one BullMQ Worker per queue. A job that exhausts its attempts stays in the queue's failed set (the dead-letter
// queue the alert watches). SIGTERM finishes the running jobs first.
const workers = (Object.keys(QUEUES) as QueueName[]).map((name) => {
  const worker = new Worker(name, (job) => runJob(name, job.data), { connection: redis(), concurrency: QUEUES[name].concurrency });
  worker.on("failed", (job, error) => log.error({ queue: name, job_id: job?.id, attempts: job?.attemptsMade, err: error.message }, "job failed"));
  return worker;
});

const sweeper = setInterval(async () => {
  try {
    for (const orgId of await allOrgIds()) await sweepPendingFiles(orgId);
  } catch (error) {
    log.error({ err: error }, "sweep failed");
  }
}, 60_000);

process.on("SIGTERM", async () => {
  clearInterval(sweeper);
  await Promise.all(workers.map((w) => w.close()));
  await closeQueues();
  await closeBrowser();
  process.exit(0);
});
log.info({ queues: Object.keys(QUEUES) }, "worker started");
