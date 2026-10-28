import { z } from "zod";

// ADR-0011: queues, their retry settings and payloads. A payload carries ids only, never record data or secrets; the worker
// re-reads everything through withTenant as the requesting user.
export const QUEUES = {
  pdf: { attempts: 3, concurrency: 2, payload: z.object({ org_id: z.uuid(), user_id: z.uuid(), file_id: z.uuid() }) },
} as const;
export type QueueName = keyof typeof QUEUES;
export type Payload<Q extends QueueName> = z.infer<(typeof QUEUES)[Q]["payload"]>;
