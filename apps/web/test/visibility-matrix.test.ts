import { readFileSync } from "node:fs";
import { NotFound, RECORD_MODULES } from "@crm/core";
import { connectAsApp, connectAsAuth, queryAs } from "@crm/db/testing";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { z } from "zod";
import { apiRoute } from "../lib/api";
import { call as callRoute, type RouteModule, signIn } from "./api.ts";

// T1.15, AC-10, PRD M4. For every /api/v1 route file whose OpenAPI path has an {id}, a Demo admin calls it with a
// Saqient record's id and with a random UUID: the two answers must be byte-identical (a 404 on reads).
// Grows on its own: route folders mirror the spec path, `{param}` → `[param]` (e.g. app/api/v1/[module]/[id]/route.ts).

declare global {
  interface ImportMeta {
    glob<T>(pattern: string): Record<string, () => Promise<T>>; // Vite, resolved at transform time
  }
}

type AppClient = Awaited<ReturnType<typeof connectAsApp>>;
type Ref = { $ref?: string };
type Param = Ref & { name: string; in: string; schema?: Ref & { enum?: string[] } };
type Operation = { parameters?: Param[] };
type PathItem = Operation & { "x-phase"?: number } & Partial<Record<(typeof METHODS)[number], Operation>>;

const spec: { paths: Record<string, PathItem> } = parse(readFileSync(new URL("../../../docs/openapi.yaml", import.meta.url), "utf8"));
const METHODS = ["get", "put", "post", "patch", "delete"] as const;

/** Every route file, keyed by the OpenAPI path template it serves. */
const routes = Object.entries(import.meta.glob<RouteModule>("../app/api/v1/**/route.ts")).map(([file, load]) => ({
  file,
  load,
  path: file.replace(/^\.\.\/app\/api\/v1/, "").replace(/\/route\.ts$/, "").replaceAll("%5F", "_").replace(/\[(\w+)\]/g, "{$1}"),
}));

/** Follows a local `#/components/...` $ref. */
const ref = <T extends Ref>(o: T): T =>
  o.$ref ? ref(o.$ref.split("/").slice(1).reduce<Record<string, unknown>>((n, k) => n[k] as Record<string, unknown>, spec) as T) : o;

/** Every concrete combination of the enum-typed path params (module, doc_module, related_list). */
function expand(path: string): Record<string, string>[] {
  const item = spec.paths[path]!;
  const params = [item.parameters, ...METHODS.map((m) => item[m]?.parameters)].flat().filter((p): p is Param => Boolean(p)).map(ref);
  let combos: Record<string, string>[] = [{}];
  for (const p of params) {
    let values: string[] | undefined = p.in === "path" && p.schema ? ref(p.schema).enum : undefined;
    // Generic record routes serve only registered modules; the rest are a plain 404 until their slice adds an entry.
    if (p.name === "module") values = values?.filter((m) => RECORD_MODULES.includes(m));
    if (values) combos = combos.flatMap((c) => values.map((v) => ({ ...c, [p.name]: v })));
  }
  return combos;
}

/** A row of the resource the path addresses in `orgId`, read as crm_app with that org's admin context. */
async function idIn(app: AppClient, orgId: string, resource: string): Promise<string | undefined> {
  const activity: Record<string, string> = { Tasks: "task", Calls: "call", Meetings: "meeting" };
  const query =
    resource === "users" ? "SELECT user_id AS id FROM member LIMIT 1"
    : activity[resource] ? `SELECT id FROM activities WHERE type = '${activity[resource]}' LIMIT 1`
    : `SELECT id FROM ${resource === "imports" ? "import_jobs" : resource.toLowerCase()} LIMIT 1`;
  // A table that does not exist yet reads as "no row", so the failure below says what to add.
  const rows = await queryAs(app, { org_id: orgId, role: "admin", see_all: "on" }, query).catch(() => []);
  return rows[0]?.id;
}

describe("visibility matrix (T1.15)", () => {
  let app: AppClient;
  let cookie: string;
  let saqient: string;
  let demo: string;

  /** The response a Demo admin gets from `mod[method]` at the `path` template with `params`, as status + body text. */
  async function call(mod: RouteModule, method: string, path: string, params: Record<string, string>) {
    const body = ["GET", "DELETE"].includes(method) ? undefined : {};
    const { status, body: text } = await callRoute(mod, method, path.replace(/\{(\w+)\}/g, (_, k) => params[k]!), { cookie, params, body });
    return { status, body: text };
  }

  beforeAll(async () => {
    app = await connectAsApp();
    const auth = await connectAsAuth();
    const { rows } = await auth.query("SELECT id, slug FROM orgs WHERE slug IN ('saqient', 'demo')");
    await auth.end();
    [saqient, demo] = ["saqient", "demo"].map((slug) => rows.find((r) => r.slug === slug)!.id);
    cookie = await signIn("admin@demo.test");
  });
  afterAll(() => app?.end());

  it("every route file under app/api/v1 is a path in docs/openapi.yaml", () => {
    for (const r of routes) expect(spec.paths[r.path], `${r.file} has no ${r.path} in openapi.yaml`).toBeDefined();
  });

  it("AC-10: another org's id answers exactly like a random UUID, on every implemented {id} route", async () => {
    for (const route of routes.filter((r) => r.path.includes("{id}") && spec.paths[r.path]?.["x-phase"] !== 2)) {
      const mod = await route.load();
      for (const method of METHODS.map((m) => m.toUpperCase()).filter((m) => mod[m])) {
        for (const params of expand(route.path)) {
          const resource = params.module ?? params.doc_module ?? route.path.split("/")[1]!;
          const id = await idIn(app, saqient, resource);
          const label = `${method} ${route.path} ${JSON.stringify(params)}`;
          expect(id, `${label}: seed a Saqient ${resource} row so the matrix can test it`).toBeDefined();

          const other = { link_id: crypto.randomUUID(), ...params };
          const cross = await call(mod, method, route.path, { ...other, id: id! });
          const random = await call(mod, method, route.path, { ...other, id: crypto.randomUUID() });
          expect({ label, ...cross }).toEqual({ label, ...random });
          // A body route may reject `{}` with 422 before looking anything up; identical answers still reveal nothing.
          expect([404, ...(["GET", "DELETE"].includes(method) ? [] : [422])], label).toContain(cross.status);
        }
      }
    }
  });

  it("the harness itself: a lookup under RLS answers a Saqient id like a random one", async () => {
    // Fixture route, built like a real one: Demo's RLS context cannot see Saqient's members.
    const GET = apiRoute({ input: z.object({}) }, async ({ params, tx }) => {
      const { rows } = await tx.execute(sql`SELECT user_id FROM member WHERE user_id = ${z.uuid().parse(params.id)}`);
      if (rows.length === 0) throw new NotFound();
      return { data: rows };
    });
    const saqientUser = await idIn(app, saqient, "users");
    const cross = await call({ GET }, "GET", "/users/{id}", { id: saqientUser! });
    expect(cross).toEqual(await call({ GET }, "GET", "/users/{id}", { id: crypto.randomUUID() }));
    expect(cross.status).toBe(404);
    // ...and is not simply 404 for everything: a Demo member is found.
    expect((await call({ GET }, "GET", "/users/{id}", { id: (await idIn(app, demo, "users"))! })).status).toBe(200);
  });
});
