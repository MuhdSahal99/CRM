import { expect, type Page, test } from "@playwright/test";
import { noPageScroll, phoneAndDesktop, signInToApp } from "./helpers";

phoneAndDesktop();

/** Creates an open deal for rep A's first account through the API with the page's session, and returns its id. */
async function createDeal(page: Page, name: string) {
  const pipeline = (await (await page.request.get("/api/v1/settings/pipeline")).json()).data[0];
  const stage = pipeline.stages.find((s: { api_value: string }) => s.api_value === "Qualification").id;
  const account = (await (await page.request.get("/api/v1/Accounts?per_page=1")).json()).data[0].id;
  const res = await page.request.post("/api/v1/Deals", {
    data: { data: [{ Deal_Name: name, Account_Name: { id: account }, Amount: "1000.000", Closing_Date: "2026-12-31", Stage: { id: stage } }] },
    headers: { "idempotency-key": crypto.randomUUID() },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data[0].details.id as string;
}

test("T5.08 (US-07): move a deal with the Move to stage menu; Closed Lost asks for a reason and Cancel leaves it", async ({ page }) => {
  const name = `Board Deal ${crypto.randomUUID().slice(0, 8)}`;
  await signInToApp(page, "rep.a@saqient.test");
  await createDeal(page, name);
  await page.goto("/app/Deals/board");
  const column = (stage: string) => page.getByRole("region", { name: "Pipeline board" }).getByRole("region", { name: stage });
  const inColumn = (stage: string) => column(stage).getByRole("listitem").filter({ hasText: name });
  await expect(inColumn("Qualification")).toBeVisible({ timeout: 60_000 });
  await noPageScroll(page);

  const move = async (to: string) => {
    await page.getByRole("button", { name: `Move to stage: ${name}` }).click();
    await page.getByRole("menuitemradio", { name: to, exact: true }).click();
  };
  await move("Needs Analysis");
  await expect(inColumn("Needs Analysis")).toBeVisible({ timeout: 30_000 });
  await expect(inColumn("Qualification")).toHaveCount(0);

  await move("Closed Lost");
  const dialog = page.getByRole("dialog", { name: "Why was this deal lost?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(inColumn("Needs Analysis")).toBeVisible();

  await move("Closed Lost");
  await dialog.getByLabel("Reason for loss").selectOption("Price");
  await dialog.getByRole("button", { name: "Mark as lost" }).click();
  await expect(inColumn("Closed Lost")).toBeVisible({ timeout: 30_000 });
  await noPageScroll(page);
});
