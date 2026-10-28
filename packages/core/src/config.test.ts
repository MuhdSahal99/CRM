import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.ts";

const valid = {
  NODE_ENV: "development",
  DATABASE_URL: "postgres://crm_app:pw@localhost:5432/crm",
  REDIS_URL: "redis://localhost:6379",
  DATABASE_AUTH_URL: "postgres://crm_auth:pw@localhost:5432/crm",
  BETTER_AUTH_SECRET: "a".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
};

describe("parseConfig", () => {
  it("accepts a complete environment", () => {
    expect(parseConfig(valid)).toEqual({ ...valid, S3_REGION: "us-east-1" }); // object storage is optional at boot; the region defaults
  });

  it("rejects a malformed S3 endpoint", () => {
    expect(() => parseConfig({ ...valid, S3_ENDPOINT: "not a url" })).toThrow("S3_ENDPOINT");
  });

  it.each(Object.keys(valid))("names a missing %s", (key) => {
    const { [key as keyof typeof valid]: _, ...env } = valid;
    expect(() => parseConfig(env)).toThrow(key);
  });

  it("rejects a DATABASE_URL that is not postgres", () => {
    expect(() => parseConfig({ ...valid, DATABASE_URL: "mysql://x@localhost/crm" })).toThrow("DATABASE_URL");
  });

  it("rejects a BETTER_AUTH_SECRET shorter than 32 characters", () => {
    expect(() => parseConfig({ ...valid, BETTER_AUTH_SECRET: "short" })).toThrow("BETTER_AUTH_SECRET");
  });

  it("does not echo secrets from the environment in the error", () => {
    expect(() => parseConfig({ ...valid, REDIS_URL: "not a url secret-pw" })).toThrow(/^(?!.*secret-pw)/s);
  });
});
