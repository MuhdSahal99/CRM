import { getRecord, listPipelines, listRelated, listRelatedLists, listTimeline, NotFound, withTenant } from "@crm/core";
import { ChevronLeftIcon, PencilIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { DocumentActions } from "@/components/documents/document-actions";
import { ConvertDialog } from "@/components/records/convert-dialog";
import { StageControl } from "@/components/deals/stage-control";
import { ActivityDialog } from "@/components/records/activity-dialog";
import { NewQuoteButton } from "@/components/quotes/new-quote-button";
import { QuoteLines } from "@/components/quotes/quote-lines";
import { RecordDetail } from "@/components/records/record-detail";
import { RelatedTabs } from "@/components/records/related-tabs";
import { Timeline, type TimelineItem } from "@/components/records/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isRecordModule, moduleMeta, type RecordData, recordTitle } from "@/lib/records";
import { requireContext } from "@/lib/session";

type Props = { params: Promise<{ module: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { module } = await params;
  const t = await getTranslations("records");
  return { title: isRecordModule(module) ? t(`singular.${module}`) : undefined };
}

// T2.13 (US-06): one record's fields by layout section, then its related lists as tabs.
export default async function RecordPage({ params }: Props) {
  const { module, id } = await params;
  if (!isRecordModule(module) || !z.uuid().safeParse(id).success) notFound();
  const ctx = await requireContext();
  const found = await withTenant(ctx, async (tx) => {
    try {
      const [record] = (await getRecord(tx, module, id)) as RecordData[];
      // shortcut: the first 200 related records per tab; add paging when an account outgrows it.
      const tabs = await Promise.all(
        listRelatedLists(module).map(async (r) => ({
          ...r,
          meta: await moduleMeta(tx, r.module),
          rows: (await listRelated(tx, module, id, r.api_name, { page: 1, per_page: 200 })).data as RecordData[],
        })),
      );
      // shortcut: the latest 50 events; add paging when a record's history outgrows it.
      const timeline = (await listTimeline(tx, module, id, { page: 1, per_page: 50 })).data as TimelineItem[];
      const pipeline = module === "Deals" ? ((await listPipelines(tx)) as { is_default: boolean; stages: { id: string; name_key: string; record_category: string }[] }[]).find((p) => p.is_default) : undefined;
      return { record: record!, meta: await moduleMeta(tx, module), tabs, timeline, stages: pipeline?.stages ?? [] };
    } catch (error) {
      if (error instanceof NotFound) return null; // missing, deleted or not visible: the same 404
      throw error;
    }
  });
  if (!found) notFound();
  const { record, meta, tabs, timeline, stages } = found;
  const t = await getTranslations();
  // Sales orders leave `created` and invoices leave `draft` through actions only; the server refuses edits then (409), so the button goes.
  const status = String((module === "Sales_Orders" || module === "Invoices" ? record.Status : undefined) ?? "");
  const locked = (module === "Sales_Orders" && status !== "created") || (module === "Invoices" && status !== "draft");
  const converted = module === "Leads" && record.Converted === true; // US-05 / AC-24: a converted lead is read-only

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/app/${module}`} className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:underline">
        <ChevronLeftIcon className="size-4 rtl:rotate-180" aria-hidden />
        {t(`modules.${module}`)}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">{recordTitle(meta, record)}</h1>
        <div className="flex flex-wrap gap-2">
          {(module === "Accounts" || module === "Contacts") && <ActivityDialog module={module} id={id} />}
          {module === "Deals" && Boolean(record.Account_Name) && <NewQuoteButton dealId={id} dealName={recordTitle(meta, record)} accountId={(record.Account_Name as { id: string }).id} />}
          {(module === "Quotes" || module === "Sales_Orders" || module === "Invoices") && <DocumentActions module={module} id={id} status={status} isAdmin={ctx.role === "admin"} />}
          {converted && <Badge variant="secondary">{t("records.converted")}</Badge>}
          {module === "Leads" && !converted && <ConvertDialog id={id} company={String(record.Company ?? "")} name={recordTitle(meta, record)} />}
          {!converted && !locked && (module !== "Products" || ctx.role === "admin") && (
            <Button asChild variant="outline">
              <Link href={`/app/${module}/${id}/edit`}>
                <PencilIcon aria-hidden />
                {t("records.edit")}
              </Link>
            </Button>
          )}
        </div>
      </div>
      {module === "Deals" && stages.length > 0 && (
        <StageControl
          id={id}
          version={record.version}
          stageId={(record.Stage as { id: string } | null)?.id ?? ""}
          stages={stages}
          reasons={meta.fields.find((f) => f.api_name === "Reason_For_Loss")?.picklist_values ?? []}
        />
      )}
      <RecordDetail sections={meta.sections} record={record} />
      {(module === "Quotes" || module === "Sales_Orders" || module === "Invoices") && <QuoteLines record={record} />}
      <RelatedTabs module={module} id={id} tabs={tabs} />
      <Timeline items={timeline} fields={meta.fields} />
    </div>
  );
}
