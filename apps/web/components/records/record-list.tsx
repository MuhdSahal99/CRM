"use client";

import { LayoutGridIcon, TableIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { type Column, DataTable } from "@/components/patterns/data-table";
import { Avatar } from "@/components/ui/avatar";
import { SearchInput } from "@/components/ui/search-input";
import { Segmented } from "@/components/ui/segmented";
import { listColumns, recordTitle } from "@/lib/record-view";
import type { FieldMeta, ModuleMeta, RecordData } from "@/lib/records";
import { FieldValue } from "./field-value";
import { RecordCard } from "./record-card";

type Props = {
  module: string;
  meta: ModuleMeta;
  rows: RecordData[];
  caption: string;
  emptyText: string;
  /** A search pill over the loaded rows, and for people and companies a Grid / Table toggle. */
  browse?: boolean;
};

const CARD_MODULES = ["Leads", "Accounts", "Contacts"];
const textOf = (v: unknown) => (v && typeof v === "object" ? String((v as { name?: unknown }).name ?? "") : v == null ? "" : String(v));

/** A module's records as the list pattern (table on desktop, cards on phones, optionally an entity-card grid). Columns come from the layout. */
export function RecordList({ module, meta, rows, caption, emptyText, browse = false }: Props) {
  const t = useTranslations();
  const [view, setView] = useState("table");
  const [search, setSearch] = useState("");
  const cols = listColumns(meta);
  const column = (f: FieldMeta): Column<RecordData> => ({ key: f.api_name, header: t(f.label_key), cell: (r) => <FieldValue field={f} value={r[f.api_name]} /> });
  const lookup = cols.find((c) => c.data_type === "lookup");
  const columns: Column<RecordData>[] = [
    {
      key: "name",
      header: meta.nameFields.length === 1 ? t(`fields.${module}.${meta.nameFields[0]}`) : t("records.name"),
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={recordTitle(meta, r) || "?"} size="md" />
          <span className="min-w-0">
            <Link href={`/app/${module}/${r.id}`} className="block truncate text-sm font-medium hover:underline">
              {recordTitle(meta, r)}
            </Link>
            {lookup && textOf(r[lookup.api_name]) && <span className="block truncate text-xs text-muted-foreground">{textOf(r[lookup.api_name])}</span>}
          </span>
        </span>
      ),
    },
    ...cols.map(column),
  ];
  const needle = search.trim().toLowerCase();
  const shown = needle ? rows.filter((r) => [recordTitle(meta, r), ...cols.map((c) => textOf(r[c.api_name]))].some((s) => s.toLowerCase().includes(needle))) : rows;
  const cards = browse && CARD_MODULES.includes(module);

  const toolbar = browse && (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <SearchInput label={t("records.search")} placeholder={t("records.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
      {cards && (
        <Segmented
          className="ms-auto"
          label={t("records.view")}
          value={view}
          onValueChange={setView}
          options={[
            { value: "table", label: t("records.viewTable"), icon: <TableIcon /> },
            { value: "grid", label: t("records.viewGrid"), icon: <LayoutGridIcon /> },
          ]}
        />
      )}
    </div>
  );

  if (cards && view === "grid" && shown.length > 0) {
    return (
      <div className="flex flex-col gap-3">
        {toolbar}
        <ul aria-label={caption} className="grid grid-cols-1 gap-(--gap) sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {shown.map((r) => (
            <li key={r.id} className="relative">
              <RecordCard module={module} meta={meta} row={r} columns={cols} />
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={shown}
      rowKey={(r) => r.id}
      emptyText={rows.length > 0 ? t("records.noMatch") : emptyText}
      errorText={t("records.failed")}
      toolbar={toolbar || undefined}
    />
  );
}
