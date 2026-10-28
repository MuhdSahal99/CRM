import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { parseConfig } from "../config.ts";
import { log } from "../log.ts";
import { onCommit, type Tx } from "../tenant.ts";
import { type Payload, QUEUES, type QueueName } from "./queues.ts";

// T8.09 (ADR-0011): enqueue after commit. The job id comes from the intent (pdf-<file_id>; BullMQ forbids a colon in a custom id), so a second enqueue of the same
// intent, from a retry or the sweeper, is a no-op in BullMQ.

let connection: Redis | undefined;
const queues = new Map<QueueName, Queue>();

export const redis = () => (connection ??= new Redis(parseConfig(process.env).REDIS_URL, { maxRetriesPerRequest: null }));
export function getQueue(name: QueueName): Queue {
  let q = queues.get(name);
  if (!q) queues.set(name, (q = new Queue(name, { connection: redis(), defaultJobOptions: { attempts: QUEUES[name].attempts, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: true } })));
  return q;
}

/** Queues the job once `tx` commits. If Redis is down the row stays `pending` and the sweeper picks it up; the request does not fail. */
export function enqueueAfterCommit<Q extends QueueName>(tx: Tx, name: Q, payload: Payload<Q>, intent: string): void {
  const parsed = QUEUES[name].payload.parse(payload);
  onCommit(tx, async () => {
    try {
      await getQueue(name).add(name, parsed, { jobId: `${name}-${intent}` });
    } catch (error) {
      log.error({ err: error, queue: name, intent }, "enqueue failed; the sweeper will retry");
    }
  });
}

export async function closeQueues() {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
  connection?.disconnect();
  connection = undefined;
}
