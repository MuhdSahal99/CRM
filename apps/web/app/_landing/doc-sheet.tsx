"use client";

import { useState } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { baisa, priceLines, SAMPLE_ADJUSTMENT, SAMPLE_LINES } from "./price";

export type DocKind = "taxInvoice" | "quote" | "salesOrder";

const NUMBERS: Record<DocKind, string> = { taxInvoice: "INV-000184", quote: "QT-000412", salesOrder: "SO-000233" };
const ISSUED = new Date("2026-10-27T12:00:00+04:00");
const VALID_TILL = new Date("2026-11-26T12:00:00+04:00");

/** A sample sales document at true size. `live` adds quantity steppers (the page's one live thing). */
export function DocSheet({ kind, live = false, className }: { kind: DocKind; live?: boolean; className?: string }) {
  const t = useTranslations("landing.sheet");
  const format = useFormatter();
  const [qty, setQty] = useState(() => SAMPLE_LINES.map((l) => l.qty));
  const r = priceLines(
    SAMPLE_LINES.map((l, i) => ({ ...l, qty: qty[i] })),
    SAMPLE_ADJUSTMENT,
  );
  const step = (i: number, d: number) => setQty((q) => q.map((v, j) => (j === i ? Math.min(99, Math.max(1, v + d)) : v)));
  const date = (d: Date) => format.dateTime(d, { dateStyle: "medium" });

  return (
    <article
      data-ui
      aria-label={t("label")}
      className={cn("w-full shrink-0 rounded-md bg-card p-5 text-card-foreground sm:w-[34rem] sm:p-8", className)}
    >
      <header className="flex items-start justify-between gap-6">
        <div>
          <h3 className="text-lg font-semibold">{t(kind)}</h3>
          <p className="mt-1 text-muted-foreground">{t("number", { n: NUMBERS[kind] })}</p>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1 text-end">
          <dt className="text-muted-foreground">{t("date")}</dt>
          <dd>{date(ISSUED)}</dd>
          {kind === "quote" && (
            <>
              <dt className="text-muted-foreground">{t("validTill")}</dt>
              <dd>{date(VALID_TILL)}</dd>
            </>
          )}
          {kind === "salesOrder" && (
            <>
              <dt className="text-muted-foreground">{t("fromQuote")}</dt>
              <dd>{NUMBERS.quote}</dd>
              <dt className="text-muted-foreground">{t("status")}</dt>
              <dd>{t("approved")}</dd>
            </>
          )}
        </dl>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-6">
        <Party label={t("seller")} name="Al Bustan Trading LLC" place="Ruwi, Muscat" vatin={t("vatin", { n: "OM1100274519" })} />
        <Party label={t("buyer")} name="Sohar Logistics SAOC" place="Sohar Industrial Port" vatin={t("vatin", { n: "OM1100388106" })} />
      </div>

      <table className="mt-6 w-full text-sm">
        <thead className="text-muted-foreground">
          <tr className="bg-muted">
            <th scope="col" className="p-2 text-start font-medium">{t("product")}</th>
            <th scope="col" className="p-2 text-center font-medium">{t("qty")}</th>
            <th scope="col" className="hidden p-2 text-end font-medium sm:table-cell">{t("vat")}</th>
            <th scope="col" className="p-2 text-end font-medium">{t("total")}</th>
          </tr>
        </thead>
        <tbody>
          {r.lines.map((l, i) => {
            const item = t(`items.${l.id}`);
            return (
              <tr key={l.id} className="align-top">
                <td className="p-2">
                  <p className="font-medium">{item}</p>
                  <p className="text-xs text-muted-foreground">
                    <Money value={baisa(l.priceBaisa)} currency="OMR" />
                    {l.discountPct > 0 && <> · {t("discount", { pct: l.discountPct })}</>} · {t(`cat.${l.vat}`)}
                  </p>
                </td>
                <td className="p-2 text-center tabular-nums">
                  {live ? (
                    <span className="inline-flex items-center gap-1">
                      <Button variant="outline" size="icon-xs" aria-label={t("less", { item })} disabled={qty[i] <= 1} onClick={() => step(i, -1)}>
                        <MinusIcon aria-hidden />
                      </Button>
                      <output aria-live="polite" className="min-w-5">{qty[i]}</output>
                      <Button variant="outline" size="icon-xs" aria-label={t("more", { item })} disabled={qty[i] >= 99} onClick={() => step(i, 1)}>
                        <PlusIcon aria-hidden />
                      </Button>
                    </span>
                  ) : (
                    qty[i]
                  )}
                </td>
                <td className="hidden p-2 text-end sm:table-cell">
                  <Money value={baisa(l.vatAmount)} currency="OMR" />
                </td>
                <td className="p-2 text-end">
                  <Money value={baisa(l.total)} currency="OMR" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <dl className="ms-auto mt-4 grid w-full max-w-72 grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">{t("subTotal")}</dt>
        <dd className="text-end"><Money value={baisa(r.subTotal)} currency="OMR" /></dd>
        {r.summary.map((s) => (
          <div key={s.category} className="contents">
            <dt className="text-muted-foreground">{t("vatBase", { category: t(`cat.${s.category}`) })}</dt>
            <dd className="text-end"><Money value={baisa(s.base)} currency="OMR" /></dd>
          </div>
        ))}
        <dt className="text-muted-foreground">{t("vatTotal")}</dt>
        <dd className="text-end"><Money value={baisa(r.vatTotal)} currency="OMR" /></dd>
        <dt className="text-muted-foreground">{t("adjustment")}</dt>
        <dd className="text-end"><Money value={baisa(SAMPLE_ADJUSTMENT)} currency="OMR" /></dd>
        <dt className="mt-2 font-semibold">{t("grandTotal")}</dt>
        <dd className="mt-2 text-end font-semibold"><Money value={baisa(r.grandTotal)} currency="OMR" /></dd>
      </dl>
    </article>
  );
}

function Party({ label, name, place, vatin }: { label: string; name: string; place: string; vatin: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{name}</p>
      <p className="text-muted-foreground">{place}</p>
      <p className="text-muted-foreground tabular-nums">{vatin}</p>
    </div>
  );
}
