import { createDb, type Db, newId, schema } from "@crm/db";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, organization } from "better-auth/plugins";
import { Redis } from "ioredis";
import { ac, roles } from "./access";
import { parseConfig } from "./config";

type AuthDeps = {
  db: Db; // must connect as crm_auth (ADR-0004)
  redis: Redis; // shared rate-limit counters across server instances
  secret: string;
  baseURL: string;
};

const SIGN_IN_WINDOW_S = 15 * 60;

/**
 * Fixed-window counter in Redis, counted atomically: one MULTI increments, starts the window on the first hit (NX)
 * and reads what is left of it, so parallel requests cannot all pass a stale count.
 */
async function consume(redis: Redis, key: string, { window, max }: { window: number; max: number }) {
  const redisKey = `rate-limit:${key}`;
  const replies = await redis.multi().incr(redisKey).expire(redisKey, window, "NX").ttl(redisKey).exec();
  if (!replies || replies.some(([error]) => error)) throw new Error("Rate-limit store unavailable");
  const count = replies[0]![1] as number;
  const ttl = replies[2]![1] as number;
  return count <= max ? { allowed: true, retryAfter: null } : { allowed: false, retryAfter: Math.max(ttl, 1) };
}

/** Better Auth options (ADR-0004). Separate from createAuth so the schema drift test can read them. */
export function authOptions({ db, redis, secret, baseURL }: AuthDeps) {
  return {
    secret,
    baseURL,
    database: drizzleAdapter(db, { provider: "pg", schema: { ...schema } }),
    // Users join by Admin invitation only (US-03): no public sign-up endpoint.
    emailAndPassword: { enabled: true, disableSignUp: true },
    advanced: {
      database: { generateId: () => newId() }, // UUID v7, like every other id (SCHEMA conventions)
      useSecureCookies: true, // localhost counts as a secure origin in browsers, so dev works too
    },
    rateLimit: {
      enabled: true, // Better Auth turns it off outside production by default
      // Keyed by client IP from x-forwarded-for: the reverse proxy in front of the app must overwrite that header.
      customRules: { "/sign-in/email": { window: SIGN_IN_WINDOW_S, max: 10 } }, // AC-31, per IP
      customStorage: { consume: (key, rule) => consume(redis, key, rule) },
    },
    hooks: {
      // AC-31, per account: caps attempts on one email from any number of IPs. Trade-off accepted 2026-10-27:
      // someone who knows an email can lock that user out for up to 15 minutes.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/email" || typeof ctx.body?.email !== "string") return;
        const email = ctx.body.email.trim().toLowerCase();
        const { allowed } = await consume(redis, `sign-in-account:${email}`, { window: SIGN_IN_WINDOW_S, max: 20 });
        if (!allowed) throw new APIError("TOO_MANY_REQUESTS", { message: "Too many sign-in attempts. Try again later." });
      }),
    },
    plugins: [
      admin(), // banUser = deactivate (US-01, US-03). Nobody holds a global user.role, so its admin endpoints stay closed.
      organization({
        ac,
        roles,
        creatorRole: "admin",
        allowUserToCreateOrganization: false, // tenants are provisioned, not self-served (PRD non-goals)
        // Table and column names from packages/db/src/schema/auth.ts.
        schema: {
          organization: { modelName: "orgs" },
          member: {
            fields: { organizationId: "orgId" },
            additionalFields: {
              managerId: { type: "string", required: false, input: false },
              status: { type: "string", required: true, defaultValue: "active", input: false },
            },
          },
          invitation: { fields: { organizationId: "orgId" } },
        },
      }),
    ],
  } satisfies BetterAuthOptions;
}

export const createAuth = (deps: AuthDeps) => betterAuth(authOptions(deps));

let appAuth: ReturnType<typeof createAuth> | undefined;

/** The app's Better Auth instance, built on first use so `next build` never needs runtime secrets. */
export function getAuth(): ReturnType<typeof createAuth> {
  if (!appAuth) {
    const config = parseConfig(process.env);
    appAuth = createAuth({
      db: createDb(config.DATABASE_AUTH_URL),
      redis: new Redis(config.REDIS_URL),
      secret: config.BETTER_AUTH_SECRET,
      baseURL: config.BETTER_AUTH_URL,
    });
  }
  return appAuth;
}
