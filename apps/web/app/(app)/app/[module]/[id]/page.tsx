import { getRecord, isDocModule, listPipelines, listShareLinks, listRelated, listRelatedLists, listTimeline, NotFound, withTenant } from "@crm/core";
import { BanknoteIcon, ClockIcon, PencilIcon, UserRoundIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { z } from "zod";
import { DocumentActions } from "@/components/documents/document-actions";
import { ConvertDialog } from "@/components/records/convert-dialog";
import { StageControl } from "@/components/deals/stage-control";
import { ActivityDialog } from "@/components/records/activity-dialog";
import { NewQuoteButton } from "@/components/quotes/new-quote-button";
import { QuoteLines } from "@/components/quotes/quote-lines";
import { RecordDetail } from "@/components/records/record-detail";
import { EmailsList, type EmailRow } from "@/components/records/emails-list";
import { SendEmailDialog, type MailContact } from "@/components/records/send-email-dialog";
import { ShareLinksList, type ShareLinkRow } from "@/components/records/share-links-list";
import { WhatsAppButton, type WhatsAppContact } from "@/components/records/whatsapp-button";
import { RelatedTabs } from "@/components/records/related-tabs";
import { Timeline, type TimelineItem } from "@/components/records/timeline";
import { Money } from "@/components/money";
import { BackLink } from "@/components/patterns/back-link";
import { MotionScope } from "@/components/patterns/motion-scope";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { StatChip, StatusPill } from "@/components/ui/status";
import type { Currency } from "@/lib/format";
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
      // US-13: a quote, sales order or invoice lists its emails and offers the account's contacts as recipients.
      let mail: { emails: EmailRow[]; contacts: MailContact[]; people: WhatsAppContact[]; links: ShareLinkRow[] } | undefined;
      if (isDocModule(module)) {
        const accountId = (record!.Account_Name as { id: string } | null)?.id;
        const people = accountId ? ((await listRelated(tx, "Accounts", accountId, "Contacts", { page: 1, per_page: 200 })).data as RecordData[]) : [];
        mail = {
          emails: (await listRelated(tx, module, id, "Emails", { page: 1, per_page: 50 })).data as EmailRow[],
          contacts: people.map((c) => ({ id: c.id, name: [c.First_Name, c.Last_Name].filter(Boolean).join(" "), email: (c.Email as string | null) ?? null })),
          people: people.map((c) => ({ id: c.id, name: [c.First_Name, c.Last_Name].filter(Boolean).join(" "), mobile: (c.Mobile as string | null) ?? null })),
          links: (await listShareLinks(tx, module, id)).data as ShareLinkRow[],
        };
      }
      return { record: record!, meta: await moduleMeta(tx, module), tabs, timeline, stages: pipeline?.stages ?? [], mail };
    } catch (error) {
      if (error instanceof NotFound) return null; // missing, deleted or not visible: the same 404
      throw error;
    }
  });
  if (!found) notFound();
  const { record, meta, tabs, timeline, stages, mail } = found;
  const t = await getTranslations();
  // Sales orders leave `created` and invoices leave `draft` through actions only; the server refuses edits then (409), so the button goes.
  const status = String((module === "Sales_Orders" || module === "Invoices" ? record.Status : undefined) ?? "");
  const locked = (module === "Sales_Orders" && status !== "created") || (module === "Invoices" && status !== "draft");
  const converted = module === "Leads" && record.Converted === true; // US-05 / AC-24: a converted lead is read-only

  const title = recordTitle(meta, record);
  const fmt = await getFormatter();
  const owner = (record.Owner as { name: string | null } | null | undefined)?.name;
  const modified = typeof record.Modified_Time === "string" ? record.Modified_Time : null;
  const amount = module === "Deals" ? record.Amount : record.Grand_Total;
  const currency = (record.Currency ?? "OMR") as Currency;
  // Figures are the record own fields; nothing is derived here.
  const stats = (
    <>
      {typeof amount === "string" && <StatChip icon={<BanknoteIcon />} value={<Money value={amount} currency={currency} />} label={t(module === "Deals" ? "screens.detail.amount" : "screens.detail.total")} />}
      {owner && <StatChip icon={<UserRoundIcon />} value={<span className="text-base">{owner}</span>} label={t("screens.detail.owner")} />}
      {modified && <StatChip icon={<ClockIcon />} value={<span className="text-base">{fmt.dateTime(new Date(modified), { dateStyle: "medium" })}</span>} label={t("screens.detail.updated")} />}
    </>
  );
  const isDoc = module === "Quotes" || module === "Sales_Orders" || module === "Invoices";
  const actions = (
    <>
      {(module === "Accounts" || module === "Contacts") && <ActivityDialog module={module} id={id} />}
      {module === "Deals" && Boolean(record.Account_Name) && <NewQuoteButton dealId={id} dealName={title} accountId={(record.Account_Name as { id: string }).id} />}
      {mail && !(module === "Invoices" && status === "draft") && <SendEmailDialog module={module} id={id} contacts={mail.contacts} defaultSubject={title} />}
      {isDoc && <DocumentActions module={module} id={id} status={status} isAdmin={ctx.role === "admin"} />}
      {mail && !(module === "Invoices" && status === "draft") && <WhatsAppButton module={module} id={id} contacts={mail.people} title={title} />}
      {converted && <StatusPill tone="ink">{t("records.converted")}</StatusPill>}
      {module === "Leads" && !converted && <ConvertDialog id={id} company={String(record.Company ?? "")} name={title} />}
      {!converted && !locked && (module !== "Products" || ctx.role === "admin") && (
        <Button asChild variant={isDoc || module === "Leads" ? "outline" : "default"}>
          <Link href={`/app/${module}/${id}/edit`}>
            <PencilIcon aria-hidden />
            {t("records.edit")}
          </Link>
        </Button>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <BackLink href={`/app/${module}`}>{t(`modules.${module}`)}</BackLink>
      <PageHeader title={[t(`records.singular.${module}`), title]} stats={stats} actions={actions} />
      <MotionScope className="grid grid-cols-1 gap-(--gap) xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-(--gap) xl:col-span-8">
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
          {isDoc && <QuoteLines record={record} />}
          <RelatedTabs module={module} id={id} tabs={tabs} />
        </div>
        <div className="flex min-w-0 flex-col gap-(--gap) xl:col-span-4">
          <Timeline items={timeline} fields={meta.fields} />
          {mail && <ShareLinksList module={module} id={id} links={mail.links} />}
          {mail && <EmailsList rows={mail.emails} />}
        </div>
      </MotionScope>
    </div>
  );
}
