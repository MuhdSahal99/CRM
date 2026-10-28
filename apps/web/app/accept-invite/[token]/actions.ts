"use server";

import { AcceptInvitationInput, acceptInvitation, getAuthDb } from "@crm/core";
import { headers } from "next/headers";
import { badToken, clientIp, gate } from "@/lib/rate-limit";

/** Creates the invited user's login (US-03); the form then signs them in. Input is validated here, not trusted from the form. */
export async function acceptInvite(token: string, input: { name: string; password: string }) {
  const ip = clientIp(await headers());
  if (!(await gate("invite", ip)).allowed) return { ok: false, reason: "limited" } as const; // T9.07: the same Redis limiter as /s/{token}
  const parsed = AcceptInvitationInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" } as const;
  const accepted = await acceptInvitation(getAuthDb(), token, parsed.data);
  if (!accepted.ok && accepted.reason === "gone") await badToken("invite", ip);
  return accepted;
}
