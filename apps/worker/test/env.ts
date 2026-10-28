import { requireEnv, testUrlFor } from "@crm/db/testing";

// The core's lazily built pools read process.env on first use: point them at the test database and an own Redis db.
const redisUrl = new URL(requireEnv("REDIS_URL"));
redisUrl.pathname = "/14";
Object.assign(process.env, {
  DATABASE_URL: requireEnv("TEST_DATABASE_URL"),
  DATABASE_AUTH_URL: testUrlFor("crm_auth", "CRM_AUTH_PASSWORD"),
  REDIS_URL: redisUrl.href,
  BETTER_AUTH_SECRET: "test-secret-".padEnd(40, "x"),
  BETTER_AUTH_URL: "http://localhost:3000",
});
