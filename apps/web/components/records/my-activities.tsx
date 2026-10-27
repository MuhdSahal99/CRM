import { TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type Column, DataTable } from "@/components/patterns/data-table";
import { Badge } from "@/components/ui/badge";
import type { FieldMeta, RecordData } from "@/lib/records";
import { CompleteButton } from "./complete-button";
import { FieldValue } from "./field-value";

type Props = { rows: RecordData[]; fields: FieldMeta[] };

/** US-15: my open tasks, overdue first by due date. Overdue is a badge with text and an icon, never colour alone. */
export function MyActivities({ rows, fields }: Props) {
  const t = useTranslations();
  const field = (api: string) => fields.find((f) => f.api_name === api);
  const shown = (api: string, header: string): Column<RecordData>[] => {
    const f = field(api);
    return f ? [{ key: api, header, cell: (r) => <FieldValue field={f} value={r[api]} /> }] : [];
  };
  const columns: Column<RecordData>[] = [
    { key: "Subject", header: t("fields.Tasks.Subject"), cell: (r) => <Link href={`/app/Tasks/${r.id}`} className="font-medium hover:underline">{String(r.Subject)}</Link> },
    ...shown("Due_Date", t("fields.Tasks.Due_Date")).map((c) => ({
      ...c,
      cell: (r: RecordData) =>
        r.Is_Overdue ? (
          <span className="flex flex-wrap items-center gap-2">
            {c.cell(r)}
            <Badge variant="destructive">
              <TriangleAlertIcon aria-hidden />
              {t("activities.overdue")}
            </Badge>
          </span>
        ) : (
          c.cell(r)
        ),
    })),
    ...shown("Priority", t("fields.Tasks.Priority")),
    ...shown("What_Id", t("fields.Tasks.What_Id")),
    { key: "complete", header: <span className="sr-only">{t("activities.complete")}</span>, cell: (r) => <CompleteButton id={r.id} version={r.version} subject={String(r.Subject)} /> },
  ];
  return <DataTable caption={t("activities.list")} columns={columns} rows={rows} rowKey={(r) => r.id} emptyText={t("activities.empty")} errorText={t("records.failed")} />;
}
