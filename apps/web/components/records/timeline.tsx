import { FileTextIcon, HistoryIcon, PhoneIcon, SquareCheckIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { FieldMeta } from "@/lib/records";

export type TimelineItem = {
  id: string;
  event_type: string;
  actor: { id: string; name: string | null } | null;
  occurred_at: string;
  changes: Record<string, [unknown, unknown]> | null;
  meta: Record<string, unknown> | null;
};

const ACTIVITY_MODULE: Record<string, string> = { task: "Tasks", call: "Calls", meeting: "Meetings" };
const ICON = { activity_logged: SquareCheckIcon, note_added: FileTextIcon } as const;
const TYPE_ICON = { call: PhoneIcon, meeting: UsersIcon } as const;
const isLookup = (f?: FieldMeta) => f?.data_type === "lookup" || f?.data_type === "user_lookup";

/** US-15: a record's history, newest first: field changes, logged activities and notes. */
export function Timeline({ items, fields }: { items: TimelineItem[]; fields: FieldMeta[] }) {
  const t = useTranslations();
  const format = useFormatter();
  const when = (iso: string) => format.dateTime(new Date(iso), "when"); // named format: i18n/request.ts
  const byApi = new Map(fields.map((f) => [f.api_name, f]));
  const show = (v: unknown) => (v === null || v === undefined || v === "" ? t("records.noValue") : String(v));

  return (
    <section aria-labelledby="timeline-heading" className="flex flex-col gap-3">
      <h2 id="timeline-heading" className="text-lg font-medium">{t("timeline.title")}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("timeline.empty")}</p>
      ) : (
        <ol className="flex flex-col gap-4 border-s ps-4">
          {items.map((e) => {
            const meta = e.meta ?? {};
            const type = String(meta.type ?? "");
            const logged = e.event_type === "activity_logged";
            const Icon = logged ? (TYPE_ICON[type as keyof typeof TYPE_ICON] ?? ICON.activity_logged) : (ICON[e.event_type as keyof typeof ICON] ?? HistoryIcon);
            const title = logged ? t("timeline.activity_logged", { type: t(`timeline.types.${type}`) }) : t.has(`timeline.${e.event_type}`) ? t(`timeline.${e.event_type}`) : e.event_type;
            return (
              <li key={e.id} className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-2 text-sm">
                  <Icon className="size-4 text-muted-foreground" aria-hidden />
                  <span className="font-medium">{title}</span>
                  <span className="text-muted-foreground">
                    {t("timeline.by", { name: e.actor?.name ?? t("timeline.system") })} · <time dateTime={e.occurred_at}>{when(e.occurred_at)}</time>
                  </span>
                </div>
                {logged && (
                  <Link href={`/app/${ACTIVITY_MODULE[type]}/${String(meta.activity_id)}`} className="break-words hover:underline">
                    {String(meta.subject ?? "")}
                  </Link>
                )}
                {e.event_type === "note_added" && typeof meta.body === "string" && <p className="break-words whitespace-pre-wrap">{meta.body}</p>}
                {e.changes && Object.keys(e.changes).length > 0 && (
                  <ul className="flex flex-col gap-0.5 text-sm">
                    {Object.entries(e.changes).map(([api, [from, to]]) => {
                      const field = byApi.get(api);
                      return (
                        <li key={api} className="break-words">
                          <span className="text-muted-foreground">{field ? t(field.label_key) : api}</span>
                          {!isLookup(field) && (
                            <>
                              {": "}
                              <bdi>{show(from)}</bdi> → <bdi>{show(to)}</bdi>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
