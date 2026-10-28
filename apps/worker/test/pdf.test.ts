import "./env.ts";
import { type TenantContext, cancelInvoice, closeQueues, contextForMember, getAuthDb, issueInvoice, openFile, provisionOrg, withTenant } from "@crm/core";
import { connectAsApp, connectAsAuth, createMember, createOrg, queryAs } from "@crm/db/testing";
import { createServer } from "node:http";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runJob } from "../src/jobs.ts";
import { closeBrowser, htmlToPdf } from "../src/pdf.ts";

// T8.11 (ADR-0010): an issued invoice renders exactly once into a ready file with its sha256, a cancel adds a second file, and
// Chromium reaches nothing. Needs a Chromium (CHROMIUM_PATH) and object storage (S3_*): skipped without them.
describe.skipIf(!process.env.CHROMIUM_PATH || !process.env.S3_BUCKET)("pdf rendering (T8.11)", () => {
  let app: pg.Client;
  let ctx: TenantContext;
  let settings: Record<string, string>;
  let invoiceId: string;

  const fileRows = () => queryAs(app, settings, "SELECT id, status, sha256, filename FROM files WHERE record_id = $1 ORDER BY created_at", [invoiceId]);
  const job = (file_id: string) => runJob("pdf", { org_id: ctx.orgId, user_id: ctx.userId, file_id });
  const bytes = (id: string) => withTenant(ctx, async (tx) => Buffer.from(await new Response((await openFile(tx, id)).stream).arrayBuffer()));

  beforeAll(async () => {
    app = await connectAsApp();
    const auth = await connectAsAuth();
    const org = await createOrg(auth);
    const admin = await createMember(auth, org, "admin");
    await auth.end();
    settings = { org_id: org, user_id: admin, role: "admin", see_all: "on" };
    ctx = (await contextForMember(getAuthDb(), admin, org))!;
    await withTenant(ctx, provisionOrg);
    await queryAs(app, settings, "UPDATE org_settings SET legal_name = 'Saqient LLC', address_line1 = 'PO Box 1', city = 'Muscat', vat_number = 'OM1100000001'");
    const [{ id: account }] = await queryAs(app, settings, "INSERT INTO accounts (id, org_id, owner_id, account_name, vat_number) VALUES (gen_random_uuid(), app.org_id(), $1, 'Al Noor', 'OM2200000002') RETURNING id", [admin]);
    const [{ id: product }] = await queryAs(app, settings, "INSERT INTO products (id, org_id, owner_id, product_name, vat_category, unit_price) VALUES (gen_random_uuid(), app.org_id(), $1, 'Router', 'standard', 10) RETURNING id", [admin]);
    [{ id: invoiceId }] = await queryAs(app, settings, `INSERT INTO invoices (id, org_id, owner_id, subject, account_id, currency, currency_scale, exchange_rate, sub_total, vat_total, grand_total, vat_total_omr, grand_total_omr)
      VALUES (gen_random_uuid(), app.org_id(), $1, 'I', $2, 'OMR', 3, 1, 10, 0.5, 10.5, 0.5, 10.5) RETURNING id`, [admin, account]);
    await queryAs(app, settings, `INSERT INTO invoice_lines (id, org_id, invoice_id, line_no, product_id, description, quantity, list_price, amount, discount_amount, net_amount, vat_category, vat_rate, vat_amount, line_total)
      VALUES (gen_random_uuid(), app.org_id(), $1, 1, $2, '<img src=x onerror=alert(1)>', 1, 10, 10, 0, 10, 'standard', 5, 0.5, 10.5)`, [invoiceId, product]);
  });
  afterAll(async () => {
    await Promise.all([app?.end(), closeQueues(), closeBrowser()]);
    await getAuthDb().$client.end();
  });

  it("issuing queues one pending file; rendering it stores a PDF with its sha256, and a second delivery does nothing", async () => {
    await withTenant(ctx, (tx) => issueInvoice(tx, invoiceId));
    const [pending] = await fileRows();
    expect(pending).toMatchObject({ status: "pending", filename: expect.stringMatching(/^INV-\d+\.pdf$/) });
    expect(await job(pending.id)).toEqual({ status: "ready" });
    expect(await job(pending.id)).toEqual({ skipped: "already rendered" });
    const [ready] = await fileRows();
    const pdf = await bytes(ready.id);
    expect(ready).toMatchObject({ status: "ready" });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect((await import("node:crypto")).createHash("sha256").update(pdf).digest().equals(Buffer.from(ready.sha256))).toBe(true);
    expect(await fileRows()).toHaveLength(1);
  });

  it("cancelling renders a second file with the CANCELLED watermark and leaves the issued PDF alone", async () => {
    const [issued] = await fileRows();
    const before = (await bytes(issued.id)).toString("hex");
    await withTenant(ctx, (tx) => cancelInvoice(tx, invoiceId, { reason: "issued in error" }));
    const rows = await fileRows();
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ status: "pending", filename: expect.stringMatching(/-cancelled\.pdf$/) });
    expect(await job(rows[1].id)).toEqual({ status: "ready" });
    expect((await bytes(issued.id)).toString("hex")).toBe(before);
  });

  it("Chromium makes no outbound request, even for an img or a stylesheet", async () => {
    let hits = 0;
    const server = createServer((_, res) => { hits++; res.end(); }).listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const { port } = server.address() as { port: number };
    try {
      const pdf = await htmlToPdf(`<!doctype html><link rel="stylesheet" href="http://127.0.0.1:${port}/a.css"><img src="http://127.0.0.1:${port}/a.png"><p>hi</p>`);
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(hits).toBe(0);
    } finally {
      server.close();
    }
  });
});
