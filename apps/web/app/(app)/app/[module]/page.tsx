import { ListRecordsInput, listRecords, withTenant } from "@crm/core";
import { CalendarPlusIcon, ChevronLeftIcon, ChevronRightIcon, ListIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MotionScope } from "@/components/patterns/motion-scope";
import { PageHeader } from "@/components/patterns/page-header";
import { RecordList } from "@/components/records/record-list";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { StatChip } from "@/components/ui/status";
import { isRecordModule, moduleMeta, type RecordData } from "@/lib/records";
import { requireContext } from "@/lib/session";

type Props = { params: Promise<{ module: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { module } = await params;
  const t = await getTranslations();
  return { title: isRecordModule(module) ? t(`modules.${module}`) : undefined };
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// T2.11: any registered module's list, newest first, paged with links (works without JavaScript).
export default async function RecordListPage({ params, searchParams }: Props) {
  const { module } = await params;
  if (!isRecordModule(module)) notFound();
  const ctx = await requireContext();
  const query = ListRecordsInput.safeParse(await searchParams);
  const input = query.success ? query.data : ListRecordsInput.parse({});
  const { meta, page } = await withTenant(ctx, async (tx) => ({ meta: await moduleMeta(tx, module), page: await listRecords(tx, ctx, module, input) }));
  const t = await getTranslations();
  const label = t(`modules.${module}`);
  const href = (n: number) => `/app/${module}?page=${n}${input.per_page === 20 ? "" : `&per_page=${input.per_page}`}${input.cvid === "converted" ? "&cvid=converted" : ""}`;

  // The figures are the loaded page's own: the list API returns no total, so they say "on this page".
  const rows = page.data as RecordData[];
  const now = new Date().getTime();
  const recent = rows.filter((r) => typeof r.Created_Time === "string" && now - new Date(r.Created_Time).getTime() < WEEK_MS).length;
  const hasCreated = rows.some((r) => typeof r.Created_Time === "string");

  const stats = (
    <>
      <StatChip icon={<ListIcon />} value={<span data-count="number" data-to={rows.length}>{rows.length}</span>} label={t("records.statOnPage")} />
      {hasCreated && <StatChip icon={<CalendarPlusIcon />} value={<span data-count="number" data-to={recent}>{recent}</span>} label={t("records.statRecent")} />}
    </>
  );
  const actions = (
    <>
      {module === "Leads" && (
        <Button asChild variant="secondary">
          <Link href={input.cvid === "converted" ? "/app/Leads" : "/app/Leads?cvid=converted"}>{t(input.cvid === "converted" ? "records.allLeads" : "records.convertedLeads")}</Link>
        </Button>
      )}
      {module === "Deals" && (
        <Button asChild variant="secondary">
          <Link href="/app/Deals/board">{t("deals.boardLink")}</Link>
        </Button>
      )}
      {(module !== "Products" || ctx.role === "admin") && ( // US-08: Products are read-only for everyone but an Admin
        <Button asChild>
          <Link href={`/app/${module}/new`}>
            <PlusIcon aria-hidden />
            {t("records.new")}
          </Link>
        </Button>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={[label, t.has(`lists.${module}`) ? t(`lists.${module}`) : t("lists.fallback")]} stats={stats} actions={actions} />
      <MotionScope className="grid grid-cols-1 gap-(--gap)">
        <GlassCard title={label} subtitle={t("records.pageCaption", { page: input.page, count: rows.length })}>
          <RecordList browse module={module} meta={meta} rows={rows} caption={label} emptyText={t("records.empty", { module: label.toLowerCase() })} />
          {(input.page > 1 || page.info.more_records) && (
            <nav aria-label={t("records.pagination")} className="flex items-center justify-between gap-3">
              {input.page > 1 ? (
                <Button asChild variant="outline">
                  <Link href={href(input.page - 1)}>
                    <ChevronLeftIcon className="rtl:rotate-180" aria-hidden />
                    {t("records.previous")}
                  </Link>
                </Button>
              ) : <span />}
              {page.info.more_records && (
                <Button asChild variant="outline">
                  <Link href={href(input.page + 1)}>
                    {t("records.next")}
                    <ChevronRightIcon className="rtl:rotate-180" aria-hidden />
                  </Link>
                </Button>
              )}
            </nav>
          )}
        </GlassCard>
      </MotionScope>
    </div>
  );
}
