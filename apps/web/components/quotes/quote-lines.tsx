import { getTranslations } from "next-intl/server";
import { Money } from "@/components/money";
import type { Currency } from "@/lib/format";

type L = { id: string; Product: { name: string | null }; Quantity: string; List_Price: string; Total: string };

/** Read-only lines of a quote on its detail page; amounts are the server's. Absent when the role cannot see the totals. */
export async function QuoteLines({ record }: { record: Record<string, unknown> }) {
  const lines = record.Line_Items as L[] | undefined;
  if (!lines) return null;
  const t = await getTranslations("lineItems");
  const currency = record.Currency as Currency;
  return (
    <section aria-labelledby="quote-lines" className="flex flex-col gap-2">
      <h2 id="quote-lines" className="text-lg font-medium">
        {t("title")}
      </h2>
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {lines.map((l) => (
            <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-3">
              <span className="font-medium">{l.Product.name}</span>
              <span className="text-sm text-muted-foreground">
                {l.Quantity.replace(/\.?0+$/, "")} × <Money value={l.List_Price} currency={currency} />
              </span>
              <Money value={l.Total} currency={currency} className="font-medium" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
