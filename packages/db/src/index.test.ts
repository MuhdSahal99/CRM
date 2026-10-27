import { expect, it } from "vitest";

it("loads the db package entry", async () => {
  expect(await import("./index")).toBeTypeOf("object");
});
