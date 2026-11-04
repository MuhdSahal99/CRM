import { listVatRates, withTenant } from "@crm/core";
import type { Metadata } from "next";
import { CalendarClockIcon, ListIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { type Column, DataTable } from "@/components/patterns/data-table";
import { MotionScope } from "@/components/patterns/motion-scope";
import { PageHeader } from "@/components/patterns/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { StatChip } from "@/components/ui/status";
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
  const latest = rows.map((r) => r.effective_from).sort().at(-1);
  const stats = (
    <>
      <StatChip icon={<ListIcon />} value={<span data-count="number" data-to={rows.length}>{rows.length}</span>} label={t("statRates")} />
      {latest && <StatChip icon={<CalendarClockIcon />} value={<span className="text-base"><bdi>{latest}</bdi></span>} label={t("statLatest")} />}
    </>
  );
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={[t("vat.title1"), t("vat.title2")]} stats={stats} />
      <p className="-mt-3 max-w-prose text-sm text-muted-foreground">{t("vat.help")}</p>
      <MotionScope className="grid grid-cols-1 items-start gap-(--gap) xl:grid-cols-12">
        <GlassCard title={t("addRate")} className="xl:col-span-4">
          <RateForm kind="vat" options={["standard", "zero_rated"]} />
        </GlassCard>
        <GlassCard title={t("vat.caption")} className="xl:col-span-8">
          <DataTable caption={t("vat.caption")} columns={columns} rows={rows} rowKey={(r) => r.id} emptyText={t("vat.empty")} errorText={t("failed")} />
        </GlassCard>
      </MotionScope>
    </div>
  );
}
