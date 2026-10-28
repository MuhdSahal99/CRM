import type { ChildProcess } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { noPageScroll, phoneAndDesktop, signInToApp } from "./helpers";
import { startWorker } from "./worker";

phoneAndDesktop();
test.describe.configure({ mode: "serial" });
test.skip(!process.env.MAILPIT_URL || !process.env.S3_BUCKET || !process.env.CHROMIUM_PATH, "needs Mailpit (MAILPIT_URL, MAILPIT_SMTP_PORT), object storage (S3_*) and a Chromium (CHROMIUM_PATH) for the worker");

// Each width uses its own org, so the two projects never change the same SMTP settings at once.
const adminFor = (project: string) => (project.startsWith("w360") ? "admin@saqient.test" : "admin@demo.test");
let worker: ChildProcess | undefined;

const api = async (page: Page, method: "post" | "put", path: string, data: unknown) => {
  const res = await page.request[method](`/api/v1${path}`, { data, headers: { origin: new URL(page.url()).origin } });
  expect(res.status(), await res.text()).toBeLessThan(300);
  return (await res.json()).data[0].details.id as string;
};
const setSmtp = async (page: Page, fields: Record<string, unknown>) => {
  const { version } = (await (await page.request.get("/api/v1/settings/org")).json()).data[0];
  await api(page, "put", "/settings/org", { data: [{ ...fields, version }] });
};
const mailpit = async (path: string) => (await fetch(`${process.env.MAILPIT_URL}/api/v1/${path}`)).json() as Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

test.beforeAll(() => void (worker = startWorker()));
test.afterAll(() => void worker?.kill());

async function quoteWithContact(page: Page, tag: string) {
  const product = await api(page, "post", "/Products", { data: [{ Product_Name: `Mail ${tag}`, Product_Code: `ML-${tag}`, VAT_Category: "standard", Unit_Price: "25.000" }] });
  const account = await api(page, "post", "/Accounts", { data: [{ Account_Name: `Mail Co ${tag}` }] });
  await api(page, "post", "/Contacts", { data: [{ First_Name: "Salim", Last_Name: `Buyer ${tag}`, Email: `buyer-${tag}@example.test`, Account_Name: { id: account } }] });
  return { account, product };
}

test("T9.04 (US-13): send a quote from its page, a toast confirms, and Mailpit holds the message with the PDF attached", async ({ page }, info) => {
  test.setTimeout(180_000);
  const tag = crypto.randomUUID().slice(0, 8);
  await signInToApp(page, adminFor(info.project.name));
  await setSmtp(page, { smtp_host: "127.0.0.1", smtp_port: Number(process.env.MAILPIT_SMTP_PORT ?? 1025), smtp_from_email: "sales@saqient.test", smtp_from_name: "Saqient Sales" });
  const { account, product } = await quoteWithContact(page, tag);
  const quote = await api(page, "post", "/Quotes", { data: [{ Subject: `Mail quote ${tag}`, Account_Name: { id: account }, Line_Items: [{ Product: { id: product }, Quantity: "2" }] }] });

  await page.goto(`/app/Quotes/${quote}`);
  await noPageScroll(page);
  await page.getByRole("button", { name: "Send email" }).click();
  await page.getByRole("combobox", { name: "To" }).click();
  await page.getByRole("option", { name: new RegExp(`buyer-${tag}@example.test`) }).click();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Email queued. Its status is on the Emails list.")).toBeVisible({ timeout: 30_000 });

  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("list").getByText("Sent", { exact: true })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 120_000 });
  await noPageScroll(page);

  const found = await mailpit(`search?query=${encodeURIComponent(`subject:"Mail quote ${tag}"`)}`);
  expect(found.messages).toHaveLength(1);
  const message = await mailpit(`message/${found.messages[0].ID}`);
  expect(message.To[0].Address).toBe(`buyer-${tag}@example.test`);
  expect(message.Attachments).toMatchObject([{ ContentType: "application/pdf", FileName: expect.stringMatching(/\.pdf$/) }]);
  await setSmtp(page, { smtp_host: null, smtp_port: null, smtp_from_email: null });
});

test("T9.04 (US-13): a forced SMTP failure shows Failed with its error on the Emails list and sends nothing", async ({ page }, info) => {
  test.setTimeout(240_000);
  const tag = crypto.randomUUID().slice(0, 8);
  await signInToApp(page, adminFor(info.project.name));
  await setSmtp(page, { smtp_host: "127.0.0.1", smtp_port: 1, smtp_from_email: "sales@saqient.test" }); // nothing listens on port 1
  const { account, product } = await quoteWithContact(page, tag);
  const quote = await api(page, "post", "/Quotes", { data: [{ Subject: `Mail fail ${tag}`, Account_Name: { id: account }, Line_Items: [{ Product: { id: product }, Quantity: "1" }] }] });

  await page.goto(`/app/Quotes/${quote}`);
  await page.getByRole("button", { name: "Send email" }).click();
  await page.getByRole("combobox", { name: "To" }).click();
  await page.getByRole("option", { name: new RegExp(`buyer-${tag}@example.test`) }).click();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Email queued. Its status is on the Emails list.")).toBeVisible({ timeout: 30_000 });

  await expect(async () => {
    await page.reload();
    await expect(page.getByText("Failed", { exact: true })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 180_000 });
  await expect(page.getByRole("alert").filter({ hasText: /ECONNREFUSED|connect/i })).toBeVisible();
  expect((await mailpit(`search?query=${encodeURIComponent(`subject:"Mail fail ${tag}"`)}`)).messages).toHaveLength(0);
  await setSmtp(page, { smtp_host: null, smtp_port: null, smtp_from_email: null });
});
