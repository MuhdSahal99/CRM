import { getRecord, NotFound, withTenant } from "@crm/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { RecordForm } from "@/components/records/record-form";
import { isRecordModule, lookupOptions, moduleMeta, type RecordData, recordTitle } from "@/lib/records";
import { requireContext } from "@/lib/session";

type Props = { params: Promise<{ module: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { module } = await params;
  const t = await getTranslations("records");
  return { title: isRecordModule(module) ? t("editTitle", { name: t(`singular.${module}`) }) : undefined };
}

// T2.12: edit at the loaded version; a concurrent change answers 409 and the form says so.
export default async function EditRecordPage({ params }: Props) {
  const { module, id } = await params;
  if (!isRecordModule(module) || !z.uuid().safeParse(id).success) notFound();
  const ctx = await requireContext();
  const found = await withTenant(ctx, async (tx) => {
    try {
      const [record] = (await getRecord(tx, module, id)) as RecordData[];
      const meta = await moduleMeta(tx, module);
      return { record: record!, meta, options: await lookupOptions(tx, ctx, meta) };
    } catch (error) {
      if (error instanceof NotFound) return null; // missing, deleted or not visible: the same 404
      throw error;
    }
  });
  if (!found) notFound();
  const t = await getTranslations("records");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("editTitle", { name: recordTitle(found.meta, found.record) })}</h1>
      <RecordForm module={module} sections={found.meta.sections} options={found.options} record={found.record} />
    </div>
  );
}
