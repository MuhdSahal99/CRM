import { seedAll } from "@crm/core";
import { createDb } from "@crm/db";
import resetAndMigrate from "@crm/db/test-setup";
import { TEST_SEED_PASSWORD } from "@crm/db/testing";
import { Redis } from "ioredis";
import "./env.ts";

// Once per run, before any test file: fresh schema, seeded and provisioned orgs, empty throttle counters.
export default async function setup() {
  await resetAndMigrate();
  const [authDb, appDb] = [createDb(process.env.DATABASE_AUTH_URL!, { max: 1 }), createDb(process.env.DATABASE_URL!, { max: 1 })];
  try {
    await seedAll(authDb, appDb, TEST_SEED_PASSWORD);
  } finally {
    await Promise.all([authDb.$client.end(), appDb.$client.end()]);
  }
  const redis = new Redis(process.env.REDIS_URL!);
  await redis.flushdb();
  redis.disconnect();
}
