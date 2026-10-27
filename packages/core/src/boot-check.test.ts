import { createDb } from "@crm/db";
import { requireEnv, testUrlFor } from "@crm/db/testing";
import { describe, expect, it } from "vitest";
import { assertSafeDbRole } from "./boot-check";

async function checkAs(url: string) {
  const db = createDb(url, { max: 1 });
  try {
    await assertSafeDbRole(db);
  } finally {
    await db.$client.end();
  }
}

describe("assertSafeDbRole (AC-19)", () => {
  it("accepts crm_app", async () => {
    await expect(checkAs(requireEnv("TEST_DATABASE_URL"))).resolves.toBeUndefined();
  });

  it("refuses crm_owner, which can run DDL", async () => {
    await expect(checkAs(requireEnv("TEST_DATABASE_OWNER_URL"))).rejects.toThrow(/crm_owner/);
  });

  it("refuses a superuser", async () => {
    await expect(checkAs(testUrlFor("postgres", "POSTGRES_PASSWORD"))).rejects.toThrow(/postgres/);
  });
});
