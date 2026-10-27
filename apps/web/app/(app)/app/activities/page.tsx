import { listRecords, withTenant } from "@crm/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MyActivities } from "@/components/records/my-activities";
import { moduleMeta, type RecordData } from "@/lib/records";
import { requireContext } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("activities");
  return { title: t("title") };
}

// T3.07 (US-15): my open tasks with the overdue ones flagged. shortcut: the first 200; page it when someone has more open tasks.
export default async function ActivitiesPage() {
  const ctx = await requireContext();
  const { meta, page } = await withTenant(ctx, async (tx) => ({
    meta: await moduleMeta(tx, "Tasks"),
    page: await listRecords(tx, ctx, "Tasks", { page: 1, per_page: 200, sort_order: "desc", cvid: "my_open" }),
  }));
  const t = await getTranslations("activities");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <MyActivities rows={page.data as RecordData[]} fields={meta.fields} />
    </div>
  );
}
