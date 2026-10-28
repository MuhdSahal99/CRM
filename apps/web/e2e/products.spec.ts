import { expect, test } from "@playwright/test";
import { noPageScroll, phoneAndDesktop, signInToApp } from "./helpers";

phoneAndDesktop();

test("T6.06 (US-08): the admin creates a Zero-rated product; a rep sees it read-only", async ({ page, browser }) => {
  const code = `ZR-${crypto.randomUUID().slice(0, 8)}`;
  const name = `Zero Product ${code}`;
  await signInToApp(page, "admin@saqient.test");
  await page.goto("/app/Products");
  await page.getByRole("link", { name: "New", exact: false }).first().click();
  await page.getByLabel("Product Name").fill(name);
  await page.getByLabel("Product Code").fill(code);
  await page.getByLabel("Unit Price (OMR)").fill("12.500");
  await page.getByRole("radio", { name: "Zero-rated (0%)" }).click();
  await noPageScroll(page);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Zero-rated (0%)").first()).toBeVisible();

  const rep = await browser.newPage({ viewport: page.viewportSize()! });
  await rep.setExtraHTTPHeaders({ "x-forwarded-for": `10.${Array.from({ length: 3 }, () => Math.floor(Math.random() * 256)).join(".")}` });
  await signInToApp(rep, "rep.a@saqient.test");
  await rep.goto("/app/Products?per_page=200");
  await expect(rep.getByRole("link", { name }).first()).toBeVisible({ timeout: 30_000 });
  await expect(rep.getByRole("link", { name: "New" })).toHaveCount(0);
  await rep.getByRole("link", { name }).first().click();
  await expect(rep.getByRole("heading", { name })).toBeVisible();
  await expect(rep.getByRole("link", { name: "Edit" })).toHaveCount(0);
  await rep.close();
});
