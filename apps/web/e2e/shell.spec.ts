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

test("T1.23: on a phone the menu button opens a drawer with the nav, and focus returns to it", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("w360"), "phone layout");
  await signInToApp(page, "rep.a@saqient.test");
  const menu = page.getByRole("button", { name: "Open menu" });
  await expect(page.getByRole("complementary")).toBeHidden(); // no sidebar on phones
  await menu.click();
  const drawer = page.getByRole("dialog", { name: "Menu" });
  await expect(drawer.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  await noPageScroll(page);
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(menu).toBeFocused();
  await menu.click();
  await drawer.getByRole("link", { name: "Home" }).click(); // a nav link closes the drawer
  await expect(drawer).toBeHidden();
});

test("T1.23: on desktop the sidebar is visible and the menu button is not", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("w1440"), "desktop layout");
  await signInToApp(page, "rep.a@saqient.test");
  await expect(page.getByRole("complementary").getByRole("link", { name: "Home" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeHidden();
  await noPageScroll(page);
});
