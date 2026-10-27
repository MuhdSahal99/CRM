import { newId, schema } from "@crm/db";
import { sql } from "drizzle-orm";
import type { Tx } from "./tenant";

// SCHEMA § timeline_events.
type EventType =
  | "created" | "updated" | "deleted" | "restored" | "stage_changed" | "converted" | "owner_transferred"
  | "email_sent" | "email_failed" | "whatsapp_shared" | "share_link_revoked" | "invoice_issued" | "invoice_paid"
  | "invoice_cancelled" | "note_added" | "activity_completed" | "imported" | "role_changed" | "user_deactivated";

export type TimelineEvent = {
  recordType: (typeof schema.recordType.enumValues)[number];
  recordId: string;
  eventType: EventType;
  changes?: Record<string, [unknown, unknown]>; // {api_name: [old, new]}; money as strings
  meta?: Record<string, unknown>; // never tokens or passwords
};

/**
 * Appends an event inside the caller's withTenant transaction, so it commits or rolls back with the change it
 * describes (TRD § Request lifecycle). Org and actor come from the transaction's app.* settings, not from arguments.
 */
export async function recordEvent(tx: Tx, event: TimelineEvent): Promise<void> {
  await tx.insert(schema.timelineEvents).values({
    id: newId(),
    orgId: sql`app.org_id()`,
    actorId: sql`NULLIF(current_setting('app.user_id', true), '')::uuid`,
    ...event,
  });
}
