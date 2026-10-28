import { expect, test } from "@playwright/test";
import { phoneAndDesktop, signInToApp } from "./helpers";

phoneAndDesktop();

// AC-30 (THREAT_MODEL § S): a page on another site auto-submits a form to /api/v1/Deals while the victim is signed in. The session cookie is
// SameSite=Lax, so the browser leaves it off a cross-site POST and the API answers 401: nothing is created on the victim's behalf.
test("AC-30: a cross-site form POST to /api/v1/Deals is sent without the session cookie and rejected", async ({ page, context }) => {
  await signInToApp(page, "admin@saqient.test");
  const target = `${new URL(page.url()).origin}/api/v1/Deals`;
  // enctype=text/plain makes the form body valid JSON, the classic way to forge a JSON POST without a preflight.
  await context.route("https://evil.example/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<form id="f" method="post" action="${target}" enctype="text/plain"><input type="hidden" name='{"data":[{"Deal_Name":"CSRF deal","x":"' value='"}]}'></form><script>document.getElementById("f").submit()</script>`,
    }),
  );
  const attack = page.waitForResponse((r) => r.url() === target && r.request().method() === "POST");
  await page.goto("https://evil.example/");
  const res = await attack;
  expect(await res.request().headerValue("cookie"), "the browser must not attach the session cookie to a cross-site POST").toBeNull();
  expect(res.status()).toBe(401);

  const found = await page.request.get(`/api/v1/Deals/search?word=${encodeURIComponent("CSRF deal")}`);
  expect((await found.json()).data ?? []).toHaveLength(0);
});
