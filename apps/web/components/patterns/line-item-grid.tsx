"use client";

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
  priceError?: string;
  discountError?: string;
};

/** Edit mode (the quote editor): the grid is controlled and still computes nothing; amounts come from the server. */
export type LineEditor = {
  onChange: (index: number, field: "quantity" | "listPrice" | "discountPercent", value: string) => void;
  onRemove: (index: number) => void;
  adjustment: string;
  onAdjustment: (value: string) => void;
  adjustmentError?: string;
  /** Replaces the plain "Add line" button (the product picker). */
  add?: React.ReactNode;
};

export type Totals = {
  subTotal: string;
  vatSummary: { category: VatCategory; rate: string | null; base: string; vat: string | null }[];
  vatTotal: string;
  adjustment: string;
  grandTotal: string;
  vatTotalOmr?: string;
};

const F = { qty: "quantity", price: "listPrice", disc: "discountPercent" } as const;

// One grid for both layouts: 2 columns on phones, a single row per line from lg up.
const ROW = "grid grid-cols-2 gap-x-3 gap-y-2 lg:grid-cols-[minmax(0,1fr)_5.5rem_7rem_5.5rem_8rem_8rem_2.25rem] lg:items-center";

export function LineItemGrid({ lines, totals, currency, editor }: { lines: Line[]; totals: Totals; currency: Currency; editor?: LineEditor }) {
  const t = useTranslations("lineItems");
  const uid = useId();
  const bind = (i: number, field: "quantity" | "listPrice" | "discountPercent", value: string) =>
    editor ? { value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => editor.onChange(i, field, e.target.value) } : { defaultValue: value };
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
          const qtyProps = bind(i, F.qty, line.quantity);
          const priceProps = bind(i, F.price, line.listPrice);
          const discProps = bind(i, F.disc, line.discountPercent);
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
                  {...qtyProps}
                  className="text-end tabular-nums"
                  aria-invalid={line.quantityError ? true : undefined}
                  aria-describedby={line.quantityError ? id("qty-err") : undefined}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={id("price")} className="lg:sr-only">{t("listPrice")}</Label>
                <Input id={id("price")} inputMode="decimal" {...priceProps} placeholder={editor ? t("auto") : undefined} aria-invalid={line.priceError ? true : undefined} className="text-end tabular-nums" />
                {line.priceError && <p className="text-xs text-destructive">{line.priceError}</p>}
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={id("disc")} className="lg:sr-only">{t("discount")}</Label>
                <Input id={id("disc")} inputMode="decimal" {...discProps} aria-invalid={line.discountError ? true : undefined} className="text-end tabular-nums" />
                {line.discountError && <p className="text-xs text-destructive">{line.discountError}</p>}
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
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => editor?.onRemove(i)} aria-label={t("removeLine", { n: i + 1 })} className="col-span-2 justify-self-end lg:col-span-1">
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

      {editor?.add ?? (
        <Button type="button" variant="outline" className="self-start">
          <PlusIcon aria-hidden />
          {t("addLine")}
        </Button>
      )}

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
          <Input
            id={`${uid}-adjustment`}
            inputMode="decimal"
            {...(editor ? { value: editor.adjustment, onChange: (e: React.ChangeEvent<HTMLInputElement>) => editor.onAdjustment(e.target.value) } : { defaultValue: totals.adjustment })}
            aria-invalid={editor?.adjustmentError ? true : undefined}
            className="w-28 text-end tabular-nums"
          />
          {editor?.adjustmentError && <p className="text-xs text-destructive">{editor.adjustmentError}</p>}
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
