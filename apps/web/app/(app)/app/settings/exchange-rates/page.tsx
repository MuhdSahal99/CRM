import { listExchangeRates, withTenant } from "@crm/core";
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

type Row = { id: string; currency: string; rate: string; effective_from: string; created_by: { name: string | null } };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("fx.metaTitle") };
}

// T6.07 (US-09, Admin): exchange-rate history (OMR per 1 unit); entering a rate adds a dated row.
export default async function ExchangeRatesPage() {
  const ctx = await requireContext();
  if (ctx.role !== "admin") notFound();
  const t = await getTranslations("settings");
  // shortcut: the latest 200 rates; add paging when the history outgrows it.
  const { data } = await withTenant(ctx, (tx) => listExchangeRates(tx, { page: 1, per_page: 200 }));
  const rows = data as Row[];
  const columns: Column<Row>[] = [
    { key: "currency", header: t("fx.currency"), cell: (r) => r.currency },
    { key: "rate", header: t("fx.rate"), numeric: true, cell: (r) => <bdi>{r.rate}</bdi> },
    { key: "from", header: t("effectiveFrom"), cell: (r) => <bdi>{r.effective_from}</bdi> },
    { key: "by", header: t("fx.enteredBy"), cell: (r) => r.created_by.name ?? "" },
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
      <PageHeader title={[t("fx.title1"), t("fx.title2")]} stats={stats} />
      <p className="-mt-3 max-w-prose text-sm text-muted-foreground">{t("fx.help")}</p>
      <MotionScope className="grid grid-cols-1 items-start gap-(--gap) xl:grid-cols-12">
        <GlassCard title={t("addRate")} className="xl:col-span-4">
          <RateForm kind="fx" options={["AED", "INR"]} />
        </GlassCard>
        <GlassCard title={t("fx.caption")} className="xl:col-span-8">
          <DataTable caption={t("fx.caption")} columns={columns} rows={rows} rowKey={(r) => r.id} emptyText={t("fx.empty")} errorText={t("failed")} />
        </GlassCard>
      </MotionScope>
    </div>
  );
}
