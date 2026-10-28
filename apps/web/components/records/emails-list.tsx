import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";

export type EmailRow = { id: string; To: { name: string }; To_Email: string; Subject: string; Status: "queued" | "sending" | "sent" | "failed"; Error: string | null; Queued_Time: string; Sent_Time: string | null };

/** T9.04 (US-13): the emails sent from a quote, sales order or invoice. A failed send shows its error here, and no "sent" event exists for it. */
export async function EmailsList({ rows }: { rows: EmailRow[] }) {
  const t = await getTranslations("email");
  return (
    <section aria-labelledby="emails-title" className="flex flex-col gap-2">
      <h2 id="emails-title" className="text-lg font-medium">
        {t("title")}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {rows.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 font-medium break-words">{e.Subject}</span>
                <Badge variant={e.Status === "failed" ? "destructive" : e.Status === "sent" ? "secondary" : "outline"}>{t(`status.${e.Status}`)}</Badge>
              </div>
              <span className="text-sm text-muted-foreground break-words">
                {e.To.name} ({e.To_Email})
              </span>
              {e.Error && (
                <p role="alert" className="text-sm text-destructive break-words">
                  {e.Error}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
