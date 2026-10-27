import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { compileCriteria, parseCriteria } from "./criteria.ts";

// T2.06 (ADR-0015, AC-34, AC-36): Zoho criteria → AST → SQL with bind parameters only.
const FIELDS = new Set(["Email", "Account_Name", "Employees"]);
const parse = (c: string) => parseCriteria(c, FIELDS);
const render = (c: string) => new PgDialect().sqlToQuery(compileCriteria(parse(c), (f) => sql`${sql.identifier(f.toLowerCase())}`));

describe("criteria parser (T2.06)", () => {
  it("parses a condition, and/or groups and nesting into an AST", () => {
    expect(parse("(Email:equals:a@b.om)")).toEqual({ field: "Email", op: "equals", value: "a@b.om" });
    expect(parse("((Email:equals:a@b.om)and(Account_Name:starts_with:Al))")).toEqual({
      and: [{ field: "Email", op: "equals", value: "a@b.om" }, { field: "Account_Name", op: "starts_with", value: "Al" }],
    });
    expect(parse("((Employees:between:10,50) or ((Account_Name:in:A,B\\,C)))")).toEqual({
      or: [{ field: "Employees", op: "between", value: ["10", "50"] }, { field: "Account_Name", op: "in", value: ["A", "B,C"] }],
    });
    expect(parse("(Account_Name:equals:Al Noor \\(Muscat\\))")).toMatchObject({ value: "Al Noor (Muscat)" });
  });

  it("rejects unknown fields and operators", () => {
    expect(() => parse("(Owner_Id:equals:x)")).toThrow(/field/i);
    expect(() => parse("(Email:like:x)")).toThrow(/operator/i);
    expect(() => parse("(Email:equals:a)and(Email:equals:b)or(Email:equals:c)")).toThrow();
  });

  it("AC-36: an injection attempt is a parse error, not SQL", () => {
    expect(() => parse("((Email:equals:x') or 1=1--))")).toThrow();
    expect(() => parse("(Email:equals:x);DROP TABLE accounts")).toThrow();
    expect(() => parse("")).toThrow();
  });

  it("AC-34: 50 levels of nesting are refused", () => {
    expect(() => parse(`${"(".repeat(50)}Email:equals:x${")".repeat(50)}`)).toThrow(/nest/i);
  });

  it("values only ever become bind parameters", () => {
    const q = render("((Email:equals:x' OR 1=1)and(Account_Name:starts_with:50%_off))");
    expect(q.sql).toBe(`("email" = $1 AND "account_name" ILIKE $2)`);
    expect(q.params).toEqual(["x' OR 1=1", "50\\%\\_off%"]);
    expect(render("(Employees:between:1,9)").sql).toBe(`"employees" BETWEEN $1 AND $2`);
    expect(render("(Email:in:a,b)")).toMatchObject({ sql: `"email" IN ($1, $2)`, params: ["a", "b"] });
  });
});
