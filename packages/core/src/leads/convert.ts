import { sql } from "drizzle-orm";
import { z } from "zod";
import { ApiError, Conflict, NotFound } from "../http/errors.ts";
import { createRecords } from "../modules/write.ts";
import type { TenantContext, Tx } from "../tenant.ts";
import { recordEvent } from "../timeline.ts";

// US-05: converting a lead. Everything here runs inside the caller's withTenant, so RLS limits every lookup to records
// the caller can see (accounts and contacts are public in the org; the lead itself is private to its owner).

type Lookup = { id: string; name: string };
type Lead = Record<string, string | number | boolean | null> & { first_name: string | null; last_name: string; company: string; email: string | null; owner_id: string; is_converted: boolean };

/** The open lead, or 404 when it is not visible and 409 INVALID_STATE when it is already converted (AC-24). */
async function openLead(tx: Tx, id: string) {
  const { rows } = await tx.execute<Lead>(sql`SELECT * FROM leads WHERE id = ${id} AND deleted_at IS NULL FOR UPDATE`);
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

const IdRef = z.object({ id: z.uuid() });
export const ConvertLeadInput = z.object({
  data: z.array(z.object({
    Accounts: IdRef.nullish(), // {id} attaches to that Account; omitted or null creates one
    Contacts: IdRef.nullish(),
    assign_to: IdRef.optional(), // owner of the new records; the lead's owner by default
    Deals: z.null().optional(), // T5.07 adds the deal option; until then a Deal object is a 422, not silently ignored
  })).length(1),
});

/** Lead column → record api_name, for the fields a converted lead carries over (omitting empty ones). */
const carry = (lead: Lead, map: Record<string, string>) =>
  Object.fromEntries(Object.entries(map).flatMap(([column, api]) => (lead[column] == null || lead[column] === "" ? [] : [[api, lead[column]]])));

async function existing(tx: Tx, table: "accounts" | "contacts", ref: { id: string }, api_name: string) {
  const { rows } = await tx.execute(sql`SELECT 1 FROM ${sql.identifier(table)} WHERE id = ${ref.id} AND deleted_at IS NULL`);
  if (rows.length === 0) throw new ApiError(422, "INVALID_DATA", "This record does not exist.", { api_name });
  return ref.id;
}

/**
 * POST /Leads/{id}/actions/convert (US-05): an Account and a Contact (new or attached) and the `converted` flag, all in
 * the caller's transaction, so any failure leaves nothing behind. New records go through the normal create path
 * (metadata validation, `created` events) and are owned by `assign_to` or the lead's owner.
 */
export async function convertLead(tx: Tx, ctx: TenantContext, id: string, input: z.infer<typeof ConvertLeadInput>) {
  const choice = input.data[0]!;
  const lead = await openLead(tx, id);
  const Owner = { id: choice.assign_to?.id ?? lead.owner_id };

  const accountId = choice.Accounts
    ? await existing(tx, "accounts", choice.Accounts, "Accounts")
    : (await createRecords(tx, ctx, "Accounts", {
        data: [{ ...carry(lead, { company: "Account_Name", phone: "Phone", website: "Website", industry: "Industry", annual_revenue: "Annual_Revenue", no_of_employees: "Employees" }), Owner }],
      }))[0]!.details.id;

  let contactId: string;
  if (choice.Contacts) contactId = await existing(tx, "contacts", choice.Contacts, "Contacts");
  else {
    contactId = (await createRecords(tx, ctx, "Contacts", {
      data: [{
        ...carry(lead, {
          salutation: "Salutation", first_name: "First_Name", last_name: "Last_Name", designation: "Title", email: "Email", secondary_email: "Secondary_Email",
          phone: "Phone", mobile: "Mobile", fax: "Fax", lead_source: "Lead_Source", email_opt_out: "Email_Opt_Out", description: "Description",
          street: "Mailing_Street", city: "Mailing_City", state: "Mailing_State", zip_code: "Mailing_Zip", country: "Mailing_Country",
        }),
        Account_Name: { id: accountId },
        Owner,
      }],
    }))[0]!.details.id;
    await tx.execute(sql`UPDATE contacts SET converted_from_lead_id = ${id} WHERE id = ${contactId}`);
  }

  await tx.execute(sql`
    UPDATE leads SET is_converted = true, converted_at = now(), converted_by = ${ctx.userId}, converted_account_id = ${accountId},
      converted_contact_id = ${contactId}, version = version + 1 WHERE id = ${id}`);
  await recordEvent(tx, { recordType: "lead", recordId: id, eventType: "converted", meta: { account_id: accountId, contact_id: contactId } });
  return [{ Accounts: accountId, Contacts: contactId, Deals: null }];
}
