import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { SearchInput } from "@/components/ui/search-input";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RowMenu } from "./row-menu";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Numbers and money: end-aligned, tabular figures. */
  numeric?: boolean;
};

type Props<T> = {
  caption: ReactNode;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  status?: "ready" | "loading" | "error";
  emptyText: ReactNode;
  errorText: ReactNode;
  /** e.g. a Retry button */
  errorAction?: ReactNode;
  /** Status Segmented + count caption + search, above the rows. */
  toolbar?: ReactNode;
  /** A ⋯ menu per row; `items` returns DropdownMenuItems. */
  rowMenu?: { label: string; items: (row: T) => ReactNode };
};

/** Avatar + two-line cell (name over a muted sub-line). */
export function PersonCell({ name, sub }: { name: string; sub?: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar name={name} size="md" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{name}</span>
        {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
      </span>
    </span>
  );
}

type ToolbarProps = {
  statusLabel: string;
  statuses: SegmentedOption[];
  status: string;
  onStatusChange: (value: string) => void;
  /** e.g. "40 items · OMR 998,510.000", already formatted by the caller from server totals. */
  count: ReactNode;
  searchLabel: string;
  search: string;
  onSearch: (value: string) => void;
};

export function DataTableToolbar({ statusLabel, statuses, status, onStatusChange, count, searchLabel, search, onSearch }: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <Segmented label={statusLabel} options={statuses} value={status} onValueChange={onStatusChange} />
      <p className="text-xs text-muted-foreground tabular-nums">{count}</p>
      <SearchInput label={searchLabel} placeholder={searchLabel} value={search} onChange={(e) => onSearch(e.target.value)} className="ms-auto max-w-64" />
    </div>
  );
}

/**
 * List pattern (GLASS_SPEC § DataTable): no outer border, 56px rows over 1px dividers, a table from md up and stacked
 * card rows on phones (ADR-0016). The first column is the record's title on the card.
 */
export function DataTable<T>({ caption, columns, rows, rowKey, status = "ready", emptyText, errorText, errorAction, toolbar, rowMenu }: Props<T>) {
  const body = (() => {
    if (status === "error") {
      return (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-tile border border-bad/40 bg-glass-tile p-4 text-bad">
          <p>{errorText}</p>
          {errorAction}
        </div>
      );
    }
    if (status === "loading") {
      return (
        <div aria-busy="true" className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-well" />
          ))}
        </div>
      );
    }
    if (rows.length === 0) {
      return <p className="rounded-tile border border-dashed border-line-2 p-6 text-center text-muted-foreground">{emptyText}</p>;
    }
    const [title, ...rest] = columns;
    return (
      <>
        <Table className="hidden md:table">
          <TableCaption className="sr-only">{caption}</TableCaption>
          <TableHeader>
            <TableRow className="border-line hover:bg-transparent">
              {columns.map((c) => (
                <TableHead key={c.key} scope="col" className={cn("px-3 text-xs text-muted-foreground", c.numeric && "text-end")}>
                  {c.header}
                </TableHead>
              ))}
              {rowMenu && <TableHead scope="col" className="w-12 px-3" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={rowKey(row)} className="h-14 border-line hover:bg-well">
                {columns.map((c) => (
                  <TableCell key={c.key} className={cn("px-3", c.numeric && "text-end tabular-nums")}>
                    {c.cell(row)}
                  </TableCell>
                ))}
                {rowMenu && (
                  <TableCell className="w-12 px-3 text-end">
                    <RowMenu label={rowMenu.label}>{rowMenu.items(row)}</RowMenu>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <ul aria-label={typeof caption === "string" ? caption : undefined} className="flex flex-col gap-3 md:hidden">
          {rows.map((row) => (
            <li key={rowKey(row)} className="rounded-tile border border-line bg-glass-tile p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 font-medium">{title.cell(row)}</div>
                {rowMenu && <RowMenu label={rowMenu.label}>{rowMenu.items(row)}</RowMenu>}
              </div>
              <dl className="mt-3 grid grid-cols-[minmax(5rem,auto)_1fr] items-center gap-x-3 gap-y-2 text-sm">
                {rest.map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="text-xs text-muted-foreground">{c.header}</dt>
                    <dd className={cn("min-w-0 truncate", c.numeric && "text-end tabular-nums")}>{c.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </>
    );
  })();

  return (
    <div className="flex flex-col gap-3">
      {toolbar}
      {body}
    </div>
  );
}
