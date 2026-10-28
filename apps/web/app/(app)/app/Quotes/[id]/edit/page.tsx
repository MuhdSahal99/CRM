import { getRecord, listRecords, NotFound, withTenant } from "@crm/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { PickerProduct } from "@/components/quotes/product-picker";
import { type QuoteData, QuoteEditor } from "@/components/quotes/quote-editor";
import { requireContext } from "@/lib/session";

export const metadata: Metadata = { title: "Quote lines" };

// T7.08 (US-10): the quote's lines and adjustment. The server prices every save; this page never computes a total.
export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireContext();
  const found = await withTenant(ctx, async (tx) => {
    try {
      const [quote] = (await getRecord(tx, "Quotes", id)) as unknown as QuoteData[];
      if (!quote?.Line_Items) return null; // a role that cannot see the totals cannot edit the lines
      // shortcut: the 200 most recently changed products; swap in a search box when the catalogue outgrows it.
      const list = (await listRecords(tx, ctx, "Products", { page: 1, per_page: 200, sort_order: "desc" })).data as unknown as Record<string, string | boolean>[];
      const products: PickerProduct[] = list
        .filter((p) => p.Product_Active)
        .map((p) => ({ id: p.id as string, name: p.Product_Name as string, unitPrice: p.Unit_Price as string, vatCategory: p.VAT_Category as PickerProduct["vatCategory"] }));
      return { quote, products };
    } catch (error) {
      if (error instanceof NotFound) return null;
      throw error;
    }
  });
  if (!found) notFound();
  const t = await getTranslations("records");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight break-words">{t("editTitle", { name: found.quote.Subject })}</h1>
      <QuoteEditor quote={found.quote} products={found.products} />
    </div>
  );
}
