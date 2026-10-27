import { getKanban, listPipelines, withTenant } from "@crm/core";
import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DealsBoard } from "@/components/deals/deals-board";
import type { KanbanColumn } from "@/components/patterns/kanban";
import { moduleMeta } from "@/lib/records";
import { requireContext } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("deals"))("board") };
}

type Pipeline = { id: string; stages: { id: string; record_category: string }[] };
type Card = { id: string; version: number; Deal_Name: string; Account_Name: { name: string | null } | null; Amount?: string | null };

// T5.08 (US-07): the default pipeline as columns. The totals are computed by the server (getKanban), never here.
export default async function DealsBoardPage() {
  const ctx = await requireContext();
  const t = await getTranslations();
  const data = await withTenant(ctx, async (tx) => {
    const pipeline = ((await listPipelines(tx)) as (Pipeline & { is_default: boolean })[]).find((p) => p.is_default);
    if (!pipeline) return null;
    return { pipeline, columns: await getKanban(tx, { pipeline_id: pipeline.id, per_column: 25 }), meta: await moduleMeta(tx, "Deals") };
  });
  const columns: KanbanColumn[] = (data?.columns ?? []).map((c) => ({
    id: c.stage.id,
    title: t(c.stage.name_key),
    count: c.count,
    totalOmr: c.sum_amount_omr,
    cards: (c.deals as Card[]).map((d) => ({ id: d.id, title: d.Deal_Name, subtitle: d.Account_Name?.name ?? "", amount: d.Amount ?? null, currency: "OMR" as const, href: `/app/Deals/${d.id}` })),
  }));
  const versions = Object.fromEntries((data?.columns ?? []).flatMap((c) => (c.deals as Card[]).map((d) => [d.id, d.version])));
  const reasons = data?.meta.fields.find((f) => f.api_name === "Reason_For_Loss")?.picklist_values ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/Deals" className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:underline">
        <ChevronLeftIcon className="size-4 rtl:rotate-180" aria-hidden />
        {t("modules.Deals")}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">{t("deals.board")}</h1>
      {data ? <DealsBoard columns={columns} stages={data.pipeline.stages} versions={versions} reasons={reasons} /> : <p>{t("deals.noPipeline")}</p>}
    </div>
  );
}
