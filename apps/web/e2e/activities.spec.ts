import { expect, test } from "@playwright/test";
import { noPageScroll, phoneAndDesktop, signInToApp } from "./helpers";

phoneAndDesktop();

test("T3.06 (US-15): log a call on a Contact and it appears at the top of the timeline", async ({ page }) => {
  const subject = `E2E call ${crypto.randomUUID().slice(0, 8)}`;
  await signInToApp(page, "rep.a@saqient.test");
  await page.goto("/app/Contacts/new");
  await page.getByLabel("Last Name").fill("Timeline Test");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Timeline Test" })).toBeVisible({ timeout: 30_000 }); // cold dev compile of the detail page

  await page.getByRole("button", { name: "Log activity" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Subject").fill(subject);
  await dialog.getByLabel("Duration (minutes)").fill("5");
  await dialog.getByRole("button", { name: "Log", exact: true }).click();
  await expect(dialog).toBeHidden();

  const first = page.getByRole("region", { name: "Timeline" }).getByRole("listitem").first();
  await expect(first).toContainText("Call logged");
  await expect(first.getByRole("link", { name: subject })).toBeVisible();
  await noPageScroll(page);
});
