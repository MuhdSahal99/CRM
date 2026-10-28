"use client";

import { Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { type Line, LineItemGrid } from "@/components/patterns/line-item-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callApi } from "@/lib/api-client";
import type { Currency } from "@/lib/format";
import { type PickerProduct, ProductPicker } from "./product-picker";

type ApiLine = {
  id: string;
  Product: { id: string; name: string | null };
  Quantity: string;
  List_Price: string;
  Discount: { type: string; value: string } | null;
  VAT_Category: Line["vatCategory"];
  VAT_Rate: string | null;
  VAT_Amount: string;
  Total: string;
};
export type QuoteData = {
  id: string;
  version: number;
  Subject: string;
  Currency: Currency;
  Adjustment: string;
  Sub_Total: string;
  VAT_Total: string;
  Grand_Total: string;
  VAT_Total_OMR: string;
  Line_Items: ApiLine[];
  VAT_Summary: { VAT_Category: Line["vatCategory"]; Base: string; VAT: string }[];
};
type Row = Line & { productId: string };
type Field = "quantity" | "listPrice" | "discountPercent";

const trim = (n: string) => (n.includes(".") ? n.replace(/\.?0+$/, "") : n);
const rowOf = (l: ApiLine): Row => ({
  id: l.id,
  productId: l.Product.id,
  product: l.Product.name ?? "",
  vatCategory: l.VAT_Category,
  vatRate: l.VAT_Rate == null ? null : trim(l.VAT_Rate),
  quantity: trim(l.Quantity),
  listPrice: l.List_Price,
  discountPercent: l.Discount?.type === "percent" ? trim(l.Discount.value) : "",
  vatAmount: l.VAT_Amount,
  lineTotal: l.Total,
});

/**
 * T7.08 (US-10): edits a quote's lines. The browser sends quantities, prices and discounts only; every amount shown, the totals
 * included, is read back from the server after each save (ADR-0007), never computed here.
 */
export function QuoteEditor({ quote, products }: { quote: QuoteData; products: PickerProduct[] }) {
  const t = useTranslations("lineItems");
  const [data, setData] = useState(quote);
  const [rows, setRows] = useState<Row[]>(quote.Line_Items.map(rowOf));
  const [subject, setSubject] = useState(quote.Subject);
  const [adjustment, setAdjustment] = useState(quote.Adjustment);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  const change = (i: number, field: Field, value: string) => setRows((r) => r.map((row, j) => (j === i ? { ...row, [field]: value } : row)));
  const add = (p: PickerProduct) =>
    setRows((r) => [
      ...r,
      {
        id: crypto.randomUUID(),
        productId: p.id,
        product: p.name,
        vatCategory: p.vatCategory,
        vatRate: null,
        quantity: "1",
        listPrice: data.Currency === "OMR" ? p.unitPrice : "", // other currencies: the server converts the OMR price
        discountPercent: "",
        vatAmount: "0",
        lineTotal: "0",
      },
    ]);

  async function save() {
    setPending(true);
    setErrors({});
    setMessage(null);
    const Line_Items = rows.map((r) => ({
      Product: { id: r.productId },
      Quantity: r.quantity,
      ...(r.listPrice ? { List_Price: r.listPrice } : {}),
      Discount: r.discountPercent ? { type: "percent", value: r.discountPercent } : null,
    }));
    const { status, json } = await callApi("PUT", `/Quotes/${data.id}`, { data: [{ version: data.version, Subject: subject, Adjustment: adjustment || "0", Line_Items }] });
    if (status === 200) {
      const fresh = await callApi("GET", `/Quotes/${data.id}`);
      const q = fresh.json.data[0] as QuoteData;
      setData(q);
      setRows(q.Line_Items.map(rowOf));
      setAdjustment(q.Adjustment);
      setMessage({ kind: "ok", text: t("saved") });
    } else if (status === 422) {
      const list: { api_name?: string; message?: string }[] = json.details?.errors ?? [{ api_name: json.details?.api_name, message: json.message }];
      setErrors(Object.fromEntries(list.filter((e) => e.api_name).map((e) => [e.api_name!, e.message ?? ""])));
      setMessage({ kind: "error", text: list.some((e) => e.api_name) ? t("failed") : json.message });
    } else {
      setMessage({ kind: "error", text: status === 409 ? t("conflict") : t("failed") });
    }
    setPending(false);
  }

  const lines: Line[] = rows.map((r, i) => ({
    ...r,
    quantityError: errors[`Line_Items.${i}.Quantity`] ?? errors[`Line_Items.${i}.Product`],
    priceError: errors[`Line_Items.${i}.List_Price`],
    discountError: errors[`Line_Items.${i}.Discount`],
  }));

  return (
    <div className="flex flex-col gap-6" aria-busy={pending}>
      <div className="flex max-w-md flex-col gap-1.5">
        <Label htmlFor="quote-subject">{t("subject")}</Label>
        <Input id="quote-subject" value={subject} maxLength={255} onChange={(e) => setSubject(e.target.value)} />
      </div>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      <LineItemGrid
        lines={lines}
        currency={data.Currency}
        totals={{
          subTotal: data.Sub_Total,
          vatTotal: data.VAT_Total,
          adjustment: data.Adjustment,
          grandTotal: data.Grand_Total,
          vatTotalOmr: data.Currency === "OMR" ? undefined : data.VAT_Total_OMR,
          vatSummary: data.VAT_Summary.map((s) => ({ category: s.VAT_Category, rate: null, base: s.Base, vat: s.VAT_Category === "standard" ? s.VAT : null })),
        }}
        editor={{
          onChange: change,
          onRemove: (i) => setRows((r) => r.filter((_, j) => j !== i)),
          adjustment,
          onAdjustment: setAdjustment,
          adjustmentError: errors.Adjustment,
          add: <ProductPicker products={products} onPick={add} />,
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" aria-hidden />}
          {pending ? t("saving") : t("save")}
        </Button>
        {message && (
          <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
