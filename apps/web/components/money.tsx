import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { formatMoney, type Currency } from "@/lib/format";

/**
 * Server-computed amount. <bdi> keeps "OMR 1,234.500" in LTR order inside RTL text.
 * Align on the parent (text-end), not here: the bdi itself resolves to LTR.
 */
export function Money({ value, currency, className }: { value: string; currency: Currency; className?: string }) {
  const locale = useLocale();
  return <bdi className={cn("tabular-nums whitespace-nowrap", className)}>{formatMoney(value, currency, locale)}</bdi>;
}
