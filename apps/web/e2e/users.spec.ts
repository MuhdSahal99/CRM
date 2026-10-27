import { expect, test } from "@playwright/test";
import { createDisposableRep, noPageScroll, phoneAndDesktop, signIn, signInToApp } from "./helpers";

phoneAndDesktop();

test("T1.25: an admin sees the org's users and invites a rep", async ({ page }) => {
  await signInToApp(page, "admin@saqient.test");
  await page.goto("/app/settings/users");
  await expect(page.getByRole("heading", { level: 1, name: "Users" })).toBeVisible();
  await expect(page.getByText("rep.a@saqient.test").filter({ visible: true }).first()).toBeVisible();
  await noPageScroll(page);

  const email = `invitee-${crypto.randomUUID().slice(0, 8)}@example.test`;
  await page.getByRole("button", { name: "Invite user" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite a user" });
  await dialog.getByLabel("Name").fill("Invited Rep");
  await dialog.getByLabel("Email").fill(email);
  await expect(dialog.getByRole("radio", { name: "Rep" })).toBeChecked();
  await dialog.getByLabel("Reports to").click();
  await page.getByRole("option", { name: "Sales Manager" }).click();
  await dialog.getByRole("button", { name: "Send invite" }).click();

  await expect(dialog.getByLabel("Invitation link")).toHaveValue(/\/accept-invite\/[A-Za-z0-9_-]{43}$/);
  await dialog.getByRole("button", { name: "Close" }).first().click();
  await expect(page.getByText(email).filter({ visible: true }).first()).toBeVisible();
  await noPageScroll(page);
});

test("T1.25: the invite form shows the server's error under the field", async ({ page }) => {
  await signInToApp(page, "admin@saqient.test");
  await page.goto("/app/settings/users");
  await page.getByRole("button", { name: "Invite user" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite a user" });
  await dialog.getByLabel("Name").fill("Duplicate");
  await dialog.getByLabel("Email").fill("rep.b@saqient.test");
  await dialog.getByRole("button", { name: "Send invite" }).click();
  await expect(dialog.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.locator("#email-error")).toHaveText("This email already belongs to a member or has a pending invitation.");
});

test("T1.25: a rep gets 404 on the users page", async ({ page }) => {
  await signInToApp(page, "rep.a@saqient.test");
  const res = await page.goto("/app/settings/users");
  expect(res?.status()).toBe(404);
});

test("T1.26: an admin changes a user's manager, then deactivates them after confirming; their sign-in then fails", async ({ page, browser }) => {
  const leaver = await createDisposableRep();
  await signInToApp(page, "admin@saqient.test");
  await page.goto(`/app/settings/users/${leaver.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "E2E Rep" })).toBeVisible();
  await noPageScroll(page);

  await page.getByLabel("Reports to").click();
  await page.getByRole("option", { name: "Saqient Admin" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Changes saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Reports to")).toHaveText("Saqient Admin");

  await page.getByRole("button", { name: "Deactivate" }).click();
  const confirm = page.getByRole("dialog", { name: "Deactivate E2E Rep?" });
  await confirm.getByRole("button", { name: "Deactivate" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByText("Deactivated", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Deactivate" })).toBeHidden();

  const other = await browser.newPage({ extraHTTPHeaders: { "x-forwarded-for": "10.26.0.1" } });
  await signIn(other, leaver.email);
  await expect(other.locator("#login-error")).toHaveText("This account has been deactivated. Ask your admin.");
  await other.close();
});

test("T5.10 (US-03): the deactivate dialog can transfer the user's open records first", async ({ page }) => {
  const leaver = await createDisposableRep();
  await signInToApp(page, "admin@saqient.test");
  await page.goto(`/app/settings/users/${leaver.id}`);
  await page.getByRole("button", { name: "Deactivate" }).click();
  const confirm = page.getByRole("dialog", { name: "Deactivate E2E Rep?" });
  await confirm.getByLabel("Transfer their open records to").selectOption({ label: "Saqient Admin" });
  await noPageScroll(page);
  await confirm.getByRole("button", { name: "Deactivate" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByText("Deactivated", { exact: true })).toBeVisible();
});
