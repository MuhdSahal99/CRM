import type { ChildProcess } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { noPageScroll, phoneAndDesktop, signInToApp } from "./helpers";
import { startWorker } from "./worker";

phoneAndDesktop();
test.skip(!process.env.S3_BUCKET || !process.env.CHROMIUM_PATH, "needs object storage (S3_*) and a Chromium (CHROMIUM_PATH) for the worker that renders the PDF");

let worker: ChildProcess | undefined;
test.beforeAll(() => void (worker = startWorker()));
test.afterAll(() => void worker?.kill());

const api = async (page: Page, path: string, data: unknown) => {
  const res = await page.request.post(`/api/v1${path}`, { data, headers: { origin: new URL(page.url()).origin } });
  expect(res.status(), await res.text()).toBeLessThan(300);
  return (await res.json()).data[0].details.id as string;
};

test("T9.08 (US-14): send a quote on WhatsApp, see the shared link, open it, revoke it, and see 'link expired'", async ({ page, context }) => {
  test.setTimeout(180_000);
  const tag = crypto.randomUUID().slice(0, 8);
  // wa.me is not ours and the test must not depend on the network: answer it locally.
  await context.route("https://wa.me/**", (route) => route.fulfill({ contentType: "text/html", body: "<title>wa.me stub</title>" }));
  await signInToApp(page, "admin@saqient.test");
  const product = await api(page, "/Products", { data: [{ Product_Name: `WA ${tag}`, Product_Code: `WA-${tag}`, VAT_Category: "standard", Unit_Price: "30.000" }] });
  const account = await api(page, "/Accounts", { data: [{ Account_Name: `WA Co ${tag}` }] });
  await api(page, "/Contacts", { data: [{ First_Name: "Salim", Last_Name: `Mobile ${tag}`, Mobile: "+96891234567", Account_Name: { id: account } }] });
  await api(page, "/Contacts", { data: [{ First_Name: "Nora", Last_Name: `Landline ${tag}`, Account_Name: { id: account } }] });
  const quote = await api(page, "/Quotes", { data: [{ Subject: `WA quote ${tag}`, Account_Name: { id: account }, Line_Items: [{ Product: { id: product }, Quantity: "1" }] }] });

  // Asking for the PDF queues its render; the worker stores it, and only then can a link be made.
  await expect.poll(async () => (await page.request.get(`/api/v1/Quotes/${quote}/pdf`)).status(), { timeout: 90_000, intervals: [1_000] }).toBe(200);

  await page.goto(`/app/Quotes/${quote}`);
  await noPageScroll(page);

  // A contact with no mobile number: the button is disabled and the page says why.
  await page.getByRole("combobox", { name: "Contact to send to" }).click();
  await page.getByRole("option", { name: new RegExp(`Landline ${tag}`) }).click();
  await expect(page.getByRole("button", { name: "Send on WhatsApp" })).toBeDisabled();
  await expect(page.getByText("This contact has no mobile number")).toBeVisible();

  // A contact with one: the click opens wa.me/<digits>?text=<message with an /s/ link>.
  await page.getByRole("combobox", { name: "Contact to send to" }).click();
  await page.getByRole("option", { name: new RegExp(`Mobile ${tag}`) }).click();
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Send on WhatsApp" }).click();
  const wa = await popup;
  await expect.poll(() => wa.url(), { timeout: 30_000 }).toMatch(/^https:\/\/wa\.me\/96891234567\?text=/);
  const text = decodeURIComponent(new URL(wa.url()).searchParams.get("text") ?? "");
  expect(text).toContain(`Hello Salim, here is your WA quote ${tag}`);
  const link = text.match(/https?:\/\/\S+\/s\/[A-Za-z0-9_-]{43}/)?.[0];
  expect(link, text).toBeTruthy();

  // The activity is logged, and the link is listed and live.
  await expect(page.getByText("WhatsApp link shared")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
  const opened = await page.request.get(link!);
  expect(opened.status()).toBe(200);
  expect(opened.headers()["content-type"]).toBe("application/pdf");
  await noPageScroll(page);

  // Revoke: the very next request shows the expired page.
  await page.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByText("Revoked", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.goto(link!);
  await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
  await noPageScroll(page);
});
