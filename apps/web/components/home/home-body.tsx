import { getKanban, listPipelines, listRecords, nameFieldsOf, withTenant } from "@crm/core";
import { AlertCircleIcon, BuildingIcon, CalendarCheckIcon, PlusIcon, TargetIcon, TrendingUpIcon, UserPlusIcon } from "lucide-react";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { RetryButton } from "@/components/home/retry-button";
import { Money } from "@/components/money";
import { Bars } from "@/components/patterns/charts";
import { MotionScope } from "@/components/patterns/motion-scope";
import { PageHeader } from "@/components/patterns/page-header";
import { CompleteButton } from "@/components/records/complete-button";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassCard, HeroNumber, Tile } from "@/components/ui/glass-card";
import { ProportionBar } from "@/components/ui/progress";
import { DeltaBadge, StatChip } from "@/components/ui/status";
import type { Tone } from "@/components/ui/tone";
import { type Currency, formatPercent } from "@/lib/format";
import type { RecordData } from "@/lib/records";
import { requireContext } from "@/lib/session";

type Deal = RecordData & { Deal_Name: string; Amount?: string | null; Currency?: string | null; Closing_Date?: string | null; Account_Name?: { name: string | null } | null; Owner?: { name: string | null } | null };

/** A section whose data fails to load shows an error state; it does not take the page down. */
async function safe<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch {
    return null;
  }
}

/** Σ of server-computed OMR totals (decimal strings, 3 places), added in thousandths so no float is involved. */
function sumOmr(totals: string[]): string {
  const n = totals.reduce((s, v) => s + BigInt(v.replace(".", "")), 0n);
  return `${n / 1000n}.${(n % 1000n).toString().padStart(3, "0")}`;
}

// GLASS_SPEC 13, same as the board: early stages sky, middle lime, Negotiation coral.
const toneOf = (key: string, i: number): Tone => (key.includes("negotiation") ? "coral" : i < 2 ? "sky" : "lime");
const HALF = "md:col-span-3 xl:col-span-6";

const RECENT: Record<"Leads" | "Accounts", { icon: ReactNode; sub: (r: RecordData) => string | null }> = {
  Leads: { icon: <UserPlusIcon />, sub: (r) => (typeof r.Company === "string" ? r.Company : null) },
  Accounts: { icon: <BuildingIcon />, sub: (r) => (typeof r.Industry === "string" ? r.Industry : null) },
};

const RECENT_MODULES = ["Leads", "Accounts"] as const;

export async function HomeBody() {
  const ctx = await requireContext();
  const t = await getTranslations("home");
  const tAll = await getTranslations();
  const fmt = await getFormatter();
  const locale = await getLocale();

  const [board, tasks, leads, accounts] = await Promise.all([
    safe(() =>
      withTenant(ctx, async (tx) => {
        const pipeline = ((await listPipelines(tx)) as { id: string; is_default: boolean }[]).find((p) => p.is_default);
        return pipeline ? await getKanban(tx, { pipeline_id: pipeline.id, per_column: 25 }) : [];
      }),
    ),
    safe(() => withTenant(ctx, (tx) => listRecords(tx, ctx, "Tasks", { page: 1, per_page: 50, sort_order: "desc", cvid: "my_open" }))),
    safe(() => withTenant(ctx, (tx) => listRecords(tx, ctx, "Leads", { page: 1, per_page: 5, sort_order: "desc", cvid: "recently_created" }))),
    safe(() => withTenant(ctx, (tx) => listRecords(tx, ctx, "Accounts", { page: 1, per_page: 5, sort_order: "desc", cvid: "recently_created" }))),
  ]);

  // Pipeline figures: counts and sums come from the server (getKanban), never from the client.
  const columns = board ?? [];
  const isClosed = (c: (typeof columns)[number]) => c.stage.record_category === "closed_won" || c.stage.record_category === "closed_lost";
  const open = columns.filter((c) => !isClosed(c));
  const openCount = open.reduce((n, c) => n + c.count, 0);
  const seesAmount = open.length > 0 && open.every((c) => c.sum_amount_omr !== null);
  const pipelineTotal = seesAmount ? sumOmr(open.map((c) => c.sum_amount_omr!)) : null;
  const countOf = (cat: string) => columns.find((c) => c.stage.record_category === cat)?.count ?? 0;
  const closed = countOf("closed_won") + countOf("closed_lost");
  const winRate = closed ? (countOf("closed_won") / closed) * 100 : null;

  // Tasks: a due date is a business date in Asia/Muscat (listMyTasks).
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Muscat" }).format(new Date());
  const taskRows = (tasks?.data ?? []) as RecordData[];
  const overdue = taskRows.filter((r) => r.Is_Overdue);
  const dueToday = taskRows.filter((r) => r.Due_Date === today);
  const agenda = [...overdue, ...dueToday].slice(0, 6);
  const day = fmt.dateTime(new Date(), { weekday: "long", month: "short", day: "numeric", timeZone: "Asia/Muscat" });
  const date = (v: string) => fmt.dateTime(new Date(`${v}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

  const error = (
    <div role="alert">
      <EmptyState icon={<AlertCircleIcon />} title={tAll("records.failed")} action={<RetryButton label={t("retry")} />} />
    </div>
  );

  const soon = open
    .flatMap((c) => (c.deals as unknown as Deal[]).map((d) => ({ d, stage: c.stage })))
    .sort((a, b) => (a.d.Closing_Date ?? "9999").localeCompare(b.d.Closing_Date ?? "9999"))
    .slice(0, 3);

  const stats = (
    <>
      {board &&
        (pipelineTotal ? (
          <StatChip
            icon={<TrendingUpIcon />}
            value={<span data-count="currency" data-to={Number(pipelineTotal)} data-currency="OMR"><Money value={pipelineTotal} currency="OMR" /></span>}
            label={t("stats.pipeline")}
          />
        ) : (
          <StatChip icon={<TrendingUpIcon />} value={<span data-count="number" data-to={openCount}>{openCount}</span>} label={t("stats.openDeals")} />
        ))}
      {board && (
        <StatChip
          icon={<TargetIcon />}
          value={winRate === null ? tAll("records.noValue") : <span data-count="percent" data-to={winRate}>{formatPercent(winRate, locale)}</span>}
          label={t("stats.winRate")}
        />
      )}
      {tasks && (
        <StatChip
          icon={<CalendarCheckIcon />}
          value={<span data-count="number" data-to={dueToday.length}>{dueToday.length}</span>}
          label={t("stats.due")}
          delta={overdue.length > 0 ? <DeltaBadge tone="negative">{t("stats.overdue", { count: overdue.length })}</DeltaBadge> : undefined}
        />
      )}
    </>
  );

  const actions = (
    <>
      <Button asChild variant="secondary">
        <Link href="/app/Deals/board">{t("board")}</Link>
      </Button>
      <Button asChild>
        <Link href="/app/Deals/new">
          <PlusIcon aria-hidden />
          {t("newDeal")}
        </Link>
      </Button>
    </>
  );

  const openCaption = t.rich("openAcross", { count: openCount, b: (c) => <b>{c}</b> });
  const heroValue = pipelineTotal ? <Money value={pipelineTotal} currency="OMR" /> : openCount;
  const noOpen = (
    <EmptyState
      icon={<TrendingUpIcon />}
      title={t("noOpen.title")}
      text={t("noOpen.text")}
      action={
        <Button asChild size="sm">
          <Link href="/app/Deals/new">
            <PlusIcon aria-hidden />
            {t("newDeal")}
          </Link>
        </Button>
      }
    />
  );

  const recent = (module: (typeof RECENT_MODULES)[number], result: typeof leads) => {
    const { icon, sub } = RECENT[module];
    const rows = (result?.data ?? []) as RecordData[];
    const names = nameFieldsOf(module);
    return (
      <GlassCard
        key={module}
        title={t(`recent.${module}`)}
        className={HALF}
        tools={
          <Button asChild variant="outline" size="sm">
            <Link href={`/app/${module}`}>{t("viewAll")}</Link>
          </Button>
        }
      >
        {!result ? (
          error
        ) : rows.length === 0 ? (
          <EmptyState
            icon={icon}
            title={t(`recentEmpty.${module}`)}
            action={
              <Button asChild size="sm" variant="outline">
                <Link href={`/app/${module}/new`}>
                  <PlusIcon aria-hidden />
                  {tAll("records.new")}
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col">
            {rows.map((r) => {
              const name = names.map((f) => r[f]).filter(Boolean).join(" ") || tAll("records.noValue");
              return (
                <li key={r.id} className="border-b border-line last:border-0">
                  <Link href={`/app/${module}/${r.id}`} className="-mx-2 flex items-center gap-3 rounded-ctl px-2 py-2.5 outline-none hover:bg-well focus-visible:ring-3 focus-visible:ring-ring/50">
                    <Avatar name={name} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{name}</span>
                      {sub(r) && <span className="block truncate text-xs text-muted-foreground">{sub(r)}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{t("added", { date: fmt.dateTime(new Date(String(r.Created_Time)), { dateStyle: "medium" }) })}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={[t("title1"), t("title2")]} stats={stats} actions={actions} />
      <MotionScope className="grid grid-cols-1 gap-(--gap) md:grid-cols-6 xl:grid-cols-12">
        <div className="flex flex-col gap-(--gap) [&>*:last-child]:flex-1 md:col-span-6 xl:col-span-8">
        {!board || openCount === 0 ? (
          <GlassCard title={t("pipeline.title")}>
            {board ? noOpen : error}
          </GlassCard>
        ) : (
          <div>
            <Bars
              title={
                <>
                  {t("pipeline.title")}
                  <HeroNumber className="mt-3" value={heroValue} caption={openCaption} />
                </>
              }
              seriesLabel={pipelineTotal ? t("pipeline.seriesValue") : t("pipeline.seriesCount")}
              data={open.map((c) => ({
                key: c.stage.id,
                name: tAll(c.stage.name_key),
                value: pipelineTotal ? Number(c.sum_amount_omr) : c.count,
                display: pipelineTotal ? <Money value={c.sum_amount_omr!} currency="OMR" /> : c.count,
              }))}
            />
          </div>
        )}

        <GlassCard
          title={t("mix.title")}
          subtitle={openCaption}
          tools={
            <Button asChild variant="outline" size="sm">
              <Link href="/app/Deals">{t("mix.all")}</Link>
            </Button>
          }
        >
          {!board ? (
            error
          ) : openCount === 0 ? (
            noOpen
          ) : (
            <>
              <ProportionBar
                label={t("mix.label")}
                headers={{ name: t("mix.stage"), count: t("mix.deals"), value: t("mix.value"), share: t("mix.share") }}
                segments={open.map((c, i) => ({
                  key: c.stage.id,
                  name: tAll(c.stage.name_key),
                  count: c.count,
                  tone: toneOf(c.stage.name_key, i),
                  value: pipelineTotal ? <Money value={c.sum_amount_omr!} currency="OMR" /> : undefined,
                }))}
              />
            </>
          )}
        </GlassCard>

        </div>
        <div className="flex flex-col gap-(--gap) [&>*:last-child]:flex-1 md:col-span-6 xl:col-span-4">
        <GlassCard title={t("soon.title")} subtitle={t("soon.subtitle")}>
          {!board ? (
            error
          ) : soon.length === 0 ? (
            noOpen
          ) : (
            <ul className="flex flex-col gap-3">
              {soon.map(({ d, stage }) => (
                <li key={d.id}>
                  <Link href={`/app/Deals/${d.id}`} className="block rounded-tile outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                    <Tile interactive>
                      <p className="text-xs text-muted-foreground">{d.Closing_Date ? t("closes", { date: date(d.Closing_Date) }) : tAll("records.noValue")}</p>
                      <p className="mt-1 truncate text-[17px] font-medium">{d.Deal_Name}</p>
                      <p className="truncate text-[13px] text-muted-foreground">{d.Account_Name?.name ?? tAll("records.noValue")}</p>
                      <div className="mt-4 flex items-end justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xl font-semibold">{d.Amount ? <Money value={d.Amount} currency={(d.Currency ?? "OMR") as Currency} /> : tAll("records.noValue")}</p>
                          <p className="truncate text-xs text-muted-foreground">{t("stageProb", { stage: tAll(stage.name_key), probability: stage.probability })}</p>
                        </div>
                        {d.Owner?.name && <Avatar name={d.Owner.name} size="sm" />}
                      </div>
                    </Tile>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard
          title={t("day.title")}
          subtitle={t("day.subtitle", { date: day, count: dueToday.length + overdue.length })}
          tools={
            <Button asChild variant="outline" size="sm">
              <Link href="/app/activities">{t("day.all")}</Link>
            </Button>
          }
        >
          {!tasks ? (
            error
          ) : agenda.length === 0 ? (
            <EmptyState icon={<CalendarCheckIcon />} title={t("day.empty")} text={t("day.emptyText")} />
          ) : (
            <ul className="flex flex-col gap-2">
              {agenda.map((r) => (
                <li key={r.id}>
                  <Tile className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/app/Tasks/${r.id}`} className="block truncate text-sm font-medium hover:underline">
                        {String(r.Subject)}
                      </Link>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {r.Is_Overdue ? (
                          <>
                            <AlertCircleIcon aria-hidden className="size-3.5 text-coral" />
                            <span className="font-medium text-foreground">{t("day.overdue")}</span>
                          </>
                        ) : (
                          <>
                            <span aria-hidden className="size-1.5 rounded-full bg-lime" />
                            {t("day.today")}
                          </>
                        )}
                        {typeof r.Due_Date === "string" && <span className="tabular-nums">· {date(r.Due_Date)}</span>}
                      </p>
                    </div>
                    <CompleteButton id={r.id} version={r.version} subject={String(r.Subject)} />
                  </Tile>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        </div>
        {RECENT_MODULES.map((m) => recent(m, { Leads: leads, Accounts: accounts }[m]))}
        
      </MotionScope>
    </div>
  );
}
