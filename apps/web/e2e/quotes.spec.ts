import { expect, type Page, test } from "@playwright/test";
import { noPageScroll, phoneAndDesktop, signInToApp } from "./helpers";

phoneAndDesktop();

const api = async (page: Page, path: string, data: unknown) => {
  const res = await page.request.post(`/api/v1${path}`, { data, headers: { origin: new URL(page.url()).origin } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data[0].details.id as string;
};

test("T7.08 (US-10): build the three US-10 lines, save, and see the server totals 358.190 then 358.000", async ({ page }) => {
  const tag = crypto.randomUUID().slice(0, 8);
  await signInToApp(page, "admin@saqient.test");
  const products = [["Standard", "standard", "100.000"], ["Zero", "zero_rated", "50.000"], ["Exempt", "exempt", "12.345"]] as const;
  for (const [n, vat, price] of products) {
    await api(page, "/Products", { data: [{ Product_Name: `Q${n} ${tag}`, Product_Code: `${n}-${tag}`, VAT_Category: vat, Unit_Price: price }] });
  }
  const account = await api(page, "/Accounts", { data: [{ Account_Name: `Quote Co ${tag}` }] });
  const quote = await api(page, "/Quotes", { data: [{ Subject: `Fixture ${tag}`, Account_Name: { id: account } }] });
  await page.goto(`/app/Quotes/${quote}/edit`);

  for (const [n] of products) {
    await page.getByRole("combobox", { name: "Add a product" }).click();
    await page.getByRole("option", { name: `Q${n} ${tag}` }).click();
  }
  await page.getByLabel("Qty").nth(0).fill("3");
  await page.getByLabel("Discount %").nth(0).fill("10");
  await page.getByLabel("Qty").nth(1).fill("1");
  await page.getByLabel("Qty").nth(2).fill("2");
  await noPageScroll(page);
  await page.getByRole("button", { name: "Save quote" }).click();
  await expect(page.getByText("Quote saved.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/OMR\s*358\.190/).first()).toBeVisible(); // Grand Total with no adjustment, from the server
  await expect(page.getByText(/OMR\s*270\.000/).first()).toBeVisible(); // standard base

  await page.getByLabel("Adjustment").fill("-0.190");
  await page.getByRole("button", { name: "Save quote" }).click();
  await expect(page.getByText(/OMR\s*358\.000/).first()).toBeVisible({ timeout: 30_000 });

  await page.getByLabel("Qty").nth(1).fill("0");
  await page.getByRole("button", { name: "Save quote" }).click();
  await expect(page.getByText("Quantity must be above zero.")).toBeVisible({ timeout: 30_000 });
  await noPageScroll(page);
});

test("T7.09 (US-10): open a deal, create a quote, add a line and save", async ({ page }) => {
  const tag = crypto.randomUUID().slice(0, 8);
  await signInToApp(page, "admin@saqient.test");
  await api(page, "/Products", { data: [{ Product_Name: `Deal Product ${tag}`, Product_Code: `DP-${tag}`, VAT_Category: "standard", Unit_Price: "20.000" }] });
  const account = await api(page, "/Accounts", { data: [{ Account_Name: `Deal Co ${tag}` }] });
  const pipeline = await (await page.request.get("/api/v1/settings/pipeline")).json();
  const deal = await api(page, "/Deals", {
    data: [{ Deal_Name: `Quote deal ${tag}`, Account_Name: { id: account }, Amount: "1000.000", Closing_Date: "2026-12-31", Stage: { id: pipeline.data[0].stages[0].id } }],
  });
  await page.goto(`/app/Deals/${deal}`);
  await page.getByRole("button", { name: "New quote" }).click();
  await expect(page).toHaveURL(/\/app\/Quotes\/[0-9a-f-]+\/edit$/, { timeout: 30_000 });
  await page.getByRole("combobox", { name: "Add a product" }).click();
  await page.getByRole("option", { name: `Deal Product ${tag}` }).click();
  await noPageScroll(page);
  await page.getByRole("button", { name: "Save quote" }).click();
  await expect(page.getByText("Quote saved.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/OMR\s*21\.000/).first()).toBeVisible(); // 20.000 + 5% VAT, from the server
});
