import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectAsApp, connectAsAuth, createMember, createOrg, queryAs } from "./db";

// T8.04 (ADR-0008): the invoice lock triggers, called as crm_app, so the API cannot be the only guard.
describe("invoice lock triggers (T8.04, AC-23)", () => {
  let app: pg.Client;
  const admin = {} as Record<string, string>;
  const rep = {} as Record<string, string>;
  let account: string;
  let product: string;

  const invoice = async (status: "draft" | "issued" | "paid" | "cancelled" = "draft") => {
    const [{ id }] = await queryAs(app, admin, `INSERT INTO invoices (id, org_id, owner_id, subject, account_id, currency, currency_scale, exchange_rate, sub_total, vat_total, grand_total, vat_total_omr, grand_total_omr)
      VALUES (gen_random_uuid(), app.org_id(), $1, 'I', $2, 'OMR', 3, 1, 10, 0.5, 10.5, 0.5, 10.5) RETURNING id`, [admin.user_id, account]);
    await queryAs(app, admin, `INSERT INTO invoice_lines (id, org_id, invoice_id, line_no, product_id, quantity, list_price, amount, discount_amount, net_amount, vat_category, vat_rate, vat_amount, line_total)
      VALUES (gen_random_uuid(), app.org_id(), $1, 1, $2, 1, 10, 10, 0, 10, 'standard', 5, 0.5, 10.5)`, [id, product]);
    if (status !== "draft") await queryAs(app, admin, `UPDATE invoices SET status = 'issued', invoice_number = 'INV-' || left(id::text, 8) WHERE id = $1`, [id]);
    if (status === "paid" || status === "cancelled") await queryAs(app, admin, `UPDATE invoices SET status = $2 WHERE id = $1`, [id, status]);
    return id as string;
  };
  const as = (c: Record<string, string>, sql: string, params: unknown[] = []) => queryAs(app, c, sql, params);

  beforeAll(async () => {
    app = await connectAsApp();
    const auth = await connectAsAuth();
    const org = await createOrg(auth);
    const adminId = await createMember(auth, org, "admin");
    const repId = await createMember(auth, org, "rep");
    await auth.end();
    Object.assign(admin, { org_id: org, user_id: adminId, role: "admin", see_all: "on" });
    Object.assign(rep, { org_id: org, user_id: repId, role: "rep", see_all: "on" });
    await as(admin, `INSERT INTO currencies (org_id, code, scale, is_base) VALUES (app.org_id(), 'OMR', 3, true)`);
    [{ id: account }] = await as(admin, `INSERT INTO accounts (id, org_id, owner_id, account_name) VALUES (gen_random_uuid(), app.org_id(), $1, 'A') RETURNING id`, [adminId]);
    [{ id: product }] = await as(admin, `INSERT INTO products (id, org_id, owner_id, product_name, vat_category, unit_price) VALUES (gen_random_uuid(), app.org_id(), $1, 'P', 'standard', 10) RETURNING id`, [adminId]);
  });
  afterAll(() => app?.end());

  it("a draft is editable and deletable; a number is required once it is not a draft", async () => {
    const id = await invoice();
    await as(admin, `UPDATE invoices SET sub_total = 20, grand_total = 20.5 WHERE id = $1`, [id]);
    await as(admin, `UPDATE invoice_lines SET quantity = 2 WHERE invoice_id = $1`, [id]);
    await expect(as(admin, `UPDATE invoices SET status = 'issued' WHERE id = $1`, [id])).rejects.toThrow(/invoices_number_when_issued/);
    await as(admin, `DELETE FROM invoices WHERE id = $1`, [id]);
  });

  it("AC-23: an issued invoice's totals, lines and number cannot change; it cannot be deleted", async () => {
    const id = await invoice("issued");
    await expect(as(admin, `UPDATE invoices SET grand_total = 99, sub_total = 98.5 WHERE id = $1`, [id])).rejects.toThrow(/cannot be changed/);
    await expect(as(admin, `UPDATE invoices SET invoice_number = 'X' WHERE id = $1`, [id])).rejects.toThrow(/cannot be changed/);
    await expect(as(admin, `UPDATE invoice_lines SET quantity = 5 WHERE invoice_id = $1`, [id])).rejects.toThrow(/lines of an issued invoice/);
    await expect(as(admin, `DELETE FROM invoice_lines WHERE invoice_id = $1`, [id])).rejects.toThrow(/lines of an issued invoice/);
    await expect(as(admin, `INSERT INTO invoice_lines (id, org_id, invoice_id, line_no, product_id, quantity, list_price, amount, discount_amount, net_amount, vat_category, vat_amount, line_total)
      VALUES (gen_random_uuid(), app.org_id(), $1, 2, $2, 1, 1, 1, 0, 1, 'exempt', 0, 1)`, [id, product])).rejects.toThrow(/lines of an issued invoice/);
    await expect(as(admin, `DELETE FROM invoices WHERE id = $1`, [id])).rejects.toThrow(/cannot be deleted/);
    await expect(as(admin, `UPDATE invoices SET deleted_at = now() WHERE id = $1`, [id])).rejects.toThrow(/cannot be changed/);
  });

  it("allowed transitions: issued -> paid and cancelled; nothing from cancelled; a draft cannot skip to paid", async () => {
    const draft = await invoice();
    await expect(as(admin, `UPDATE invoices SET status = 'paid' WHERE id = $1`, [draft])).rejects.toThrow(/can only be issued/);
    await as(rep, `UPDATE invoices SET status = 'paid', paid_at = now() WHERE id = $1`, [await invoice("issued")]);
    const cancelled = await invoice("issued");
    await as(rep, `UPDATE invoices SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'x' WHERE id = $1`, [cancelled]);
    await expect(as(admin, `UPDATE invoices SET status = 'issued' WHERE id = $1`, [cancelled])).rejects.toThrow(/cannot change from cancelled/);
    await expect(as(admin, `UPDATE invoices SET status = 'paid' WHERE id = $1`, [cancelled])).rejects.toThrow(/cannot change from cancelled/);
  });

  it("paid -> cancelled is allowed for an admin only", async () => {
    const id = await invoice("paid");
    await expect(as(rep, `UPDATE invoices SET status = 'cancelled' WHERE id = $1`, [id])).rejects.toThrow(/cannot change from paid/);
    await as(admin, `UPDATE invoices SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'x' WHERE id = $1`, [id]);
  });
});
