import { expect, type Page, test } from "@playwright/test";
import { noPageScroll, phoneAndDesktop, signInToApp } from "./helpers";

phoneAndDesktop();

const api = async (page: Page, path: string, data: unknown) => {
  const res = await page.request.post(`/api/v1${path}`, { data, headers: { origin: new URL(page.url()).origin } });
  expect(res.status(), await res.text()).toBeLessThan(300);
  return (await res.json()).data[0].details.id as string;
};

test("T8.13 (US-11, US-12): convert a quote to a sales order and an invoice, issue it, see the number and no editor", async ({ page }) => {
  test.setTimeout(120_000); // a cold dev server compiles each route on first use
  const tag = crypto.randomUUID().slice(0, 8);
  await signInToApp(page, "admin@saqient.test");
  const product = await api(page, "/Products", { data: [{ Product_Name: `Doc ${tag}`, Product_Code: `DOC-${tag}`, VAT_Category: "standard", Unit_Price: "40.000" }] });
  const account = await api(page, "/Accounts", { data: [{ Account_Name: `Doc Co ${tag}` }] });
  const quote = await api(page, "/Quotes", { data: [{ Subject: `Doc quote ${tag}`, Account_Name: { id: account }, Line_Items: [{ Product: { id: product }, Quantity: "2" }] }] });

  await page.goto(`/app/Quotes/${quote}`);
  await page.getByRole("button", { name: "Convert to sales order" }).click();
  await expect(page).toHaveURL(/\/app\/Sales_Orders\/[0-9a-f-]+$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`Doc quote ${tag}`);
  await expect(page.getByText(/OMR\s*84\.000/).first()).toBeVisible(); // 2 x 40.000 + 5% VAT, the server's total
  await noPageScroll(page);

  await page.getByRole("button", { name: "Create invoice" }).click();
  await expect(page).toHaveURL(/\/app\/Invoices\/[0-9a-f-]+$/, { timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Edit" })).toBeVisible(); // a draft is still editable
  await noPageScroll(page);

  await page.getByRole("button", { name: "Issue invoice" }).click();
  await expect(page.getByText(/INV-\d{6}/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Issue invoice" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0); // the editor is gone once issued
  await noPageScroll(page);

  // The PDF comes from the worker; without one running the API answers 202 and the page says so. With one it opens the file.
  const popup = page.waitForEvent("popup", { timeout: 5_000 }).catch(() => null);
  await page.getByRole("button", { name: "Download PDF" }).click();
  if (!(await popup)) await expect(page.getByText("The PDF is being prepared. Try again in a moment.")).toBeVisible();

  await page.getByRole("button", { name: "Mark paid" }).click();
  await expect(page.getByRole("button", { name: "Mark paid" })).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Cancel invoice" })).toBeVisible(); // an Admin may still cancel a paid invoice
});
