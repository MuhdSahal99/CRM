import { getRecord, listRecords, NotFound, withTenant } from "@crm/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { BanknoteIcon, ListIcon, PercentIcon } from "lucide-react";
import { Money } from "@/components/money";
import { BackLink } from "@/components/patterns/back-link";
import { MotionScope } from "@/components/patterns/motion-scope";
import { PageHeader } from "@/components/patterns/page-header";
import { StatChip } from "@/components/ui/status";
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
  const t = await getTranslations();
  const q = found.quote;
  const stats = (
    <>
      <StatChip icon={<BanknoteIcon />} value={<Money value={q.Grand_Total} currency={q.Currency} />} label={t("screens.detail.total")} />
      <StatChip icon={<PercentIcon />} value={<Money value={q.VAT_Total} currency={q.Currency} />} label={t("screens.detail.vat")} />
      <StatChip icon={<ListIcon />} value={<span data-count="number" data-to={q.Line_Items.length}>{q.Line_Items.length}</span>} label={t("screens.detail.lines")} />
    </>
  );
  return (
    <div className="flex flex-col gap-6">
      <BackLink href={`/app/Quotes/${id}`}>{q.Subject}</BackLink>
      <PageHeader title={[t("screens.form.edit"), q.Subject]} stats={stats} />
      <MotionScope className="grid grid-cols-1 gap-(--gap)">
        <QuoteEditor quote={q} products={found.products} />
      </MotionScope>
    </div>
  );
}
