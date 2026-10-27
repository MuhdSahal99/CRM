import { ListRecordsInput, listRecords, withTenant } from "@crm/core";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { RecordList } from "@/components/records/record-list";
import { Button } from "@/components/ui/button";
import { isRecordModule, moduleMeta, type RecordData } from "@/lib/records";
import { requireContext } from "@/lib/session";

type Props = { params: Promise<{ module: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { module } = await params;
  const t = await getTranslations();
  return { title: isRecordModule(module) ? t(`modules.${module}`) : undefined };
}

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{label}</h1>
        {module === "Leads" && (
          <Button asChild variant="link" className="me-auto">
            <Link href={input.cvid === "converted" ? "/app/Leads" : "/app/Leads?cvid=converted"}>{t(input.cvid === "converted" ? "records.allLeads" : "records.convertedLeads")}</Link>
          </Button>
        )}
        {module === "Deals" && (
          <Button asChild variant="link" className="me-auto">
            <Link href="/app/Deals/board">{t("deals.boardLink")}</Link>
          </Button>
        )}
        <Button asChild>
          <Link href={`/app/${module}/new`}>
            <PlusIcon aria-hidden />
            {t("records.new")}
          </Link>
        </Button>
      </div>
      <RecordList module={module} meta={meta} rows={page.data as RecordData[]} caption={label} emptyText={t("records.empty", { module: label.toLowerCase() })} />
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
    </div>
  );
}
