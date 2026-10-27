import { getRecord, listRelated, listRelatedLists, listTimeline, NotFound, withTenant } from "@crm/core";
import { ChevronLeftIcon, PencilIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { ActivityDialog } from "@/components/records/activity-dialog";
import { RecordDetail } from "@/components/records/record-detail";
import { RelatedTabs } from "@/components/records/related-tabs";
import { Timeline, type TimelineItem } from "@/components/records/timeline";
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
      return { record: record!, meta: await moduleMeta(tx, module), tabs, timeline };
    } catch (error) {
      if (error instanceof NotFound) return null; // missing, deleted or not visible: the same 404
      throw error;
    }
  });
  if (!found) notFound();
  const { record, meta, tabs, timeline } = found;
  const t = await getTranslations();

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
          <Button asChild variant="outline">
            <Link href={`/app/${module}/${id}/edit`}>
              <PencilIcon aria-hidden />
              {t("records.edit")}
            </Link>
          </Button>
        </div>
      </div>
      <RecordDetail sections={meta.sections} record={record} />
      <RelatedTabs module={module} id={id} tabs={tabs} />
      <Timeline items={timeline} fields={meta.fields} />
    </div>
  );
}
