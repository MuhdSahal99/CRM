import { getKanban, listPipelines, withTenant } from "@crm/core";
import { LayersIcon, PlusIcon, TargetIcon, TrendingUpIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { DealsBoard } from "@/components/deals/deals-board";
import { Money } from "@/components/money";
import { BackLink } from "@/components/patterns/back-link";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassCard } from "@/components/ui/glass-card";
import { StatChip } from "@/components/ui/status";
import { formatPercent } from "@/lib/format";
import { sumOmr } from "@/lib/pipeline";
import type { KanbanColumn } from "@/components/patterns/kanban";
import type { Tone } from "@/components/ui/tone";
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
  const locale = await getLocale();
  const data = await withTenant(ctx, async (tx) => {
    const pipeline = ((await listPipelines(tx)) as (Pipeline & { is_default: boolean })[]).find((p) => p.is_default);
    if (!pipeline) return null;
    return { pipeline, columns: await getKanban(tx, { pipeline_id: pipeline.id, per_column: 25 }), meta: await moduleMeta(tx, "Deals") };
  });
  const category = new Map((data?.pipeline.stages ?? []).map((s) => [s.id, s.record_category]));
  // GLASS_SPEC 13: early stages sky, middle lime, Negotiation coral; Closed Won / Lost are the outcome rail.
  const toneOf = (key: string, i: number): Tone => (key.includes("negotiation") ? "coral" : i < 2 ? "sky" : "lime");
  const columns: KanbanColumn[] = (data?.columns ?? []).map((c, i) => ({
    id: c.stage.id,
    tone: toneOf(c.stage.name_key, i),
    outcome: category.get(c.stage.id) === "closed_won" ? "won" : category.get(c.stage.id) === "closed_lost" ? "lost" : undefined,
    title: t(c.stage.name_key),
    count: c.count,
    totalOmr: c.sum_amount_omr,
    cards: (c.deals as Card[]).map((d) => ({ id: d.id, title: d.Deal_Name, subtitle: d.Account_Name?.name ?? "", amount: d.Amount ?? null, currency: "OMR" as const, href: `/app/Deals/${d.id}` })),
  }));
  const versions = Object.fromEntries((data?.columns ?? []).flatMap((c) => (c.deals as Card[]).map((d) => [d.id, d.version])));
  const reasons = data?.meta.fields.find((f) => f.api_name === "Reason_For_Loss")?.picklist_values ?? [];

  // Header figures come from the same kanban read (server counts and sums), nothing extra is loaded.
  const all = data?.columns ?? [];
  const open = all.filter((c) => c.stage.record_category !== "closed_won" && c.stage.record_category !== "closed_lost");
  const openCount = open.reduce((n, c) => n + c.count, 0);
  const seesAmount = open.length > 0 && open.every((c) => c.sum_amount_omr !== null);
  const pipelineTotal = seesAmount ? sumOmr(open.map((c) => c.sum_amount_omr!)) : null;
  const countOf = (cat: string) => all.find((c) => c.stage.record_category === cat)?.count ?? 0;
  const closed = countOf("closed_won") + countOf("closed_lost");
  const winRate = closed ? (countOf("closed_won") / closed) * 100 : null;
  const stats = data && (
    <>
      <StatChip icon={<LayersIcon />} value={<span data-count="number" data-to={openCount}>{openCount}</span>} label={t("deals.statOpen")} />
      {pipelineTotal && <StatChip icon={<TrendingUpIcon />} value={<span data-count="currency" data-to={Number(pipelineTotal)} data-currency="OMR"><Money value={pipelineTotal} currency="OMR" /></span>} label={t("home.stats.pipeline")} />}
      <StatChip icon={<TargetIcon />} value={winRate === null ? t("records.noValue") : <span data-count="percent" data-to={winRate}>{formatPercent(winRate, locale)}</span>} label={t("home.stats.winRate")} />
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/app/Deals">{t("modules.Deals")}</BackLink>
      <PageHeader
        title={[t("deals.title1"), t("deals.title2")]}
        stats={stats}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/app/Deals">{t("deals.listLink")}</Link>
            </Button>
            <Button asChild>
              <Link href="/app/Deals/new">
                <PlusIcon aria-hidden />
                {t("records.new")}
              </Link>
            </Button>
          </>
        }
      />
      {data ? (
        <DealsBoard columns={columns} stages={data.pipeline.stages} versions={versions} reasons={reasons} />
      ) : (
        <GlassCard title={t("deals.board")}>
          <EmptyState icon={<LayersIcon />} title={t("deals.noPipeline")} />
        </GlassCard>
      )}
    </div>
  );
}
