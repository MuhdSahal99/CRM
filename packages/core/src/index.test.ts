import { expect, it } from "vitest";

it("loads the core package entry", async () => {
  expect(await import("./index")).toBeTypeOf("object");
});
