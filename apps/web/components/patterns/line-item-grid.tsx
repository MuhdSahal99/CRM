import { useId } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Money } from "@/components/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Currency } from "@/lib/format";

type VatCategory = "standard" | "zero_rated" | "exempt";

/** Money fields are decimal strings computed by the server pricing engine (ADR-0007). */
export type Line = {
  id: string;
  product: string;
  vatCategory: VatCategory;
  vatRate: string | null;
  quantity: string;
  listPrice: string;
  discountPercent: string;
  vatAmount: string;
  lineTotal: string;
  quantityError?: string;
};

export type Totals = {
  subTotal: string;
  vatSummary: { category: VatCategory; rate: string | null; base: string; vat: string | null }[];
  vatTotal: string;
  adjustment: string;
  grandTotal: string;
  vatTotalOmr?: string;
};

// One grid for both layouts: 2 columns on phones, a single row per line from lg up.
const ROW = "grid grid-cols-2 gap-x-3 gap-y-2 lg:grid-cols-[minmax(0,1fr)_5.5rem_7rem_5.5rem_8rem_8rem_2.25rem] lg:items-center";

export function LineItemGrid({ lines, totals, currency }: { lines: Line[]; totals: Totals; currency: Currency }) {
  const t = useTranslations("lineItems");
  const uid = useId();
  const vatLabel = (c: VatCategory, rate: string | null) => t(`vatCategory.${c}`, { rate: rate ?? "" });

  return (
    <div className="flex flex-col gap-4">
      <div aria-hidden className={`${ROW} hidden border-b px-3 pb-2 text-xs font-medium text-muted-foreground lg:grid`}>
        <span>{t("product")}</span>
        <span className="text-end">{t("quantity")}</span>
        <span className="text-end">{t("listPrice")}</span>
        <span className="text-end">{t("discount")}</span>
        <span className="text-end">{t("vat")}</span>
        <span className="text-end">{t("lineTotal")}</span>
        <span />
      </div>

      <ol className="flex flex-col gap-2">
        {lines.map((line, i) => {
          const id = (f: string) => `${uid}-${line.id}-${f}`;
          return (
            <li key={line.id} className={`${ROW} rounded-lg border bg-card p-3 lg:rounded-none lg:border-x-0 lg:border-t-0 lg:bg-transparent lg:py-2`}>
              <div className="col-span-2 flex items-center justify-between gap-2 lg:col-span-1">
                <div className="min-w-0">
                  <span className="sr-only">{t("lineNo", { n: i + 1 })} </span>
                  <span className="font-medium">{line.product}</span>
                </div>
                <Badge variant="outline" className="lg:hidden">
                  {vatLabel(line.vatCategory, line.vatRate)}
                </Badge>
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor={id("qty")} className="lg:sr-only">{t("quantity")}</Label>
                <Input
                  id={id("qty")}
                  inputMode="decimal"
                  defaultValue={line.quantity}
                  className="text-end tabular-nums"
                  aria-invalid={line.quantityError ? true : undefined}
                  aria-describedby={line.quantityError ? id("qty-err") : undefined}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={id("price")} className="lg:sr-only">{t("listPrice")}</Label>
                <Input id={id("price")} inputMode="decimal" defaultValue={line.listPrice} className="text-end tabular-nums" />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={id("disc")} className="lg:sr-only">{t("discount")}</Label>
                <Input id={id("disc")} inputMode="decimal" defaultValue={line.discountPercent} className="text-end tabular-nums" />
              </div>

              <div className="flex flex-col gap-1 text-end">
                <span className="text-xs text-muted-foreground lg:sr-only">{t("vat")}</span>
                <span>
                  <Money value={line.vatAmount} currency={currency} />
                </span>
                <span className="hidden text-xs text-muted-foreground lg:block">{vatLabel(line.vatCategory, line.vatRate)}</span>
              </div>
              <div className="col-span-2 flex items-baseline justify-between gap-2 border-t pt-2 lg:col-span-1 lg:block lg:border-0 lg:pt-0 lg:text-end">
                <span className="text-xs text-muted-foreground lg:sr-only">{t("lineTotal")}</span>
                <Money value={line.lineTotal} currency={currency} className="font-medium" />
              </div>
              <Button variant="ghost" size="icon-sm" aria-label={t("removeLine", { n: i + 1 })} className="col-span-2 justify-self-end lg:col-span-1">
                <Trash2Icon aria-hidden />
              </Button>

              {line.quantityError && (
                <p id={id("qty-err")} className="col-span-2 text-xs text-destructive lg:col-span-7">
                  {line.quantityError}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <Button variant="outline" className="self-start">
        <PlusIcon aria-hidden />
        {t("addLine")}
      </Button>

      <dl className="ms-auto grid w-full grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 sm:max-w-sm">
        <dt>{t("subTotal")}</dt>
        <dd className="text-end">
          <Money value={totals.subTotal} currency={currency} />
        </dd>
        {totals.vatSummary.map((s) => (
          <div key={s.category} className="contents text-muted-foreground">
            <dt className="flex flex-wrap gap-x-1.5 text-xs">
              <span>{t("vatBase", { category: vatLabel(s.category, s.rate) })}</span>
              <Money value={s.base} currency={currency} />
            </dt>
            <dd className="text-end text-xs">{s.vat === null ? t("noVat") : <Money value={s.vat} currency={currency} />}</dd>
          </div>
        ))}
        <dt>{t("vatTotal")}</dt>
        <dd className="text-end">
          <Money value={totals.vatTotal} currency={currency} />
        </dd>
        <dt className="self-center">
          <Label htmlFor={`${uid}-adjustment`}>{t("adjustment")}</Label>
        </dt>
        <dd>
          <Input id={`${uid}-adjustment`} inputMode="decimal" defaultValue={totals.adjustment} className="w-28 text-end tabular-nums" />
        </dd>
        <dt className="border-t pt-2 font-semibold">{t("grandTotal")}</dt>
        <dd className="border-t pt-2 text-end text-base font-semibold">
          <Money value={totals.grandTotal} currency={currency} />
        </dd>
        {totals.vatTotalOmr && (
          <>
            <dt className="text-xs text-muted-foreground">{t("vatInOmr")}</dt>
            <dd className="text-end text-xs text-muted-foreground">
              <Money value={totals.vatTotalOmr} currency="OMR" />
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}
