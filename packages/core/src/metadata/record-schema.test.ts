import { jsonb, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { buildRecordSchema, type FieldDef } from "./record-schema.ts";

// A stand-in record table (ADR-0006): two inputs, plus columns metadata must never reach.
const things = pgTable("things", {
  id: uuid("id"),
  orgId: uuid("org_id"),
  lastName: text("last_name"),
  company: text("company"),
  grandTotal: numeric("grand_total"),
  custom: jsonb("custom"),
});
const WRITABLE = [things.lastName, things.company];

const field = (f: Partial<FieldDef> & Pick<FieldDef, "apiName" | "dataType">): FieldDef => ({
  isSystem: false,
  columnName: null,
  required: false,
  readOnly: false,
  maxLength: null,
  scale: null,
  picklistValues: [],
  ...f,
});

const FIELDS = [
  field({ apiName: "Last_Name", dataType: "text", isSystem: true, columnName: "last_name", required: true, maxLength: 80 }),
  field({ apiName: "Company", dataType: "text", isSystem: true, columnName: "company", maxLength: 100 }),
  field({ apiName: "Region", dataType: "picklist", picklistValues: ["north", "south"] }),
  field({ apiName: "Budget", dataType: "currency", scale: 3 }),
  field({ apiName: "Ref_No", dataType: "autonumber", readOnly: true }),
];

describe("buildRecordSchema (T1.18, ADR-0006)", () => {
  const { schema, toRow } = buildRecordSchema(FIELDS, WRITABLE);

  it("maps api_name → column for system fields and into custom for the rest", () => {
    const input = schema.parse({ Last_Name: "Al Balushi", Company: "Acme", Region: "north", Budget: "12.500" });
    expect(toRow(input)).toEqual({ last_name: "Al Balushi", company: "Acme", custom: { Region: "north", Budget: "12.500" } });
  });

  it("rejects unknown keys, including read-only fields", () => {
    expect(schema.safeParse({ Last_Name: "A", Nickname: "x" }).success).toBe(false);
    expect(schema.safeParse({ Last_Name: "A", Ref_No: "7" }).success).toBe(false);
  });

  it("enforces required and max_length", () => {
    expect(schema.safeParse({ Company: "Acme" }).error?.issues[0]?.path).toEqual(["Last_Name"]);
    expect(schema.safeParse({ Last_Name: "x".repeat(81) }).success).toBe(false);
    expect(schema.safeParse({ Last_Name: "x".repeat(80) }).success).toBe(true);
  });

  it("accepts only active picklist values and money as a decimal string at the field's scale", () => {
    expect(schema.safeParse({ Last_Name: "A", Region: "east" }).success).toBe(false);
    expect(schema.safeParse({ Last_Name: "A", Budget: "1.2345" }).success).toBe(false);
    expect(schema.safeParse({ Last_Name: "A", Budget: 12.5 }).success).toBe(false);
  });

  it("accepts only http(s) URLs", () => {
    const { schema } = buildRecordSchema([field({ apiName: "Website", dataType: "url" })], WRITABLE);
    expect(schema.safeParse({ Website: "https://saqient.om" }).success).toBe(true);
    expect(schema.safeParse({ Website: "javascript:alert(1)" }).success).toBe(false);
  });

  it("takes a lookup as {id} and stores the id", () => {
    const owner = field({ apiName: "Owner", dataType: "user_lookup", isSystem: true, columnName: "company" });
    const { schema, toRow } = buildRecordSchema([owner], WRITABLE);
    const id = crypto.randomUUID();
    expect(toRow(schema.parse({ Owner: { id, name: "ignored" } }))).toEqual({ company: id });
    expect(toRow(schema.parse({ Owner: null }))).toEqual({ company: null });
    expect(schema.safeParse({ Owner: id }).success).toBe(false);
  });

  it("refuses a system field mapped to a column outside the service's allowlist", () => {
    const evil = field({ apiName: "Evil", dataType: "text", isSystem: true, columnName: "org_id" });
    expect(() => buildRecordSchema([evil], WRITABLE)).toThrow(/org_id/);
    // A real column the server computes: client totals are never trusted (CLAUDE.md).
    expect(() => buildRecordSchema([{ ...evil, columnName: "grand_total" }], WRITABLE)).toThrow(/grand_total/);
    expect(() => buildRecordSchema([{ ...evil, columnName: "no_such_column" }], WRITABLE)).toThrow(/no_such_column/);
  });
});
