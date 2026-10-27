import { requireEnv, testUrlFor } from "@crm/db/testing";

// The app's lazily built auth and crm_app pool read process.env on first use: point them at the test database.
// Own Redis db: sign-in throttle counters outlive the test DB reset, so global setup flushes it.
export const BASE = "http://localhost:3000";
const redisUrl = new URL(requireEnv("REDIS_URL"));
redisUrl.pathname = "/13";
Object.assign(process.env, {
  DATABASE_URL: requireEnv("TEST_DATABASE_URL"),
  DATABASE_AUTH_URL: testUrlFor("crm_auth", "CRM_AUTH_PASSWORD"),
  REDIS_URL: redisUrl.href,
  BETTER_AUTH_SECRET: "test-secret-".padEnd(40, "x"),
  BETTER_AUTH_URL: BASE,
});
