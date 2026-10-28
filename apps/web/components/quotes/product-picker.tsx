"use client";

import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type PickerProduct = { id: string; name: string; unitPrice: string; vatCategory: "standard" | "zero_rated" | "exempt" };

/** Choosing a product appends a line; the control stays empty so the same product can be added again. */
export function ProductPicker({ products, onPick }: { products: PickerProduct[]; onPick: (product: PickerProduct) => void }) {
  const t = useTranslations("lineItems");
  return (
    <Select
      value=""
      onValueChange={(id) => {
        const p = products.find((x) => x.id === id);
        if (p) onPick(p);
      }}
    >
      <SelectTrigger aria-label={t("choose")} className="w-full sm:w-72">
        <SelectValue placeholder={t("choose")} />
      </SelectTrigger>
      <SelectContent>
        {products.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">{t("noProducts")}</p>}
        {products.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
