import { describe, expect, it } from "vitest";
import { newId } from "./id";

describe("newId (UUID v7, SCHEMA conventions)", () => {
  it("is a version-7, RFC 4122 variant UUID", () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("starts with the current Unix time in milliseconds", () => {
    const before = Date.now();
    const ms = parseInt(newId().replace("-", "").slice(0, 12), 16);
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(Date.now());
  });

  it("sorts by creation time across milliseconds and never repeats", async () => {
    const first = newId();
    await new Promise((r) => setTimeout(r, 2));
    const second = newId();
    expect(first < second).toBe(true);
    expect(new Set(Array.from({ length: 10_000 }, newId)).size).toBe(10_000);
  });
});
