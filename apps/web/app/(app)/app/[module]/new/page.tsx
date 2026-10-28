import { withTenant } from "@crm/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { RecordForm } from "@/components/records/record-form";
import { isRecordModule, lookupOptions, moduleMeta } from "@/lib/records";
import { requireContext } from "@/lib/session";

type Props = { params: Promise<{ module: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { module } = await params;
  const t = await getTranslations("records");
  return { title: isRecordModule(module) ? t("newTitle", { name: t(`singular.${module}`) }) : undefined };
}

// T2.12. A lookup can be prefilled from the query string, e.g. ?Account_Name=<id> from an account's Contacts tab.
export default async function NewRecordPage({ params, searchParams }: Props) {
  const { module } = await params;
  if (!isRecordModule(module)) notFound();
  const ctx = await requireContext();
  if (module === "Products" && ctx.role !== "admin") notFound(); // read-only for everyone but an Admin (US-08)
  const { meta, options } = await withTenant(ctx, async (tx) => {
    const meta = await moduleMeta(tx, module);
    return { meta, options: await lookupOptions(tx, ctx, meta) };
  });
  const query = await searchParams;
  const defaults = Object.fromEntries(
    meta.fields.filter((f) => f.data_type === "lookup" && z.uuid().safeParse(query[f.api_name]).success).map((f) => [f.api_name, query[f.api_name]!]),
  );
  const t = await getTranslations("records");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("newTitle", { name: t(`singular.${module}`) })}</h1>
      <RecordForm module={module} sections={meta.sections} options={options} defaults={defaults} />
    </div>
  );
}
