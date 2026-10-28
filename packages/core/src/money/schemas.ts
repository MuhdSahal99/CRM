import { z } from "zod";

// T7.02 (ADR-0007): money and quantities enter the system only through these schemas, as decimal strings.
// A plain decimal format rules out "1e3", "NaN", "Infinity" and stray signs/whitespace.
export const Quantity = z.string().regex(/^\d{1,11}(\.\d{1,3})?$/, "Enter a quantity with up to 3 decimals.").refine((q) => Number(q) > 0, "Quantity must be above zero.");
export const Money = z.string().regex(/^\d{1,15}(\.\d{1,3})?$/, "Enter an amount with up to 3 decimals.");
export const SignedMoney = z.string().regex(/^-?\d{1,15}(\.\d{1,3})?$/, "Enter an amount with up to 3 decimals.");
export const Percent = z.string().regex(/^\d{1,3}(\.\d{1,4})?$/, "Enter a percentage with up to 4 decimals.");

/** AED/INR documents hold 2 dp: a value with more decimals than the currency scale is rejected, never silently rounded. */
export const fitsScale = (v: string, scale: number) => (v.split(".")[1]?.length ?? 0) <= scale;
