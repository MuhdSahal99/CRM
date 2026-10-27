import { sql } from "drizzle-orm";
import { z } from "zod";
import { Conflict, NotFound } from "../http/errors.ts";
import type { Tx } from "../tenant.ts";
import { recordEvent } from "../timeline.ts";

// T6.01 (US-12 sender, US-11 seller VATIN): one settings row per org. api_name → column; SMTP password is not a field: only a secret reference exists.
const COLUMNS = {
  legal_name: "legal_name", address_line1: "address_line1", address_line2: "address_line2", city: "city", postal_code: "postal_code",
  country: "country", vat_number: "vat_number", share_link_ttl_days: "share_link_ttl_days",
  smtp_host: "smtp_host", smtp_port: "smtp_port", smtp_username: "smtp_username", smtp_from_email: "smtp_from_email", smtp_from_name: "smtp_from_name",
} as const;

const text = (max: number) => z.string().trim().max(max).nullable();
const Fields = z.object({
  legal_name: z.string().trim().min(1).max(200),
  address_line1: text(250), address_line2: text(250), city: text(30), postal_code: text(30),
  country: z.string().regex(/^[A-Z]{2}$/, "Use a two-letter country code."),
  vat_number: text(20),
  share_link_ttl_days: z.int().min(1).max(30),
  smtp_host: text(255), smtp_port: z.int().min(1).max(65535).nullable(), smtp_username: text(255),
  smtp_from_email: z.email().max(255).nullable(), smtp_from_name: text(120),
}).partial();
export const UpdateOrgSettingsInput = z.object({ data: z.array(Fields.extend({ version: z.int().min(1) })).length(1) });

const SELECT = sql`SELECT legal_name, address_line1, address_line2, city, postal_code, country, vat_number, base_currency, fiscal_year_start_month,
  share_link_ttl_days, smtp_host, smtp_port, smtp_username, smtp_from_email, smtp_from_name, smtp_secret_ref IS NOT NULL AS smtp_secret_configured, version FROM org_settings`;

/** GET /settings/org: never the SMTP secret, only whether one is configured. */
export async function getOrgSettings(tx: Tx) {
  const row = (await tx.execute(SELECT)).rows[0];
  if (!row) throw new NotFound();
  return [row];
}

/** PUT /settings/org (Admin): partial update at the client's version (409 if stale); logs `updated` on the org. */
export async function updateOrgSettings(tx: Tx, input: z.infer<typeof UpdateOrgSettingsInput>) {
  const { version, ...changes } = input.data[0]!;
  const orgId = (await tx.execute<{ id: string }>(sql`SELECT app.org_id() AS id`)).rows[0]!.id;
  const before = (await tx.execute<Record<string, unknown> & { version: number }>(sql`${SELECT} FOR UPDATE`)).rows[0];
  if (!before) throw new NotFound();
  if (before.version !== version) throw new Conflict("VERSION_CONFLICT", "The settings were changed by someone else. Reload and try again.");
  const diff = Object.entries(changes).filter(([k, v]) => before[k] !== v);
  if (diff.length > 0) {
    const set = sql.join([...diff.map(([k, v]) => sql`${sql.identifier(COLUMNS[k as keyof typeof COLUMNS])} = ${v}`), sql`version = version + 1`], sql`, `);
    await tx.execute(sql`UPDATE org_settings SET ${set}`);
    await recordEvent(tx, { recordType: "org", recordId: orgId, eventType: "updated", changes: Object.fromEntries(diff.map(([k, v]) => [k, [before[k], v]])) });
  }
  const after = (await tx.execute<{ version: number }>(sql`SELECT version FROM org_settings`)).rows[0]!;
  return [{ code: "SUCCESS", status: "success", details: { id: orgId, version: after.version } }];
}
