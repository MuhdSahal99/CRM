import { describe, expect, it } from "vitest";
import { parseConfig } from "./config";

const valid = {
  NODE_ENV: "development",
  DATABASE_URL: "postgres://crm_app:pw@localhost:5432/crm",
  REDIS_URL: "redis://localhost:6379",
};

describe("parseConfig", () => {
  it("accepts a complete environment", () => {
    expect(parseConfig(valid)).toEqual(valid);
  });

  it.each(["NODE_ENV", "DATABASE_URL", "REDIS_URL"])("names a missing %s", (key) => {
    const { [key as keyof typeof valid]: _, ...env } = valid;
    expect(() => parseConfig(env)).toThrow(key);
  });

  it("rejects a DATABASE_URL that is not postgres", () => {
    expect(() => parseConfig({ ...valid, DATABASE_URL: "mysql://x@localhost/crm" })).toThrow("DATABASE_URL");
  });

  it("does not echo secrets from the environment in the error", () => {
    expect(() => parseConfig({ ...valid, REDIS_URL: "not a url secret-pw" })).toThrow(/^(?!.*secret-pw)/s);
  });
});
