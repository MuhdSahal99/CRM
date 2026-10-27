import { getAuth } from "@crm/core";
import { type connectAsAuth, createMember, TEST_SEED_PASSWORD } from "@crm/db/testing";
import { hashPassword } from "better-auth/crypto";
import { expect } from "vitest";
import { BASE } from "./env.ts";

export type RouteModule = Partial<Record<string, (request: Request, route?: { params?: Promise<Record<string, string>> }) => Promise<Response>>>;

/** Signs a seeded user in through Better Auth and returns the Cookie header a browser would send. */
export async function signIn(email: string, password = TEST_SEED_PASSWORD): Promise<string> {
  const res = await getAuth().handler(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      // A fresh IP per sign-in: the per-IP throttle (AC-31) must not trip across test files.
      headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": `10.13.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}` },
      body: JSON.stringify({ email, password }),
    }),
  );
  expect(res.status, `sign-in as ${email}`).toBe(200);
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

/** Calls a route handler in-process, as Next would: `path` is the /api/v1 path with its params filled in. */
export async function call(mod: RouteModule, method: string, path: string, { cookie, params, body }: { cookie: string; params?: Record<string, string>; body?: unknown }) {
  const init = { method, headers: { cookie, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) };
  // Like Next: a route without dynamic segments gets no params at all.
  const res = await mod[method]!(new Request(BASE + "/api/v1" + path, init), params ? { params: Promise.resolve(params) } : undefined);
  const text = await res.text();
  return { status: res.status, body: text, json: () => JSON.parse(text) };
}

/** A new member of `orgId` who can sign in with the seed password, for tests that change a user. */
export async function createSignInUser(auth: Awaited<ReturnType<typeof connectAsAuth>>, orgId: string, role = "rep"): Promise<{ id: string; email: string }> {
  const id = await createMember(auth, orgId, role);
  const { rows } = await auth.query(`UPDATE "user" SET email = 'u-' || id || '@example.test' WHERE id = $1 RETURNING email`, [id]);
  await auth.query(
    `INSERT INTO account (id, user_id, account_id, provider_id, password, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, $1::text, 'credential', $2, now(), now())`,
    [id, await hashPassword(TEST_SEED_PASSWORD)],
  );
  return { id, email: rows[0].email };
}
