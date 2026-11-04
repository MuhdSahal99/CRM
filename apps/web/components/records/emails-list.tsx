import { getTranslations } from "next-intl/server";
import { MailIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassCard, Tile } from "@/components/ui/glass-card";
import { StatusPill } from "@/components/ui/status";
import type { Tone } from "@/components/ui/tone";

const TONE: Record<EmailRow["Status"], Tone> = { queued: "sky", sending: "sky", sent: "lime", failed: "coral" };

export type EmailRow = { id: string; To: { name: string }; To_Email: string; Subject: string; Status: "queued" | "sending" | "sent" | "failed"; Error: string | null; Queued_Time: string; Sent_Time: string | null };

/** T9.04 (US-13): the emails sent from a quote, sales order or invoice. A failed send shows its error here, and no "sent" event exists for it. */
export async function EmailsList({ rows }: { rows: EmailRow[] }) {
  const t = await getTranslations("email");
  return (
    <GlassCard title={t("title")} aria-label={t("title")}>
      {rows.length === 0 ? (
        <EmptyState icon={<MailIcon />} title={t("empty")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((e) => (
            <li key={e.id}>
<Tile className="flex flex-col gap-1 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 font-medium break-words">{e.Subject}</span>
                <StatusPill tone={TONE[e.Status]}>{t(`status.${e.Status}`)}</StatusPill>
              </div>
              <span className="text-sm text-muted-foreground break-words">
                {e.To.name} ({e.To_Email})
              </span>
              {e.Error && (
                <p role="alert" className="text-sm text-destructive break-words">
                  {e.Error}
                </p>
              )}
            </Tile>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
