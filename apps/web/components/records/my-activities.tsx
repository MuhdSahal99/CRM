"use client";

import { AlertCircleIcon, CalendarCheckIcon } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Calendar, type CalendarEvent } from "@/components/patterns/calendar";
import { MotionScope } from "@/components/patterns/motion-scope";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassCard, Tile } from "@/components/ui/glass-card";
import type { FieldMeta, RecordData } from "@/lib/records";
import { CompleteButton } from "./complete-button";
import { FieldValue } from "./field-value";

type Props = { rows: RecordData[]; fields: FieldMeta[] };

/** US-15: my open tasks on a month calendar (by due date) beside an agenda. Overdue is a coral section with text and an icon, never colour alone. */
export function MyActivities({ rows, fields }: Props) {
  const t = useTranslations();
  const format = useFormatter();
  const field = (api: string) => fields.find((f) => f.api_name === api);
  const due = field("Due_Date");
  const priority = field("Priority");

  const events: CalendarEvent[] = rows.flatMap((r) =>
    typeof r.Due_Date === "string" ? [{ id: r.id, date: r.Due_Date, title: String(r.Subject), tone: r.Is_Overdue ? ("coral" as const) : ("sky" as const) }] : [],
  );
  const overdue = rows.filter((r) => r.Is_Overdue);
  const upcoming = rows.filter((r) => !r.Is_Overdue);

  const row = (r: RecordData) => (
    <li key={r.id}>
      <Tile className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-3">
        <div className="min-w-0 flex-1">
          <Link href={`/app/Tasks/${r.id}`} className="block truncate text-sm font-medium hover:underline">
            {String(r.Subject)}
          </Link>
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {due && r.Due_Date ? <FieldValue field={due} value={r.Due_Date} /> : t("activities.noDueDate")}
            {priority && r.Priority ? (
              <>
                <span aria-hidden>·</span>
                <FieldValue field={priority} value={r.Priority} />
              </>
            ) : null}
          </p>
        </div>
        <CompleteButton id={r.id} version={r.version} subject={String(r.Subject)} />
      </Tile>
    </li>
  );

  return (
    <MotionScope className="grid grid-cols-1 gap-(--gap) xl:grid-cols-12">
      <div className="min-w-0 xl:col-span-8">
        <Calendar events={events} />
      </div>
      <div className="min-w-0 xl:col-span-4">
        <GlassCard title={t("activities.agenda")} subtitle={t("activities.agendaCaption", { count: rows.length, overdue: overdue.length })} aria-label={t("activities.list")}>
          {rows.length === 0 ? (
            <EmptyState icon={<CalendarCheckIcon />} title={t("activities.empty")} text={t("activities.emptyText")} />
          ) : (
            <>
              {overdue.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 border-b border-line pb-2 text-sm font-medium">
                    <AlertCircleIcon aria-hidden className="size-4 stroke-[1.6] text-coral" />
                    {t("activities.overdue")}
                    <span className="ms-auto grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1.5 text-[11px] font-semibold text-on-accent tabular-nums">{format.number(overdue.length)}</span>
                  </div>
                  <ul className="flex flex-col gap-2">{overdue.map(row)}</ul>
                </div>
              )}
              {upcoming.length > 0 && <ul className="flex flex-col gap-2">{upcoming.map(row)}</ul>}
            </>
          )}
        </GlassCard>
      </div>
    </MotionScope>
  );
}
