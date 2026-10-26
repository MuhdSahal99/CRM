// shortcut: plain fetch to Better Auth's POST /api/auth/sign-in/email until slice 1 installs better-auth;
// then replace with createAuthClient().signIn.email (same endpoint and body). No other sign-in path exists.
export type SignInResult = { ok: true } | { ok: false; reason: "invalid" | "deactivated" | "unavailable" };

export async function signInEmail(input: { email: string; password: string; rememberMe: boolean }): Promise<SignInResult> {
  let res: Response;
  try {
    res = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (res.ok) return { ok: true };
  if (res.status === 401) return { ok: false, reason: "invalid" };
  // Better Auth admin plugin answers 403 for banned (deactivated) users (PRD US-01).
  if (res.status === 403) return { ok: false, reason: "deactivated" };
  return { ok: false, reason: "unavailable" };
}
