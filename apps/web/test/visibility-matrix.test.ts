import { readFileSync } from "node:fs";
import { getAuth, NotFound } from "@crm/core";
import { createDb } from "@crm/db";
import { seed } from "@crm/db/seed";
import { connectAsApp, queryAs, requireEnv, TEST_SEED_PASSWORD, testUrlFor } from "@crm/db/testing";
import { sql } from "drizzle-orm";
import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { z } from "zod";
import { apiRoute } from "../lib/api";

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
type RouteModule = Partial<Record<string, (request: Request, route: { params: Promise<Record<string, string>> }) => Promise<Response>>>;

const BASE = "http://localhost:3000";
const spec: { paths: Record<string, PathItem> } = parse(readFileSync(new URL("../../../docs/openapi.yaml", import.meta.url), "utf8"));
const METHODS = ["get", "put", "post", "patch", "delete"] as const;

/** Every route file, keyed by the OpenAPI path template it serves. */
const routes = Object.entries(import.meta.glob<RouteModule>("../app/api/v1/**/route.ts")).map(([file, load]) => ({
  file,
  load,
  path: file.replace(/^\.\.\/app\/api\/v1/, "").replace(/\/route\.ts$/, "").replace(/\[(\w+)\]/g, "{$1}"),
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
    const values: string[] | undefined = p.in === "path" && p.schema ? ref(p.schema).enum : undefined;
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

  /** The response a Demo admin gets from `mod[method]` at `path` with `params`, as status + body text. */
  async function call(mod: RouteModule, method: string, path: string, params: Record<string, string>) {
    const url = BASE + "/api/v1" + path.replace(/\{(\w+)\}/g, (_, k) => params[k]!);
    const body = ["GET", "DELETE"].includes(method) ? undefined : "{}";
    const res = await mod[method]!(new Request(url, { method, body, headers: { cookie, "content-type": "application/json" } }), { params: Promise.resolve(params) });
    return { status: res.status, body: await res.text() };
  }

  beforeAll(async () => {
    // The app's own lazily built auth and crm_app pool, pointed at the test database.
    const redisUrl = new URL(requireEnv("REDIS_URL"));
    redisUrl.pathname = "/13"; // own Redis db: sign-in throttle counters outlive the test DB reset
    Object.assign(process.env, {
      DATABASE_URL: requireEnv("TEST_DATABASE_URL"),
      DATABASE_AUTH_URL: testUrlFor("crm_auth", "CRM_AUTH_PASSWORD"),
      REDIS_URL: redisUrl.href,
      BETTER_AUTH_SECRET: "test-secret-".padEnd(40, "x"),
      BETTER_AUTH_URL: BASE,
    });
    const redis = new Redis(redisUrl.href);
    await redis.flushdb();
    redis.disconnect();

    const authDb = createDb(process.env.DATABASE_AUTH_URL!, { max: 1 });
    await seed(authDb, TEST_SEED_PASSWORD);
    const orgId = async (slug: string) => (await authDb.execute<{ id: string }>(sql`SELECT id FROM orgs WHERE slug = ${slug}`)).rows[0]!.id;
    [saqient, demo] = [await orgId("saqient"), await orgId("demo")];
    await authDb.$client.end();

    const res = await getAuth().handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": "10.13.0.1" },
        body: JSON.stringify({ email: "admin@demo.test", password: TEST_SEED_PASSWORD }),
      }),
    );
    expect(res.status).toBe(200);
    cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    app = await connectAsApp();
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
