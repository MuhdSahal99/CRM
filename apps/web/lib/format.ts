// Scale per currency (ADR-0007). Moves to packages/core with the pricing engine in slice 1.
export const CURRENCY_SCALE = { OMR: 3, AED: 2, INR: 2 } as const;
export type Currency = keyof typeof CURRENCY_SCALE;

/**
 * Display-only formatting of a server-computed amount. `value` is the decimal string from the API
 * (never a JS number), so Intl formats it exactly. Latin digits in every locale.
 */
export function formatMoney(value: string, currency: Currency, locale: string): string {
  const scale = CURRENCY_SCALE[currency];
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "code",
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
    numberingSystem: "latn",
  }).format(value as Intl.StringNumericLiteral);
}
