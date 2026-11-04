import { expect, test } from "@playwright/test";
import { noPageScroll, phoneAndDesktop, signInToApp } from "./helpers";

phoneAndDesktop();

test("T1.22: /app without a session redirects to /login", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
});

test("T1.22: with a session, /app renders inside the app shell", async ({ page }) => {
  await signInToApp(page, "rep.a@saqient.test");
  await expect(page.locator("[data-app-shell]")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await noPageScroll(page);
});

test("T1.23: the pill tab bar marks the current page, and the tabs reach a module list", async ({ page }) => {
  await signInToApp(page, "rep.a@saqient.test");
  const tabs = page.getByRole("navigation", { name: "Main" });
  await expect(tabs.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: "Accounts" }).click();
  await expect(page).toHaveURL(/\/app\/Accounts$/);
  await expect(tabs.getByRole("link", { name: "Accounts" })).toHaveAttribute("aria-current", "page");
  await noPageScroll(page);
});

test("T1.23: the dock offers search, create and today; the palette opens with Ctrl+K and jumps to a page", async ({ page }) => {
  await signInToApp(page, "rep.a@saqient.test");
  const dock = page.getByRole("complementary", { name: "Quick actions" });
  await expect(dock.getByRole("link", { name: "Today" })).toHaveAttribute("href", "/app/activities");
  await expect(dock.getByRole("button", { name: "Color theme" })).toBeVisible();
  await dock.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("menuitem", { name: "New Accounts" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByRole("combobox").fill("Contacts");
  await palette.getByRole("option", { name: "Contacts" }).first().click();
  await expect(page).toHaveURL(/\/app\/Contacts$/);
});

test("T1.23: the first Tab stop is the skip link, which moves focus to the main content", async ({ page }) => {
  await signInToApp(page, "rep.a@saqient.test");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("settings: admins get one Settings entry and a sub-nav; reps get neither", async ({ page }) => {
  await signInToApp(page, "admin@saqient.test");
  await page.getByRole("complementary", { name: "Quick actions" }).getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/app\/settings\/users$/);
  const sub = page.getByRole("navigation", { name: "Settings" });
  await expect(sub.getByRole("link", { name: "Users" })).toHaveAttribute("aria-current", "page");
  await sub.getByRole("link", { name: "VAT rates" }).click();
  await expect(page).toHaveURL(/\/app\/settings\/vat$/);
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Users" })).toHaveCount(0);
});

test("settings: a rep has no Settings entry", async ({ page }) => {
  await signInToApp(page, "rep.a@saqient.test");
  await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
});

test("T1.24: the top bar shows the org and account; sign out returns to /login and /app then redirects", async ({ page }) => {
  await signInToApp(page, "rep.a@saqient.test");
  const bar = page.getByRole("banner");
  await expect(bar.getByText("Saqient", { exact: true })).toBeVisible();
  await noPageScroll(page);
  await bar.getByRole("button", { name: "Account" }).click();
  await expect(page.getByRole("menu").getByText("rep.a@saqient.test")).toBeVisible();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
});
