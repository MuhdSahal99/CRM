import { listVatRates, withTenant } from "@crm/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { type Column, DataTable } from "@/components/patterns/data-table";
import { requireContext } from "@/lib/session";
import { RateForm } from "../rate-form";

type Row = { id: string; category: string; rate: string; effective_from: string };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("vat.metaTitle") };
}

// T6.07 (US-08, Admin): VAT rates by category with their effective dates. Rates are append-only: a change is a new dated row.
export default async function VatPage() {
  const ctx = await requireContext();
  if (ctx.role !== "admin") notFound();
  const t = await getTranslations("settings");
  const rows = (await withTenant(ctx, listVatRates)) as Row[];
  const columns: Column<Row>[] = [
    { key: "category", header: t("vat.category"), cell: (r) => t(`vat.categories.${r.category}`) },
    { key: "rate", header: t("vat.rate"), numeric: true, cell: (r) => <bdi>{r.rate}</bdi> },
    { key: "from", header: t("effectiveFrom"), cell: (r) => <bdi>{r.effective_from}</bdi> },
  ];
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("vat.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("vat.help")}</p>
      <RateForm kind="vat" options={["standard", "zero_rated"]} />
      <DataTable caption={t("vat.caption")} columns={columns} rows={rows} rowKey={(r) => r.id} emptyText={t("vat.empty")} errorText={t("failed")} />
    </div>
  );
}
