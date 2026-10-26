// Marketing demo only. The CRM itself prices on the server (ADR-0007); this mirrors its per-line rules
// in integer baisa so the sample invoice stays exact without decimal.js on a public page.
export type VatCategory = "standard" | "zero_rated" | "exempt";
export type DemoLine = { id: "a" | "b" | "c"; qty: number; priceBaisa: number; discountPct: number; vat: VatCategory };

const STANDARD_RATE = 5;
// Half-up for the non-negative amounts used here; n * pct / 100 is exact whenever it ends in .5.
const pctOf = (n: number, pct: number) => Math.round((n * pct) / 100);

export function priceLines(lines: DemoLine[], adjustmentBaisa: number) {
  const priced = lines.map((l) => {
    const amount = l.qty * l.priceBaisa;
    const net = amount - pctOf(amount, l.discountPct);
    const vatAmount = l.vat === "standard" ? pctOf(net, STANDARD_RATE) : 0;
    return { ...l, net, vatAmount, total: net + vatAmount };
  });
  const subTotal = priced.reduce((s, l) => s + l.net, 0);
  const vatTotal = priced.reduce((s, l) => s + l.vatAmount, 0);
  const summary = (["standard", "zero_rated", "exempt"] as const).map((category) => ({
    category,
    base: priced.filter((l) => l.vat === category).reduce((s, l) => s + l.net, 0),
    vat: priced.filter((l) => l.vat === category).reduce((s, l) => s + l.vatAmount, 0),
  }));
  return { lines: priced, subTotal, vatTotal, summary, grandTotal: subTotal + vatTotal + adjustmentBaisa };
}

/** Integer baisa → the decimal string formatMoney expects ("-0.190", "358.000"). */
export function baisa(n: number): string {
  const abs = Math.abs(n);
  return `${n < 0 ? "-" : ""}${Math.trunc(abs / 1000)}.${String(abs % 1000).padStart(3, "0")}`;
}

// PRD US-10 worked example.
export const SAMPLE_LINES: DemoLine[] = [
  { id: "a", qty: 3, priceBaisa: 100_000, discountPct: 10, vat: "standard" },
  { id: "b", qty: 1, priceBaisa: 50_000, discountPct: 0, vat: "zero_rated" },
  { id: "c", qty: 2, priceBaisa: 12_345, discountPct: 0, vat: "exempt" },
];
export const SAMPLE_ADJUSTMENT = -190;
