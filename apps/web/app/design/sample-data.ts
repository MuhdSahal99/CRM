// Sample records for the /design showcase only. Money values are what the server would return (decimal strings).
import type { Line, Totals } from "@/components/patterns/line-item-grid";
import type { Currency } from "@/lib/format";

export type Stage = "qualification" | "needs_analysis" | "proposal" | "negotiation" | "closed_won" | "closed_lost";
export type Deal = { id: string; name: string; account: string; stage: Stage; amount: string; currency: Currency; amountOmr: string; closing: string };

export const deals: Deal[] = [
  { id: "d1", name: "Muscat Port fit-out", account: "Al Bustan Trading LLC", stage: "proposal", amount: "10000.000", currency: "OMR", amountOmr: "10000.000", closing: "2026-11-30" },
  { id: "d2", name: "Sohar warehouse racking", account: "Sohar Logistics SAOC", stage: "qualification", amount: "4250.500", currency: "OMR", amountOmr: "4250.500", closing: "2026-12-15" },
  { id: "d3", name: "Dubai showroom lighting", account: "Gulf Lumen FZE", stage: "negotiation", amount: "38500.00", currency: "AED", amountOmr: "4042.500", closing: "2026-11-20" },
  { id: "d4", name: "Pune office AV", account: "Kaveri Systems Pvt Ltd", stage: "needs_analysis", amount: "1250000.00", currency: "INR", amountOmr: "5750.000", closing: "2027-01-10" },
  { id: "d5", name: "Nizwa clinic network", account: "Nizwa Health Services", stage: "closed_won", amount: "7800.000", currency: "OMR", amountOmr: "7800.000", closing: "2026-10-15" },
];

export const dealsAr: Deal[] = [
  { id: "a1", name: "تجهيز ميناء مسقط", account: "شركة البستان للتجارة", stage: "proposal", amount: "10000.000", currency: "OMR", amountOmr: "10000.000", closing: "2026-11-30" },
  { id: "a2", name: "رفوف مستودع صحار", account: "صحار للخدمات اللوجستية", stage: "qualification", amount: "4250.500", currency: "OMR", amountOmr: "4250.500", closing: "2026-12-15" },
  { id: "a3", name: "إضاءة معرض دبي", account: "الخليج للإنارة", stage: "negotiation", amount: "38500.00", currency: "AED", amountOmr: "4042.500", closing: "2026-11-20" },
];

export const arabicSample = "إجمالي الفاتورة 358.000 ريال عماني — شركة البستان للتجارة";

// PRD US-10 worked example. sub_total = Σ net (ADR-0007); grand = 344.690 + 13.500 − 0.190 = 358.000.
export const quoteLines: Line[] = [
  { id: "l1", product: "A · Network switch", vatCategory: "standard", vatRate: "5", quantity: "3", listPrice: "100.000", discountPercent: "10", vatAmount: "13.500", lineTotal: "283.500" },
  { id: "l2", product: "B · Export freight", vatCategory: "zero_rated", vatRate: null, quantity: "1", listPrice: "50.000", discountPercent: "", vatAmount: "0.000", lineTotal: "50.000" },
  { id: "l3", product: "C · Training session", vatCategory: "exempt", vatRate: null, quantity: "2", listPrice: "12.345", discountPercent: "", vatAmount: "0.000", lineTotal: "24.690" },
];

export const quoteTotals: Totals = {
  subTotal: "344.690",
  vatSummary: [
    { category: "standard", rate: "5", base: "270.000", vat: "13.500" },
    { category: "zero_rated", rate: null, base: "50.000", vat: "0.000" },
    { category: "exempt", rate: null, base: "24.690", vat: null },
  ],
  vatTotal: "13.500",
  adjustment: "-0.190",
  grandTotal: "358.000",
};

export const quoteLinesAr: Line[] = [
  { id: "r1", product: "مفتاح شبكة", vatCategory: "standard", vatRate: "5", quantity: "3", listPrice: "100.000", discountPercent: "10", vatAmount: "13.500", lineTotal: "283.500" },
  { id: "r2", product: "دورة تدريبية", vatCategory: "exempt", vatRate: null, quantity: "0", listPrice: "12.345", discountPercent: "", vatAmount: "0.000", lineTotal: "0.000" },
];

export const quoteTotalsAr: Totals = {
  subTotal: "270.000",
  vatSummary: [
    { category: "standard", rate: "5", base: "270.000", vat: "13.500" },
    { category: "exempt", rate: null, base: "0.000", vat: null },
  ],
  vatTotal: "13.500",
  adjustment: "0.000",
  grandTotal: "283.500",
};

/** [token, background var, foreground var, light ratio, dark ratio]. Ratios from DESIGN_SYSTEM.md § Color. */
export const colorPairs = [
  ["background / foreground", "--background", "--foreground", "17.05", "19.27"],
  ["card / card-foreground", "--card", "--card-foreground", "17.84", "17.05"],
  ["primary / primary-foreground", "--primary", "--primary-foreground", "8.84", "7.65"],
  ["muted / muted-foreground", "--muted", "--muted-foreground", "6.90", "5.58"],
  ["accent / accent-foreground", "--accent", "--accent-foreground", "8.53", "12.07"],
  ["highlight / highlight-foreground", "--highlight", "--highlight-foreground", "8.32", "9.40"],
  ["destructive on card", "--card", "--destructive", "6.42", "6.17"],
  ["success on card", "--card", "--success", "4.94", "10.05"],
  ["warning on card", "--card", "--warning", "5.05", "10.39"],
  ["info on card", "--card", "--info", "5.85", "8.17"],
] as const;

export const borderPairs = [
  ["input (control border)", "--input", "3.64", "3.74"],
  ["ring (focus)", "--ring", "5.26", "6.77"],
  ["border (divider, decorative)", "--border", "—", "—"],
] as const;

export const typeScale = [
  ["text-xs", "12/16"],
  ["text-sm", "14/20 · body"],
  ["text-base", "16/24"],
  ["text-lg", "18/28"],
  ["text-xl", "20/28"],
  ["text-2xl", "24/32"],
  ["text-3xl", "30/36"],
] as const;
