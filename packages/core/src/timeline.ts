import { newId, schema } from "@crm/db";
import { sql } from "drizzle-orm";
import { NotFound } from "./http/errors.ts";
import { limitOffset, pageOf } from "./modules/list.ts";
import { moduleDef } from "./modules/registry.ts";
import type { Tx } from "./tenant.ts";

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

/**
 * GET /{module}/{id}/timeline (US-15): the record's own events plus the activities linked to it, newest first. The record
 * must be visible (else 404, AC-18); events and activities then each go through their own RLS, so a private activity
 * on a public account shows only to its owner and their managers (ADR-0005).
 */
export async function listTimeline(tx: Tx, module: string, id: string, page: Parameters<typeof limitOffset>[0]) {
  const def = moduleDef(module);
  const visible = await tx.execute(sql`SELECT 1 FROM ${def.table} WHERE id = ${id} AND ${def.scope} AND deleted_at IS NULL`);
  if (visible.rows.length === 0) throw new NotFound();
  const { rows } = await tx.execute<{ id: string; event_type: string; actor_id: string | null; actor_name: string | null; occurred_at: string; changes: unknown; meta: unknown }>(sql`
    SELECT t.*, u.name AS actor_name FROM (
      SELECT id, event_type, actor_id, occurred_at, changes, meta FROM timeline_events WHERE record_type = ${def.recordType} AND record_id = ${id}
      UNION ALL
      SELECT id, 'activity_logged', created_by, created_at, NULL::jsonb,
        jsonb_build_object('activity_id', id, 'type', type, 'subject', subject, 'status', status)
      FROM activities
      WHERE deleted_at IS NULL AND ((who_type = ${def.recordType} AND who_id = ${id}) OR (what_type = ${def.recordType} AND what_id = ${id}))
    ) t LEFT JOIN org_users u ON u.id = t.actor_id
    ORDER BY t.occurred_at DESC, t.id DESC ${limitOffset(page)}`);
  return pageOf(rows.map((r) => ({
    id: r.id,
    event_type: r.event_type,
    actor: r.actor_id ? { id: r.actor_id, name: r.actor_name?.trim() ?? null } : null,
    occurred_at: new Date(r.occurred_at).toISOString(),
    changes: r.changes,
    meta: r.meta,
  })), page);
}
