import { createAuthClient } from "better-auth/client";

// Same-origin Better Auth client (/api/auth). No other sign-in path exists.
const authClient = createAuthClient();

export type SignInResult = { ok: true } | { ok: false; reason: "invalid" | "deactivated" | "unavailable" };

export async function signInEmail(input: { email: string; password: string; rememberMe: boolean }): Promise<SignInResult> {
  let error: { status: number } | null;
  try {
    ({ error } = await authClient.signIn.email(input));
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (!error) return { ok: true };
  if (error.status === 401) return { ok: false, reason: "invalid" };
  // Better Auth admin plugin answers 403 for banned (deactivated) users (PRD US-01).
  if (error.status === 403) return { ok: false, reason: "deactivated" };
  return { ok: false, reason: "unavailable" };
}

/** Ends the session (Better Auth deletes it server-side and clears the cookie). */
export async function signOut(): Promise<void> {
  await authClient.signOut();
}
