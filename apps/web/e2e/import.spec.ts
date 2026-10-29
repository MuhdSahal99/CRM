import type { ChildProcess } from "node:child_process";
import { expect, test } from "@playwright/test";
import { noPageScroll, phoneAndDesktop, signInToApp } from "./helpers";
import { startWorker } from "./worker";

phoneAndDesktop();
test.skip(!process.env.S3_BUCKET, "needs object storage (S3_*) for the uploaded CSV, and the worker that runs the import");

let worker: ChildProcess | undefined;
test.beforeAll(() => void (worker = startWorker()));
test.afterAll(() => void worker?.kill());

// One import runs per org at a time (409), so each width uses its own org.
test("T11.09 (US-17): the admin imports a sample Accounts file end to end: map, dry run, confirm, download the failed rows", async ({ page }, info) => {
  const admin = info.project.name.startsWith("w360") ? "admin@saqient.test" : "admin@demo.test";
  test.setTimeout(180_000);
  const tag = crypto.randomUUID().slice(0, 8);
  const csv = [
    "Record Id,Account Owner,Account Name,Industry,Billing Country",
    `e2e-${tag}-1,${admin},Import Co A ${tag},Retail,Oman`,
    `e2e-${tag}-2,nobody@nowhere.test,Import Co B ${tag},Technology,OM`,
    `e2e-${tag}-3,,Import Co C ${tag},Nonsense,`,
  ].join("\r\n");

  await signInToApp(page, admin);
  await page.goto("/app/settings/import");
  await expect(page.getByRole("heading", { name: "Import from Zoho", level: 1 })).toBeVisible();
  await noPageScroll(page);

  await page.getByRole("combobox", { name: "What are you importing?" }).click();
  await page.getByRole("option", { name: "Accounts" }).click();
  await page.getByLabel(/CSV file/).setInputFiles({ name: "zoho-accounts.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });

  // The suggested mapping is Zoho's own headings; the Record Id goes to the Zoho id.
  await expect(page.getByRole("combobox", { name: "Field for column Record Id" })).toContainText("Zoho record id");
  await expect(page.getByRole("combobox", { name: "Field for column Account Name" })).toBeVisible();
  await noPageScroll(page);
  await page.getByRole("button", { name: "Check the file" }).click();

  // The dry run: counts and per-row errors, and nothing is written yet.
  await expect(page.getByRole("heading", { name: /Dry run result/ })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Owner not found").locator("..")).toContainText("1");
  await expect(page.getByText(/Row 3, Industry/)).toBeVisible();
  expect((await (await page.request.get(`/api/v1/Accounts/search?word=${encodeURIComponent(`Import Co A ${tag}`)}`)).json()).data ?? []).toHaveLength(0);
  await noPageScroll(page);

  await page.getByRole("button", { name: "Import 2 rows" }).click();
  await expect(page.getByRole("heading", { name: /Import finished/ })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Imported", { exact: true }).locator("..")).toContainText("2");
  const found = await (await page.request.get(`/api/v1/Accounts/search?word=${encodeURIComponent(`Import Co B ${tag}`)}`)).json();
  expect(found.data).toHaveLength(1);

  const link = page.getByRole("link", { name: "Download the failed rows (CSV)" });
  await expect(link).toBeVisible();
  const errors = await page.request.get((await link.getAttribute("href"))!);
  expect(errors.status()).toBe(200);
  expect(errors.headers()["content-type"]).toContain("text/csv");
  expect(await errors.text()).toContain("Nonsense");
  await noPageScroll(page);
});
