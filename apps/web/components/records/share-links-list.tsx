"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { callApi } from "@/lib/api-client";

export type ShareLinkRow = { id: string; expires_at: string; revoked_at: string | null; access_count: number; created_by: { name: string | null } };

/** T9.08 (US-14): the links shared for this document, newest first, each with a Revoke that takes effect on the link's next request. Tokens are never shown. */
export function ShareLinksList({ module, id, links }: { module: string; id: string; links: ShareLinkRow[] }) {
  const t = useTranslations("whatsapp");
  const format = useFormatter();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (links.length === 0) return null;

  async function revoke(linkId: string) {
    setBusy(linkId);
    await callApi("DELETE", `/${module}/${id}/share_links/${linkId}`);
    setBusy(null);
    router.refresh();
  }

  return (
    <section aria-labelledby="links-title" className="flex flex-col gap-2">
      <h2 id="links-title" className="text-lg font-medium">
        {t("title")}
      </h2>
      <ul className="flex flex-col divide-y rounded-lg border">
        {links.map((l) => {
          const expired = new Date(l.expires_at) <= new Date();
          const active = !l.revoked_at && !expired;
          return (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2">
                  <Badge variant={active ? "secondary" : "outline"}>{l.revoked_at ? t("state.revoked") : expired ? t("state.expired") : t("state.active")}</Badge>
                  <span className="text-sm text-muted-foreground">{t("until", { date: format.dateTime(new Date(l.expires_at), { dateStyle: "medium" }) })}</span>
                </span>
                <span className="text-sm text-muted-foreground">{t("opened", { count: l.access_count })}</span>
              </div>
              {active && (
                <Button type="button" variant="outline" size="sm" onClick={() => revoke(l.id)} disabled={busy !== null}>
                  {busy === l.id && <Loader2Icon className="animate-spin" aria-hidden />}
                  {t("revoke")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
