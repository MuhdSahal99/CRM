import { expect, test } from "@playwright/test";

async function noPageScroll(page: import("@playwright/test").Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.scrollingElement!.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

test("landing page renders and the sample invoice recomputes", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sales CRM that counts every baisa");
  await noPageScroll(page);

  const invoice = page.getByRole("article", { name: "Sample tax invoice" }).first();
  await expect(invoice).toContainText("OMR 358.000");
  // One more network switch: 4 × 100.000 − 10% = 360.000 net, VAT 18.000; sub total 434.690 → grand 452.500.
  await invoice.getByRole("button", { name: "More: Network switch, 24-port" }).click();
  await expect(invoice).toContainText("OMR 452.500");

  await page.screenshot({ path: info.outputPath(`${info.project.name}.png`), fullPage: true });
  expect(errors).toEqual([]);
});

test("login posts to the real auth endpoint and shows its failure", async ({ page }, info) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
  await noPageScroll(page);

  const req = page.waitForRequest((r) => r.url().endsWith("/api/auth/sign-in/email") && r.method() === "POST");
  await page.getByLabel("Email").fill("rep@example.com");
  await page.getByLabel("Password").fill("not-a-real-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  expect((await req).postDataJSON()).toMatchObject({ email: "rep@example.com", rememberMe: true });

  // No auth backend until slice 1: the form must refuse, never let the user through.
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await page.screenshot({ path: info.outputPath(`${info.project.name}-login.png`), fullPage: true });
});
