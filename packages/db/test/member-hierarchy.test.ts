import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectAsAuth, createMember, createOrg } from "./db";

describe("reporting hierarchy has no cycles (T1.12, SCHEMA § member)", () => {
  let auth: pg.Client;
  let org: string;

  const setManager = (userId: string, managerId: string | null) =>
    auth.query("UPDATE member SET manager_id = $2 WHERE org_id = $1 AND user_id = $3", [org, managerId, userId]);

  beforeAll(async () => {
    auth = await connectAsAuth();
    org = await createOrg(auth);
  });
  afterAll(() => auth?.end());

  it("AC-37: A→B then B→A is rejected", async () => {
    const [a, b] = [await createMember(auth, org), await createMember(auth, org)];
    await setManager(a, b);
    await expect(setManager(b, a)).rejects.toThrow(/cycle/);
  });

  it("AC-37: a longer loop (A→B→C, then C→A) is rejected", async () => {
    const c = await createMember(auth, org, "manager");
    const b = await createMember(auth, org, "rep", c);
    const a = await createMember(auth, org, "rep", b);
    await expect(setManager(c, a)).rejects.toThrow(/cycle/);
    await expect(setManager(c, null)).resolves.toBeDefined(); // clearing a manager is always fine
  });

  it("a self-manager is rejected by the CHECK", async () => {
    const a = await createMember(auth, org);
    await expect(setManager(a, a)).rejects.toThrow(/member_manager_not_self/);
  });

  it("an ordinary tree change is allowed", async () => {
    const top = await createMember(auth, org, "manager");
    const [x, y] = [await createMember(auth, org, "rep", top), await createMember(auth, org, "rep", top)];
    await expect(setManager(y, x)).resolves.toBeDefined();
  });
});
