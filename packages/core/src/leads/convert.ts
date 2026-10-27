import { sql } from "drizzle-orm";
import { Conflict, NotFound } from "../http/errors.ts";
import type { Tx } from "../tenant.ts";

// US-05: converting a lead. Everything here runs inside the caller's withTenant, so RLS limits every lookup to records
// the caller can see (accounts and contacts are public in the org; the lead itself is private to its owner).

type Lookup = { id: string; name: string };

/** The open lead, or 404 when it is not visible and 409 INVALID_STATE when it is already converted (AC-24). */
async function openLead(tx: Tx, id: string) {
  const { rows } = await tx.execute<{ first_name: string | null; last_name: string; company: string; email: string | null; is_converted: boolean }>(
    sql`SELECT first_name, last_name, company, email, is_converted FROM leads WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`,
  );
  if (!rows[0]) throw new NotFound();
  if (rows[0].is_converted) throw new Conflict("INVALID_STATE", "This lead is already converted.");
  return rows[0];
}

/**
 * GET /Leads/{id}/__conversion_options (reference §3.1): Contacts whose email equals the lead's (else whose name does),
 * and Accounts whose name equals the lead's Company, both case-insensitive. `preferred` is what the dialog preselects:
 * the email match, never a name-only match.
 */
export async function getConversionOptions(tx: Tx, id: string) {
  const lead = await openLead(tx, id);
  const byEmail = lead.email
    ? (await tx.execute<Lookup>(sql`SELECT id, (coalesce(first_name, '') || ' ' || last_name) AS name FROM contacts
        WHERE deleted_at IS NULL AND lower(email) = lower(${lead.email}) ORDER BY created_at, id LIMIT 5`)).rows
    : [];
  const byName = byEmail.length > 0 ? [] : (await tx.execute<Lookup>(sql`SELECT id, (coalesce(first_name, '') || ' ' || last_name) AS name FROM contacts
        WHERE deleted_at IS NULL AND lower(coalesce(first_name, '')) = lower(${lead.first_name ?? ""}) AND lower(last_name) = lower(${lead.last_name})
        ORDER BY created_at, id LIMIT 5`)).rows;
  const accounts = (await tx.execute<Lookup>(sql`SELECT id, account_name AS name FROM accounts
        WHERE deleted_at IS NULL AND lower(account_name) = lower(${lead.company}) ORDER BY created_at, id LIMIT 5`)).rows;
  const contacts = [...byEmail, ...byName].map((c) => ({ id: c.id, name: c.name.trim() }));
  return [{ Accounts: accounts, Contacts: contacts, preferred: { Accounts: accounts[0] ?? null, Contacts: byEmail[0] ? contacts[0]! : null } }];
}
