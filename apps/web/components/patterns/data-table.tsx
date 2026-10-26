import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
};

/**
 * List pattern (DESIGN_SYSTEM.md § Data table): a table from md up, a card list on phones (ADR-0016).
 * The first column is the record's title on the card.
 */
export function DataTable<T>({ caption, columns, rows, rowKey, status = "ready", emptyText, errorText, errorAction }: Props<T>) {
  if (status === "error") {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-4 text-destructive">
        <p>{errorText}</p>
        {errorAction}
      </div>
    );
  }
  if (status === "loading") {
    return (
      <div aria-busy="true" className="flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">{emptyText}</p>;
  }

  const [title, ...rest] = columns;
  return (
    <>
      <Table className="hidden md:table">
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.key} scope="col" className={cn(c.numeric && "text-end")}>
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)}>
              {columns.map((c) => (
                <TableCell key={c.key} className={cn(c.numeric && "text-end tabular-nums")}>
                  {c.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ul aria-label={typeof caption === "string" ? caption : undefined} className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} className="rounded-lg border bg-card p-3">
            <div className="font-medium">{title.cell(row)}</div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
              {rest.map((c) => (
                <div key={c.key} className="contents">
                  <dt className="text-muted-foreground">{c.header}</dt>
                  <dd className={cn("min-w-0 truncate", c.numeric && "text-end tabular-nums")}>{c.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
