import { expect, test } from "@playwright/test";
import { noPageScroll, phoneAndDesktop, signInToApp } from "./helpers";

phoneAndDesktop();

async function createLead(page: import("@playwright/test").Page, lastName: string, company: string, email: string) {
  await page.goto("/app/Leads/new");
  await page.getByLabel("Last Name").fill(lastName);
  await page.getByLabel("Company").fill(company);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { level: 1, name: lastName })).toBeVisible({ timeout: 30_000 }); // cold dev compile of the detail page
}

test("T4.06 (US-05): convert a lead and land on the new Contact", async ({ page }) => {
  const run = crypto.randomUUID().slice(0, 8);
  const lastName = `Convertee ${run}`;
  await signInToApp(page, "rep.a@saqient.test");
  await createLead(page, lastName, `Convert Co ${run}`, `convertee-${run}@example.test`);
  await noPageScroll(page);

  await page.getByRole("button", { name: "Convert", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Convert lead" });
  await expect(dialog.getByRole("radio", { name: /Create new account/ })).toBeChecked();
  await noPageScroll(page);
  await dialog.getByRole("button", { name: "Convert lead" }).click();

  await expect(page).toHaveURL(/\/app\/Contacts\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1, name: lastName })).toBeVisible();
  await noPageScroll(page);

  await page.goto("/app/Leads?cvid=converted");
  await expect(page.getByRole("link", { name: lastName }).filter({ visible: true })).toBeVisible();
  await page.goto("/app/Leads");
  await expect(page.getByRole("link", { name: lastName })).toHaveCount(0);
});

test("T4.06 (US-05): a lead whose email matches a Contact can be attached to it", async ({ page }) => {
  const run = crypto.randomUUID().slice(0, 8);
  const email = `attach-${run}@example.test`;
  const contactName = `Existing Contact ${run}`;
  await signInToApp(page, "rep.a@saqient.test");
  await page.goto("/app/Contacts/new");
  await page.getByLabel("Last Name").fill(contactName);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { level: 1, name: contactName })).toBeVisible({ timeout: 30_000 });
  const contactUrl = page.url();

  await createLead(page, `Attacher ${run}`, `Attach Co ${run}`, email);
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Convert lead" });
  await expect(dialog.getByRole("radio", { name: `Attach to existing contact: ${contactName}` })).toBeChecked();
  await noPageScroll(page);
  await dialog.getByRole("button", { name: "Convert lead" }).click();
  await expect(page).toHaveURL(contactUrl, { timeout: 30_000 });
});
