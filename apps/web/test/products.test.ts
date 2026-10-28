import { connectAsAuth } from "@crm/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as recordRoute from "../app/api/v1/[module]/[id]/route";
import * as moduleRoute from "../app/api/v1/[module]/route";
import { call, createSignInUser, signIn } from "./api.ts";

// T6.05 (US-08): Products are public in the org; only an Admin writes them.
describe("products (T6.05)", () => {
  let auth: Awaited<ReturnType<typeof connectAsAuth>>;
  let admin: string;
  let rep: string;
  let other: string;
  const post = (cookie: string, rec: Record<string, unknown>) => call(moduleRoute, "POST", "/Products", { cookie, params: { module: "Products" }, body: { data: [rec] } });
  const good = { Product_Name: "Router X", Product_Code: "RX-1", VAT_Category: "standard", Unit_Price: "12.500" };

  beforeAll(async () => {
    auth = await connectAsAuth();
    const { rows } = await auth.query("SELECT id, slug FROM orgs WHERE slug IN ('saqient', 'demo')");
    const id = (slug: string) => rows.find((r: { slug: string }) => r.slug === slug).id;
    admin = await signIn((await createSignInUser(auth, id("saqient"), "admin")).email);
    rep = await signIn((await createSignInUser(auth, id("saqient"), "rep")).email);
    other = await signIn((await createSignInUser(auth, id("demo"), "admin")).email);
  });
  afterAll(() => auth?.end());

  it("a rep POST, PUT or DELETE is 403; the admin creates a Zero-rated product", async () => {
    expect((await post(rep, good)).status).toBe(403);
    const res = await post(admin, { ...good, Product_Code: "ZR-1", VAT_Category: "zero_rated" });
    expect(res.status).toBe(201);
    const id = res.json().data[0].details.id;
    const p = { module: "Products", id };
    expect((await call(recordRoute, "PUT", `/Products/${id}`, { cookie: rep, params: p, body: { data: [{ Unit_Price: "1.000", version: 1 }] } })).status).toBe(403);
    expect((await call(recordRoute, "DELETE", `/Products/${id}`, { cookie: rep, params: p })).status).toBe(403);
    expect((await call(recordRoute, "GET", `/Products/${id}`, { cookie: rep, params: p })).json().data[0]).toMatchObject({ VAT_Category: "zero_rated", Unit_Price: "12.500", Product_Active: true });
    expect((await call(recordRoute, "GET", `/Products/${id}`, { cookie: other, params: p })).status).toBe(404); // another org
  });

  it("a product without a VAT category is 422; a duplicate code, case-insensitive, is 422", async () => {
    const noVat: Record<string, unknown> = { ...good, Product_Code: "NV-1" };
    delete noVat.VAT_Category;
    const res = await post(admin, noVat);
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.json())).toContain("VAT_Category");
    expect((await post(admin, good)).status).toBe(201);
    const dup = await post(admin, { ...good, Product_Code: "rx-1" });
    expect(dup.status).toBe(422);
    expect(dup.json().details.api_name).toBe("Product_Code");
  });

  it("everyone in the org lists and searches products", async () => {
    const list = await call(moduleRoute, "GET", "/Products", { cookie: rep, params: { module: "Products" } });
    expect(list.status).toBe(200);
    expect(list.json().data.map((p: { Product_Code: string }) => p.Product_Code)).toEqual(expect.arrayContaining(["RX-1", "ZR-1"]));
  });
});
