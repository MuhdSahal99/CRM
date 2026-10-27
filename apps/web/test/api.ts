import { getAuth } from "@crm/core";
import { TEST_SEED_PASSWORD } from "@crm/db/testing";
import { expect } from "vitest";
import { BASE } from "./env.ts";

export type RouteModule = Partial<Record<string, (request: Request, route: { params: Promise<Record<string, string>> }) => Promise<Response>>>;

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
export async function call(mod: RouteModule, method: string, path: string, { cookie, params = {}, body }: { cookie: string; params?: Record<string, string>; body?: unknown }) {
  const init = { method, headers: { cookie, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) };
  const res = await mod[method]!(new Request(BASE + "/api/v1" + path, init), { params: Promise.resolve(params) });
  const text = await res.text();
  return { status: res.status, body: text, json: () => JSON.parse(text) };
}
