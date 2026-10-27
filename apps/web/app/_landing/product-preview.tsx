import { getTranslations } from "next-intl/server";
import { Money } from "@/components/money";
import { Badge } from "@/components/ui/badge";
import type { Currency } from "@/lib/format";
import { DocSheet } from "./doc-sheet";

// Sample records shown on the public page (record data, not UI text). Totals are what the server would return.
const URL_TEXT = "crm.saqient.com/app/deals";
const BOARD: { stage: "proposal" | "negotiation" | "closed_won"; count: number; totalOmr: string; deal: string; account: string; amount: string; currency: Currency }[] = [
  { stage: "proposal", count: 4, totalOmr: "18400.000", deal: "Muscat Port fit-out", account: "Al Bustan Trading LLC", amount: "10000.000", currency: "OMR" },
  { stage: "negotiation", count: 2, totalOmr: "9150.500", deal: "Sohar warehouse racks", account: "Gulf Steel Works", amount: "62500.00", currency: "AED" },
  { stage: "closed_won", count: 3, totalOmr: "21730.250", deal: "Nizwa clinic network", account: "Interior Health Co.", amount: "4200.000", currency: "OMR" },
];

/**
 * The product, drawn with the design system instead of a screenshot: a browser frame around a mini Deals board and
 * the live sample tax invoice. Tokens only, so it follows light and dark (ADR-0016: no images to localise).
 */
export async function ProductPreview() {
  const t = await getTranslations("landing.preview");
  const tStage = await getTranslations("stages");
  const tSheet = await getTranslations("landing.sheet");

  return (
    <figure aria-label={t("label")} className="flex min-w-0 flex-col overflow-hidden rounded-lg border bg-background shadow-sm">
      <div className="flex items-center gap-3 border-b bg-muted px-3 py-2" aria-hidden>
        <span className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-2.5 rounded-full bg-foreground/15" />
          ))}
        </span>
        <span className="min-w-0 flex-1 truncate rounded-md bg-background px-3 py-1 text-xs text-muted-foreground" dir="ltr">
          {URL_TEXT}
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-4 p-3 sm:p-6">
        <div role="group" aria-label={t("board")} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {BOARD.map((col, i) => (
            <section key={col.stage} aria-label={tStage(col.stage)} className={i === 2 ? "hidden flex-col gap-2 rounded-lg bg-muted p-2 sm:flex" : "flex flex-col gap-2 rounded-lg bg-muted p-2"}>
              <header className="flex flex-col gap-0.5 px-1">
                <h3 className="flex items-center justify-between gap-2 truncate text-xs font-medium">
                  <span className="truncate">{tStage(col.stage)}</span>
                  <Badge variant="secondary" className="bg-card tabular-nums">
                    {col.count}
                  </Badge>
                </h3>
                <p className="text-xs text-muted-foreground">
                  <Money value={col.totalOmr} currency="OMR" />
                </p>
              </header>
              <div className="rounded-md border bg-card p-2.5 text-xs shadow-xs">
                <p className="truncate font-medium">{col.deal}</p>
                <p className="truncate text-muted-foreground">{col.account}</p>
                <p className="mt-1.5 text-end">
                  <Money value={col.amount} currency={col.currency} />
                </p>
              </div>
            </section>
          ))}
        </div>
        <DocSheet kind="taxInvoice" live className="sm:w-full" />
      </div>
      <figcaption className="border-t px-3 py-3 text-muted-foreground sm:px-6">{tSheet("caption")}</figcaption>
    </figure>
  );
}
