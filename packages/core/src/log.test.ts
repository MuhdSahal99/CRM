import { describe, expect, it } from "vitest";
import { createLogger, redactPath } from "./log";

function capture() {
  const lines: string[] = [];
  return { logger: createLogger({ write: (line: string) => lines.push(line) }), lines };
}

describe("logger redaction (T1.14, ADR-0014)", () => {
  it("a request to /s/<token> with a cookie emits neither the cookie nor the token", () => {
    const token = "abcDEF123_-abcDEF123_-abcDEF123_-abcDEF123_";
    const req = new Request(`http://x/s/${token}?ref=wa`, { headers: { cookie: "better-auth.session_token=SECRETCOOKIE", authorization: "Bearer SECRETBEARER" } });
    const { logger, lines } = capture();

    logger.info({ req, status: 404 }, "request");

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toMatch(/SECRETCOOKIE|SECRETBEARER|abcDEF123|ref=wa/);
    expect(JSON.parse(lines[0]!)).toMatchObject({ req: { method: "GET", path: "/s/[redacted]" }, status: 404 });
  });

  it("censors secret keys at the top level and one object down", () => {
    const { logger, lines } = capture();
    logger.info({ password: "p1", user: { email: "a@b.c", mobile: "+96890000000" }, headers: { cookie: "c", authorization: "a" } });
    expect(lines[0]).not.toMatch(/p1|a@b\.c|\+968|"c"|"a"/);
    expect(JSON.parse(lines[0]!)).toMatchObject({ password: "[redacted]", user: { email: "[redacted]" }, headers: { cookie: "[redacted]" } });
  });

  it("logs a failed query without its message, params or detail", () => {
    const cause = Object.assign(new Error('duplicate key value violates unique constraint "contacts_email"'), {
      code: "23505",
      constraint: "contacts_email",
      detail: "Key (email)=(someone@customer.om) already exists.",
    });
    const err = Object.assign(new Error("Failed query: insert into contacts\nparams: someone@customer.om,+96890000000"), { params: ["someone@customer.om"], cause });
    const { logger, lines } = capture();

    logger.error({ err }, "unhandled error");

    expect(lines[0]).not.toMatch(/customer\.om|\+968|Failed query/);
    expect(JSON.parse(lines[0]!)).toMatchObject({ err: { type: "Error", code: "23505", constraint: "contacts_email", stack: expect.stringContaining("at ") } });
  });

  it("leaves other paths alone", () => {
    expect(redactPath("/api/v1/Leads/123")).toBe("/api/v1/Leads/123");
    expect(redactPath("/settings/x")).toBe("/settings/x");
  });
});
