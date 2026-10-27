import { expect, test } from "@playwright/test";
import { noPageScroll, phoneAndDesktop, signInToApp } from "./helpers";

phoneAndDesktop();

test("US-03: an invited person opens the link, sets a name and password, and lands signed in; the link works once", async ({ page, browser }) => {
  const email = `accept-${crypto.randomUUID().slice(0, 8)}@example.test`;
  await signInToApp(page, "admin@saqient.test");
  await page.goto("/app/settings/users");
  await page.getByRole("button", { name: "Invite user" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite a user" });
  await dialog.getByLabel("Name").fill("Invited Person");
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByRole("button", { name: "Send invite" }).click();
  const link = await dialog.getByLabel("Invitation link").inputValue();

  const octet = () => Math.floor(Math.random() * 256);
  const context = await browser.newContext({ viewport: page.viewportSize(), extraHTTPHeaders: { "x-forwarded-for": `10.${octet()}.${octet()}.${octet()}` } });
  const invitee = await context.newPage();
  await invitee.goto(link);
  await expect(invitee.getByRole("heading", { level: 1, name: "Join your team" })).toBeVisible({ timeout: 30_000 });
  await expect(invitee.getByLabel("Email")).toHaveValue(email);
  await noPageScroll(invitee);
  await invitee.getByLabel("Your name").fill("Invited Person");
  await invitee.getByLabel("Password").fill("a-long-enough-password");
  await invitee.getByRole("button", { name: "Create account and sign in" }).click();
  await expect(invitee).toHaveURL(/\/app$/, { timeout: 30_000 });

  const again = await invitee.goto(link);
  expect(again?.status()).toBe(404);
  await context.close();
});
