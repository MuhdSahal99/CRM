import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectAsApp, connectAsAuth, createMember, createOrg, queryAs } from "./db";

// T7.04: quotes and quote_lines (ADR-0007). RLS/FORCE are checked by rls.test.ts.
describe("quote tables (T7.04)", () => {
  let app: pg.Client;
  const admin = {} as Record<string, string>;
  const repA = {} as Record<string, string>;
  const repB = {} as Record<string, string>;
  let account: string;
  let product: string;
  let quoteA: string;

  const quote = (c: Record<string, string>, { currency = "OMR", scale = 3, rate = "1", sub = "10.000", vat = "0.500", adj = "0.000", grand = "10.500" } = {}) =>
    queryAs(app, c, `INSERT INTO quotes (id, org_id, owner_id, subject, account_id, currency, currency_scale, exchange_rate, sub_total, vat_total, adjustment, grand_total, vat_total_omr, grand_total_omr, quote_number)
      VALUES (gen_random_uuid(), app.org_id(), $1, 'Q', $2, $3, $4, $5, $6, $7, $8, $9, 0, 0, 'QT-' || left(gen_random_uuid()::text, 8)) RETURNING id`, [c.user_id, account, currency, scale, rate, sub, vat, adj, grand]);
  const line = (c: Record<string, string>, quoteId: string, { net = "10.000", amount = "10.000", discount = "0.000" } = {}) =>
    queryAs(app, c, `INSERT INTO quote_lines (id, org_id, quote_id, line_no, product_id, quantity, list_price, amount, discount_amount, net_amount, vat_category, vat_rate, vat_amount, line_total)
      VALUES (gen_random_uuid(), app.org_id(), $1, 1, $2, 1, 10, $3, $4, $5, 'standard', 5, 0.5, $6) RETURNING id`, [quoteId, product, amount, discount, net, (Number(net) + 0.5).toFixed(3)]);

  beforeAll(async () => {
    app = await connectAsApp();
    const auth = await connectAsAuth();
    const org = await createOrg(auth);
    const adminId = await createMember(auth, org, "admin");
    const manager = await createMember(auth, org, "manager");
    const [a, b] = [await createMember(auth, org, "rep", manager), await createMember(auth, org, "rep", manager)];
    await auth.end();
    Object.assign(admin, { org_id: org, user_id: adminId, role: "admin", see_all: "on" });
    Object.assign(repA, { org_id: org, user_id: a, role: "rep", visible_owner_ids: a });
    Object.assign(repB, { org_id: org, user_id: b, role: "rep", visible_owner_ids: b });
    await queryAs(app, admin, `INSERT INTO currencies (org_id, code, scale, is_base) VALUES (app.org_id(), 'OMR', 3, true), (app.org_id(), 'AED', 2, false)`);
    [{ id: account }] = await queryAs(app, repA, `INSERT INTO accounts (id, org_id, owner_id, account_name) VALUES (gen_random_uuid(), app.org_id(), $1, 'A') RETURNING id`, [a]);
    [{ id: product }] = await queryAs(app, admin, `INSERT INTO products (id, org_id, owner_id, product_name, vat_category, unit_price) VALUES (gen_random_uuid(), app.org_id(), $1, 'P', 'standard', 10) RETURNING id`, [adminId]);
    [{ id: quoteA }] = await quote(repA);
    await line(repA, quoteA);
  });
  afterAll(() => app?.end());

  it("a header with 3 dp in AED violates scale_ok", async () => {
    await expect(quote(repA, { currency: "AED", scale: 2, rate: "0.105", sub: "10.005", vat: "0.00", grand: "10.005" })).rejects.toThrow(/quotes_scale_ok/);
    await expect(quote(repA, { currency: "AED", scale: 2, rate: "0.105", sub: "10.00", vat: "0.50", grand: "10.50" })).resolves.toHaveLength(1);
  });

  it("grand total must equal sub + vat + adjustment", async () => {
    await expect(quote(repA, { grand: "11.000" })).rejects.toThrow(/quotes_grand_total/);
  });

  it("net_amount <> amount - discount violates the line CHECK", async () => {
    await expect(line(repA, quoteA, { net: "9.000", amount: "10.000", discount: "0.000" })).rejects.toThrow(/quote_lines_net/);
  });

  it("AC-18 (lines): rep B sees none of rep A's quote or lines; the admin sees them", async () => {
    expect(await queryAs(app, repB, `SELECT id FROM quotes WHERE id = $1`, [quoteA])).toHaveLength(0);
    expect(await queryAs(app, repB, `SELECT id FROM quote_lines WHERE quote_id = $1`, [quoteA])).toHaveLength(0);
    expect(await queryAs(app, repA, `SELECT id FROM quote_lines WHERE quote_id = $1`, [quoteA])).toHaveLength(1);
    expect(await queryAs(app, admin, `SELECT id FROM quote_lines WHERE quote_id = $1`, [quoteA])).toHaveLength(1);
    await expect(line(repB, quoteA)).rejects.toThrow();
  });
});
