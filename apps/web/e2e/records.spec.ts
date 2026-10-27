import { expect, type Page, test } from "@playwright/test";
import { noPageScroll, phoneAndDesktop, signInToApp } from "./helpers";

phoneAndDesktop();

const isPhone = (page: Page) => page.viewportSize()!.width < 768;

test("T2.11: the Accounts list renders from metadata, pages, and has an empty state", async ({ page }) => {
  await signInToApp(page, "rep.a@saqient.test");
  if (isPhone(page)) await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("link", { name: "Accounts" }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/app\/Accounts$/);
  await expect(page.getByRole("heading", { level: 1, name: "Accounts" })).toBeVisible();
  // Phone: a card list; desktop: a table with metadata-driven column headers.
  if (isPhone(page)) await expect(page.getByRole("list", { name: "Accounts" })).toBeVisible();
  else await expect(page.getByRole("columnheader", { name: "Account Name" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Al Noor Trading LLC" }).filter({ visible: true })).toBeVisible();
  await noPageScroll(page);

  await page.goto("/app/Accounts?per_page=1");
  await page.getByRole("link", { name: "Next page" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByRole("link", { name: "Previous page" })).toBeVisible();

  await page.goto("/app/Accounts?page=9999");
  await expect(page.getByText("No accounts to show.")).toBeVisible();
});

test("T2.12: an empty required field shows the server's 422 under it; phones are tel and LTR", async ({ page }) => {
  await signInToApp(page, "rep.a@saqient.test");
  await page.goto("/app/Contacts/new");
  await expect(page.getByLabel("Mobile")).toHaveAttribute("type", "tel");
  await expect(page.getByLabel("Mobile")).toHaveAttribute("dir", "ltr");
  await noPageScroll(page);

  // The browser's own `required` check would stop the submit first; the server must still answer per field.
  await page.locator("form").evaluate((f) => f.setAttribute("novalidate", ""));
  await page.getByRole("button", { name: "Save" }).click();
  const lastName = page.getByLabel("Last Name");
  await expect(lastName).toHaveAttribute("aria-invalid", "true");
  const errorId = await lastName.getAttribute("aria-describedby");
  await expect(page.locator(`#${errorId}`)).toBeVisible();
});

test("T2.13 (US-06): create an account, add a contact with an Omani mobile, see it on the account's Contacts tab as +968", async ({ page }) => {
  const name = `E2E Account ${crypto.randomUUID().slice(0, 8)}`;
  await signInToApp(page, "rep.a@saqient.test");
  await page.goto("/app/Accounts/new");
  await page.getByLabel("Account Name").fill(name);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await noPageScroll(page);

  await page.getByRole("tab", { name: "Contacts" }).click();
  await page.getByRole("link", { name: "Add contact" }).click();
  await page.getByLabel("Last Name").fill("Al Habsi");
  await page.getByLabel("Mobile").fill("9123 4567");
  await page.getByLabel("Mailing Country").fill("OM");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Al Habsi" })).toBeVisible();
  await expect(page.getByText("+96891234567")).toBeVisible();

  await page.getByRole("link", { name }).click();
  await page.getByRole("tab", { name: "Contacts" }).click();
  await expect(page.getByRole("tabpanel").getByRole("link", { name: "Al Habsi" }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("tabpanel").getByText("+96891234567").filter({ visible: true })).toBeVisible();
  await noPageScroll(page);
});
