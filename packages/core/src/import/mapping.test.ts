import { describe, expect, it } from "vitest";
import type { Field } from "../modules/registry.ts";
import { checkMapping, mappableFields } from "./mapping.ts";

const f = (apiName: string, over: Partial<Field> = {}): Field => ({ apiName, dataType: "text", isSystem: true, columnName: apiName.toLowerCase(), required: false, readOnly: false, maxLength: null, scale: null, picklistValues: [], lookupModule: null, ...over });
const fields = [f("Account_Name", { required: true }), f("Phone"), f("Grand_Total", { readOnly: true }), f("Created_Time", { columnName: "created_at" }), f("Org", { columnName: "org_id" })];
const mappable = mappableFields(fields, new Set(["account_name", "phone"]));
const headers = ["Record Id", "Account Name", "Phone", "Total", "Created", "Org"];

describe("mapping allow-list (AC-54)", () => {
  it("offers only writable fields: read-only, server-owned columns and audit times are not on the list", () => {
    expect(mappable.map((m) => m.apiName)).toEqual(["Account_Name", "Phone"]);
  });
  it.each([["Total", "Grand_Total"], ["Created", "Created_Time"], ["Org", "org_id"], ["Org", "id"]])("a column mapped to %s → %s is refused with a 422", (heading, target) => {
    expect(() => checkMapping(mappable, { "Record Id": "zoho_id", "Account Name": "Account_Name", [heading]: target }, headers)).toThrow(/cannot be imported/);
  });
  it("accepts a good mapping, and requires the Zoho record id and every required field", () => {
    expect(() => checkMapping(mappable, { "Record Id": "zoho_id", "Account Name": "Account_Name", Phone: "Phone" }, headers)).not.toThrow();
    expect(() => checkMapping(mappable, { "Account Name": "Account_Name" }, headers)).toThrow(/Zoho Record Id/);
    expect(() => checkMapping(mappable, { "Record Id": "zoho_id" }, headers)).toThrow(/Map a column to Account_Name/);
    expect(() => checkMapping(mappable, { "Record Id": "zoho_id" }, headers, { Account_Name: "x" })).not.toThrow();
  });
  it("refuses an unknown column and two columns onto one field", () => {
    expect(() => checkMapping(mappable, { "Record Id": "zoho_id", Nope: "Phone", "Account Name": "Account_Name" }, headers)).toThrow(/no column "Nope"/);
    expect(() => checkMapping(mappable, { "Record Id": "zoho_id", "Account Name": "Account_Name", Phone: "Account_Name" }, headers)).toThrow(/both mapped/);
  });
});
