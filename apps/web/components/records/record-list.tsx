import Link from "next/link";
import { useTranslations } from "next-intl";
import { type Column, DataTable } from "@/components/patterns/data-table";
import { type FieldMeta, listColumns, type ModuleMeta, type RecordData, recordTitle } from "@/lib/records";
import { FieldValue } from "./field-value";

type Props = { module: string; meta: ModuleMeta; rows: RecordData[]; caption: string; emptyText: string };

/** A module's records as the list pattern (table on desktop, cards on phones). Columns come from the layout. */
export function RecordList({ module, meta, rows, caption, emptyText }: Props) {
  const t = useTranslations();
  const column = (f: FieldMeta): Column<RecordData> => ({ key: f.api_name, header: t(f.label_key), cell: (r) => <FieldValue field={f} value={r[f.api_name]} /> });
  const columns: Column<RecordData>[] = [
    {
      key: "name",
      header: meta.nameFields.length === 1 ? t(`fields.${module}.${meta.nameFields[0]}`) : t("records.name"),
      cell: (r) => <Link href={`/app/${module}/${r.id}`} className="font-medium hover:underline">{recordTitle(meta, r)}</Link>,
    },
    ...listColumns(meta).map(column),
  ];
  return <DataTable caption={caption} columns={columns} rows={rows} rowKey={(r) => r.id} emptyText={emptyText} errorText={t("records.failed")} />;
}
