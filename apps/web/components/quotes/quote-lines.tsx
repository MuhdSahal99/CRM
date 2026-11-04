import { ReceiptTextIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Money } from "@/components/money";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassCard, Tile } from "@/components/ui/glass-card";
import type { Currency } from "@/lib/format";

type L = { id: string; Product: { name: string | null }; Quantity: string; List_Price: string; Total: string };

/** Read-only lines of a quote on its detail page; amounts are the server's. Absent when the role cannot see the totals. */
export async function QuoteLines({ record }: { record: Record<string, unknown> }) {
  const lines = record.Line_Items as L[] | undefined;
  if (!lines) return null;
  const t = await getTranslations("lineItems");
  const currency = record.Currency as Currency;
  return (
    <GlassCard title={t("title")} aria-label={t("title")}>
      {lines.length === 0 ? (
        <EmptyState icon={<ReceiptTextIcon />} title={t("empty")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {lines.map((l) => (
            <li key={l.id}>
              <Tile className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-3">
                <span className="font-medium">{l.Product.name}</span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {l.Quantity.replace(/\.?0+$/, "")} × <Money value={l.List_Price} currency={currency} />
                </span>
                <Money value={l.Total} currency={currency} className="font-semibold" />
              </Tile>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
