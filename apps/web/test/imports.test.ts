import { closeQueues, contextForMember, getAuthDb, IMPORT_MODULES, type ImportModuleName, purgeFinishedImports, reconcileJob, validateImport, withTenant, writeImport } from "@crm/core";
import { connectAsApp, connectAsAuth, queryAs } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as moduleRoute from "../app/api/v1/[module]/route";
import * as confirmRoute from "../app/api/v1/imports/[id]/actions/confirm/route";
import * as errorsRoute from "../app/api/v1/imports/[id]/errors/route";
import * as jobRoute from "../app/api/v1/imports/[id]/route";
import * as importsRoute from "../app/api/v1/imports/route";
import { BASE } from "./env.ts";
import { createSignInUser, signIn } from "./api.ts";

// T11.01 to T11.08 (US-17, AC-50 to AC-57). The upload checks that run before storage need nothing; a stored CSV needs object storage (S3_*).
const csv = (rows: string[][]) => rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replaceAll('"', '""')}"` : c)).join(",")).join("\r\n") + "\r\n";
const defaultsFor = (module: ImportModuleName, headers: string[]) => Object.fromEntries(headers.filter((h) => IMPORT_MODULES[module].defaults[h]).map((h) => [h, IMPORT_MODULES[module].defaults[h]!]));

describe("Zoho import (US-17)", () => {
  let auth: Awaited<ReturnType<typeof connectAsAuth>>;
  let app: Awaited<ReturnType<typeof connectAsApp>>;
  let admin: string;
  let rep: string;
  let adminId: string;
  let adminEmail: string;
  let foreignEmail: string;
  let saqient: string;
  let demo: string;
  let adminCtx: { org_id: string; user_id: string; role: string; see_all: string };
  const tag = crypto.randomUUID().slice(0, 8);

  const upload = (cookie: string, fields: { module?: string; file?: Uint8Array | string; filename?: string; mapping?: unknown }) => {
    const form = new FormData();
    if (fields.module) form.set("module", fields.module);
    if (fields.file !== undefined) form.set("file", new File([fields.file as BlobPart], fields.filename ?? "export.csv", { type: "text/csv" }));
    if (fields.mapping !== undefined) form.set("mapping", JSON.stringify(fields.mapping));
    return importsRoute.POST!(new Request(`${BASE}/api/v1/imports`, { method: "POST", body: form, headers: { cookie } }));
  };
  const json = async (res: Response) => ({ status: res.status, body: await res.json().catch(() => null) });
  const rowsOf = async (table: string) => Number((await queryAs(app, adminCtx, `SELECT count(*) AS n FROM ${table} WHERE zoho_id LIKE $1`, [`${tag}-%`]))[0].n);

  /** Uploads, then runs the dry run the worker would run. */
  async function start(module: ImportModuleName, rows: string[][], mapping?: Record<string, string>) {
    const res = await json(await upload(admin, { module, file: csv(rows), mapping: mapping ?? defaultsFor(module, rows[0]!) }));
    expect(res.status, JSON.stringify(res.body)).toBe(202);
    const id = res.body.data[0].id as string;
    const ctx = (await contextForMember(getAuthDb(), adminId, saqient))!;
    await validateImport(ctx, id);
    return { id, ctx };
  }
  const job = async (id: string) => (await json(await jobRoute.GET!(new Request(`${BASE}/api/v1/imports/${id}`, { headers: { cookie: admin } }), { params: Promise.resolve({ id }) }))).body.data[0];
  async function confirm(id: string, ctx: Awaited<ReturnType<typeof start>>["ctx"]) {
    const res = await json(await confirmRoute.POST!(new Request(`${BASE}/api/v1/imports/${id}/actions/confirm`, { method: "POST", headers: { cookie: admin, "content-type": "application/json" }, body: "{}" }), { params: Promise.resolve({ id }) }));
    expect(res.status, JSON.stringify(res.body)).toBe(202);
    await writeImport(ctx, id);
    return job(id);
  }

  beforeAll(async () => {
    [auth, app] = await Promise.all([connectAsAuth(), connectAsApp()]);
    const orgs = (await auth.query("SELECT id, slug FROM orgs WHERE slug IN ('saqient', 'demo')")).rows;
    [saqient, demo] = ["saqient", "demo"].map((s) => orgs.find((o) => o.slug === s)!.id);
    const a = await createSignInUser(auth, saqient, "admin");
    [adminId, adminEmail] = [a.id, a.email];
    adminCtx = { org_id: saqient, user_id: a.id, role: "admin", see_all: "on" };
    admin = await signIn(a.email);
    rep = await signIn((await createSignInUser(auth, saqient, "rep")).email);
    foreignEmail = (await createSignInUser(auth, demo, "rep")).email;
  });
  afterAll(() => Promise.all([auth?.end(), app?.end(), closeQueues()]));

  it("AC-35: a rep cannot list or start an import (403)", async () => {
    expect((await importsRoute.GET!(new Request(`${BASE}/api/v1/imports`, { headers: { cookie: rep } }))).status).toBe(403);
    expect((await upload(rep, { module: "Accounts", file: csv([["Record Id", "Account Name"], ["1", "A"]]), mapping: {} })).status).toBe(403);
  });

  it("AC-56: 25 MB is 413, a binary renamed .csv is 422, more than the row cap is 422, and nothing reaches the CRM tables", async () => {
    const before = await rowsOf("accounts");
    const mapping = { "Record Id": "zoho_id", "Account Name": "Account_Name" };
    expect((await upload(admin, { module: "Accounts", file: new Uint8Array(25 * 1024 * 1024).fill(97), mapping })).status).toBe(413);
    const zip = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, ...new Uint8Array(200)]);
    const binary = await json(await upload(admin, { module: "Accounts", file: zip, filename: "export.csv", mapping }));
    expect(binary.status).toBe(422);
    expect(binary.body.message).toMatch(/zip/);
    const many = "Record Id,Account Name\n" + Array.from({ length: 100_001 }, (_, i) => `${tag}-${i},A`).join("\n");
    const capped = await json(await upload(admin, { module: "Accounts", file: many, mapping }));
    expect(capped.status).toBe(422);
    expect(capped.body.message).toMatch(/more than 100,000 rows/);
    expect(await rowsOf("accounts")).toBe(before);
  });

  it("AC-54: a mapping onto Grand_Total, id, org_id or Created_Time is a 422, and so is a missing Zoho id", async () => {
    const file = csv([["Record Id", "Account Name", "X"], ["1", "A", "9"]]);
    for (const target of ["Grand_Total", "id", "org_id", "Created_Time"]) {
      const res = await json(await upload(admin, { module: "Accounts", file, mapping: { "Record Id": "zoho_id", "Account Name": "Account_Name", X: target } }));
      expect(res.status, target).toBe(422);
      expect(res.body.message).toMatch(/cannot be imported/);
    }
    expect((await json(await upload(admin, { module: "Accounts", file, mapping: { "Account Name": "Account_Name" } }))).body.message).toMatch(/Zoho Record Id/);
  });

  it("import rows (PII) can be deleted only 90 days after their job finished, and the purge removes exactly those", async () => {
    const file = (await queryAs(app, adminCtx, "INSERT INTO files (id, org_id, kind, storage_key, filename, content_type, created_by) VALUES (gen_random_uuid(), app.org_id(), 'import_csv', 'org/' || app.org_id()::text || '/import_csv/' || gen_random_uuid()::text, 'x.csv', 'text/csv', $1) RETURNING id", [adminId]))[0].id;
    const makeJob = async (finishedAgo: string | null) => {
      const id = (await queryAs(app, adminCtx, "INSERT INTO import_jobs (id, org_id, module, source_file_id, mapping, status, finished_at) VALUES (gen_random_uuid(), app.org_id(), 'accounts', $1, '{}', 'done', CASE WHEN $2::text IS NULL THEN NULL ELSE now() - $2::interval END) RETURNING id", [file, finishedAgo]))[0].id;
      await queryAs(app, adminCtx, "INSERT INTO import_rows (id, org_id, job_id, row_no, raw, status) VALUES (gen_random_uuid(), app.org_id(), $1, 1, '{}', 'valid')", [id]);
      return id;
    };
    const [old, recent] = [await makeJob("91 days"), await makeJob("89 days")];
    await expect(queryAs(app, adminCtx, "DELETE FROM import_rows WHERE job_id = $1", [recent])).rejects.toThrow(/kept for 90 days/);
    const { withTenant } = await import("@crm/core");
    const ctx = (await contextForMember(getAuthDb(), adminId, saqient))!;
    expect(await withTenant(ctx, (tx) => purgeFinishedImports(tx))).toBeGreaterThanOrEqual(1);
    expect(await queryAs(app, adminCtx, "SELECT 1 FROM import_rows WHERE job_id = $1", [old])).toHaveLength(0);
    expect(await queryAs(app, adminCtx, "SELECT 1 FROM import_rows WHERE job_id = $1", [recent])).toHaveLength(1);
  });

  describe.skipIf(!process.env.S3_BUCKET)("with the CSV stored", () => {
    it("Accounts: the dry run writes no CRM rows (AC-53) and reports each row; the owner from another org is flagged (AC-50); confirm imports the valid ones", async () => {
      await queryAs(app, { org_id: demo, user_id: adminId, role: "admin", see_all: "on" }, "SELECT 1"); // the demo org exists for AC-51 below
      const headers = ["Record Id", "Account Owner", "Account Name", "Phone", "Industry", "Billing Country"];
      const rows = [
        headers,
        [`${tag}-100`, adminEmail, "Al Noor Trading", "+96824000000", "Retail", "Oman"],
        [`${tag}-101`, foreignEmail, "Beta LLC", "", "Technology", "OM"],
        [`${tag}-102`, "", "", "", "", ""],
        [`${tag}-103`, "", "=HYPERLINK(\"http://x\")", "", "Nonsense", ""],
      ];
      const before = await rowsOf("accounts");
      const { id, ctx } = await start("Accounts", rows);
      expect(await rowsOf("accounts")).toBe(before); // AC-53: nothing was written
      const dry = await job(id);
      expect(dry).toMatchObject({ status: "validated", total_rows: 4, valid_rows: 1, flagged_rows: 1, error_rows: 2, imported_rows: 0 });
      expect(dry.row_errors.map((e: { row_no: number }) => e.row_no).sort()).toEqual([3, 4]);
      expect(dry.row_errors.find((e: { row_no: number }) => e.row_no === 4).message).toMatch(/one of:/);

      const done = await confirm(id, ctx);
      expect(done).toMatchObject({ status: "done", imported_rows: 2, error_rows: 2 });
      expect(await rowsOf("accounts")).toBe(before + 2);
      const evidence = await withTenant(ctx, (tx) => reconcileJob(tx, id, 20)); // T11.10: counts add up and the sampled records match their rows
      expect(evidence).toMatchObject({ ok: true, sampled: 2, mismatches: [], counts: { accounted: 4, total: 4 } });
      const owner = (await queryAs(app, adminCtx, "SELECT owner_id, needs_review, billing_country, phone FROM accounts WHERE zoho_id = $1", [`${tag}-101`]))[0];
      expect(owner).toMatchObject({ owner_id: adminId, needs_review: true, billing_country: "OM" }); // AC-50: the importing Admin, flagged
      expect((await queryAs(app, adminCtx, "SELECT billing_country FROM accounts WHERE zoho_id = $1", [`${tag}-100`]))[0].billing_country).toBe("OM"); // "Oman" → OM
      expect(await queryAs(app, adminCtx, "SELECT 1 FROM timeline_events WHERE event_type = 'imported' AND meta->>'import_job_id' = $1", [id])).toHaveLength(2);

      // AC-55: the errors CSV prefixes the formula cell.
      const errors = await errorsRoute.GET!(new Request(`${BASE}/api/v1/imports/${id}/errors`, { headers: { cookie: admin } }), { params: Promise.resolve({ id }) });
      expect(errors.headers.get("content-type")).toContain("text/csv");
      const text = await errors.text();
      expect(text).toContain(`'=HYPERLINK(""http://x"")`);
      expect(text).toContain("Account Name:");

      // Importing the same file again: no new records, counted as duplicates (US-17).
      const again = await start("Accounts", rows);
      const second = await confirm(again.id, again.ctx);
      expect(second).toMatchObject({ status: "done", imported_rows: 0, duplicate_rows: 2, flagged_rows: 0, error_rows: 2 });
      expect(await rowsOf("accounts")).toBe(before + 2);
    });

    it("AC-51: a Zoho id that exists in another org leaves that org untouched and creates a new record here", async () => {
      const ownerDemo = (await auth.query("SELECT user_id FROM member WHERE org_id = $1 LIMIT 1", [demo])).rows[0].user_id;
      const demoCtx = { org_id: demo, user_id: ownerDemo, role: "admin", see_all: "on" };
      await queryAs(app, demoCtx, "INSERT INTO accounts (id, org_id, owner_id, account_name, zoho_id) VALUES (gen_random_uuid(), app.org_id(), $1, 'Demo Original', $2)", [ownerDemo, `${tag}-200`]);
      const { id, ctx } = await start("Accounts", [["Record Id", "Account Name"], [`${tag}-200`, "Saqient Copy"]]);
      expect(await confirm(id, ctx)).toMatchObject({ status: "done", imported_rows: 1 });
      expect((await queryAs(app, demoCtx, "SELECT account_name FROM accounts WHERE zoho_id = $1", [`${tag}-200`]))[0].account_name).toBe("Demo Original");
      expect((await queryAs(app, adminCtx, "SELECT account_name FROM accounts WHERE zoho_id = $1", [`${tag}-200`]))[0].account_name).toBe("Saqient Copy");
    });

    it("Contacts link to their Account by Zoho id, then name; unknown and ambiguous names are row errors, never guesses (AC-52); a mobile is normalised to E.164", async () => {
      const twin = async () => (await (await moduleRoute.POST!(new Request(`${BASE}/api/v1/Accounts`, { method: "POST", headers: { cookie: admin, "content-type": "application/json" }, body: JSON.stringify({ data: [{ Account_Name: `Twin ${tag}` }] }) }), { params: Promise.resolve({ module: "Accounts" }) })).json()).data[0].details.id;
      await twin();
      await twin();
      const target = (await start("Accounts", [["Record Id", "Account Name"], [`${tag}-300`, `Solo ${tag}`]]));
      await confirm(target.id, target.ctx);
      const headers = ["Record Id", "Last Name", "Account Name", "Mobile"];
      const { id, ctx } = await start("Contacts", [
        headers,
        [`${tag}-301`, "ByZoho", `${tag}-300`, "+968 9123 4567"],
        [`${tag}-302`, "ByName", `Solo ${tag}`, ""],
        [`${tag}-303`, "Ambiguous", `Twin ${tag}`, ""],
        [`${tag}-304`, "Unknown", `Nobody ${tag}`, ""],
      ]);
      const dry = await job(id);
      expect(dry).toMatchObject({ valid_rows: 2, error_rows: 2 });
      expect(dry.row_errors.map((e: { message: string }) => e.message).join(" ")).toMatch(/More than one account/);
      expect(dry.row_errors.map((e: { message: string }) => e.message).join(" ")).toMatch(/No account has/);
      await confirm(id, ctx);
      const linked = await queryAs(app, adminCtx, "SELECT c.last_name, c.mobile, a.zoho_id AS account FROM contacts c JOIN accounts a ON a.id = c.account_id WHERE c.zoho_id LIKE $1 ORDER BY c.last_name", [`${tag}-30%`]);
      expect(linked).toMatchObject([{ last_name: "ByName", account: `${tag}-300` }, { last_name: "ByZoho", account: `${tag}-300`, mobile: "+96891234567" }]);
    });

    it("Products and Leads import field for field; a Deal needs a known stage and links its Account by Zoho id", async () => {
      const products = await start("Products", [["Record Id", "Product Name", "Product Code", "Unit Price", "Product Active"], [`${tag}-400`, `Router ${tag}`, `RT-${tag}`, "12.500", "true"]]);
      expect(await confirm(products.id, products.ctx)).toMatchObject({ status: "done", imported_rows: 1 });
      expect((await queryAs(app, adminCtx, "SELECT unit_price, vat_category, is_active FROM products WHERE zoho_id = $1", [`${tag}-400`]))[0]).toMatchObject({ unit_price: "12.500", vat_category: "standard", is_active: true });

      const leads = await start("Leads", [["Record Id", "Last Name", "Company", "Lead Status", "Email"], [`${tag}-500`, "Lead", "Lead Co", "Contacted", "lead@example.test"]]);
      expect(await confirm(leads.id, leads.ctx)).toMatchObject({ status: "done", imported_rows: 1 });

      const acct = await start("Accounts", [["Record Id", "Account Name"], [`${tag}-600`, `Deal Co ${tag}`]]);
      await confirm(acct.id, acct.ctx);
      const deals = await start("Deals", [
        ["Record Id", "Deal Name", "Account Name", "Amount", "Closing Date", "Stage"],
        [`${tag}-601`, "Good deal", `${tag}-600`, "1,000.500", "31/12/2026", "Id. Decision Makers"],
        [`${tag}-602`, "Bad stage", `${tag}-600`, "5", "2026-12-31", "Imaginary"],
      ]);
      expect(await job(deals.id)).toMatchObject({ valid_rows: 1, error_rows: 1 });
      await confirm(deals.id, deals.ctx);
      expect((await queryAs(app, adminCtx, "SELECT d.amount, d.closing_date::text AS closing, s.api_value FROM deals d JOIN stages s ON s.id = d.stage_id WHERE d.zoho_id = $1", [`${tag}-601`]))[0]).toMatchObject({ amount: "1000.500", closing: "2026-12-31", api_value: "Identify Decision Makers" });
    });

    it("a Zoho id over 100 characters is a row error, never truncated into another record's id", async () => {
      const { id } = await start("Accounts", [["Record Id", "Account Name"], ["z".repeat(101), "Too long id"]]);
      expect(await job(id)).toMatchObject({ valid_rows: 0, error_rows: 1, row_errors: [{ row_no: 1, column: "Record Id", message: expect.stringMatching(/longer than 100/) }] });
    });

    it("a file that cannot be parsed fails the job with a message and writes nothing", async () => {
      const bad = 'Record Id,Account Name\r\n1,"fine"\r\n2,"never closed\r\n';
      const res = await json(await upload(admin, { module: "Accounts", file: bad, mapping: { "Record Id": "zoho_id", "Account Name": "Account_Name" } }));
      expect(res.status).toBe(422); // caught at upload; the worker's own parse reports the same way (parse.test.ts)
      expect(res.body.message).toMatch(/quote/);
    });
  });
});
