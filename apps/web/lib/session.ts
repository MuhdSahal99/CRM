import { resolveContext, type TenantContext } from "@crm/core";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

/**
 * The signed-in context for server components, resolved once per request (layout and page share it).
 * The proxy only saw a cookie; this checks the session itself and sends anyone without one to /login.
 */
export const requireContext = cache(async (): Promise<TenantContext> => {
  const ctx = await resolveContext(await headers());
  if (!ctx) redirect("/login");
  return ctx;
});
