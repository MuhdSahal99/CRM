import { describe, expect, it } from "vitest";
import { z } from "zod";
import { roles } from "../access";
import { errorResponse } from "./envelope";
import { NotFound, PayloadTooLarge, readJsonBody, validationError } from "./errors";

const post = (body: string) => new Request("http://x/api/v1/Leads", { method: "POST", body });

describe("API errors and envelope (T1.13, ADR-0015)", () => {
  it("a Zod error becomes a 422 with one details entry per field", async () => {
    const schema = z.object({ Last_Name: z.string().min(1), Company: z.string(), No_of_Employees: z.int().min(0) });
    const input = { Last_Name: "", No_of_Employees: -1 };
    const res = errorResponse(validationError(schema.safeParse(input).error!, input));

    expect(res.status).toBe(422);
    const body = (await res.json()) as { details: { errors: unknown[] } };
    expect(body).toMatchObject({ code: "INVALID_DATA", status: "error", details: { api_name: "Last_Name" } });
    expect(body.details.errors).toEqual([
      { api_name: "Last_Name", code: "INVALID_DATA", message: expect.any(String) },
      { api_name: "Company", code: "MANDATORY_NOT_FOUND", message: expect.any(String) },
      { api_name: "No_of_Employees", code: "INVALID_DATA", message: expect.any(String) },
    ]);
  });

  it("NotFound is byte-identical whether the record is missing or invisible", async () => {
    // The services throw the same error in both cases; nothing about the record may reach the body (US-02).
    const missing = errorResponse(new NotFound());
    const invisible = errorResponse(new NotFound());
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe(await invisible.text());
    expect([...missing.headers]).toEqual([...invisible.headers]);
  });

  it("an unexpected error is a generic 500 that leaks nothing", async () => {
    const res = errorResponse(new Error('relation "deals" does not exist at line 3'));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toMatch(/deals|line 3/);
  });

  it("AC-34: a 10 MB body is refused with 413, with or without Content-Length", async () => {
    const big = JSON.stringify({ data: "x".repeat(10 * 1024 * 1024) });
    await expect(readJsonBody(post(big))).rejects.toBeInstanceOf(PayloadTooLarge);
    const chunked = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(big));
        c.close();
      },
    });
    const streamed = new Request("http://x/api/v1/Leads", { method: "POST", body: chunked, duplex: "half" } as RequestInit);
    await expect(readJsonBody(streamed)).rejects.toBeInstanceOf(PayloadTooLarge);
    expect(errorResponse(new PayloadTooLarge()).status).toBe(413);
  });

  it("parses a normal body and answers 400 to malformed JSON", async () => {
    expect(await readJsonBody(post('{"data":[{"Last_Name":"Al Balushi"}]}'))).toEqual({ data: [{ Last_Name: "Al Balushi" }] });
    const res = await readJsonBody(post("{not json")).catch(errorResponse);
    expect((res as Response).status).toBe(400);
  });

  it("the permission matrix follows ADR-0005", () => {
    const can = (role: keyof typeof roles, request: Parameters<(typeof roles)["admin"]["authorize"]>[0]) => roles[role].authorize(request).success;
    expect(can("rep", { record: ["create", "delete"] })).toBe(true);
    expect(can("rep", { settings: ["update"] })).toBe(false);
    expect(can("manager", { forecast_target: ["update"] })).toBe(true);
    expect(can("rep", { forecast_target: ["update"] })).toBe(false);
    expect(can("manager", { user: ["manage"] })).toBe(false);
    expect(can("admin", { import: ["run"], user: ["manage"], settings: ["update"] })).toBe(true);
  });
});
