import { listRecords, withTenant } from "@crm/core";
import { AlertCircleIcon, CalendarCheckIcon, ListChecksIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/patterns/page-header";
import { MyActivities } from "@/components/records/my-activities";
import { Button } from "@/components/ui/button";
import { StatChip } from "@/components/ui/status";
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
  const rows = page.data as RecordData[];
  const overdue = rows.filter((r) => r.Is_Overdue).length;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Muscat" }).format(new Date()); // a due date is a business date (listMyTasks)
  const dueToday = rows.filter((r) => r.Due_Date === today).length;
  const stats = (
    <>
      <StatChip icon={<ListChecksIcon />} value={<span data-count="number" data-to={rows.length}>{rows.length}</span>} label={t("statOpen")} />
      <StatChip icon={<CalendarCheckIcon />} value={<span data-count="number" data-to={dueToday}>{dueToday}</span>} label={t("statToday")} />
      <StatChip icon={<AlertCircleIcon />} value={<span data-count="number" data-to={overdue}>{overdue}</span>} label={t("overdue")} />
    </>
  );
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={[t("title1"), t("title2")]}
        stats={stats}
        actions={
          <Button asChild>
            <Link href="/app/Tasks/new">
              <PlusIcon aria-hidden />
              {t("newTask")}
            </Link>
          </Button>
        }
      />
      <MyActivities rows={rows} fields={meta.fields} />
    </div>
  );
}
