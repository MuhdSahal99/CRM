"use server";

import { AcceptInvitationInput, acceptInvitation, getAuthDb } from "@crm/core";

/** Creates the invited user's login (US-03); the form then signs them in. Input is validated here, not trusted from the form. */
export async function acceptInvite(id: string, input: { name: string; password: string }) {
  const parsed = AcceptInvitationInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" } as const;
  return acceptInvitation(getAuthDb(), id, parsed.data);
}
