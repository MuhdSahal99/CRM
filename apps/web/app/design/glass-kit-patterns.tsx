"use client";

import { BellIcon, MailIcon, PencilIcon, ShieldIcon, UserIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { AgendaPanel } from "@/components/patterns/agenda-panel";
import { Calendar } from "@/components/patterns/calendar";
import { AreaTrend, Bars, Donut, type Datum, StackedBars } from "@/components/patterns/charts";
import { type Column, DataTable, DataTableToolbar, PersonCell } from "@/components/patterns/data-table";
import { Kanban, type KanbanColumn } from "@/components/patterns/kanban";
import { ProfileCard, SettingsLayout } from "@/components/patterns/settings-layout";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { LiveBar } from "@/components/ui/live-bar";
import { OverlayRoot } from "@/components/ui/overlay-root";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Tone } from "@/components/ui/tone";
import { dealsAr, deals as dealsEn, type Deal, type Stage } from "./sample-data";

const TODAY = "2026-10-31";
const STAGE_TONE: Record<Stage, Tone> = { qualification: "sky", needs_analysis: "sky", proposal: "lime", negotiation: "coral", closed_won: "lime", closed_lost: "coral" };
const BOARD: Stage[] = ["qualification", "needs_analysis", "proposal", "negotiation", "closed_won", "closed_lost"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const AMOUNTS = [42000, 58000, 51000, 73000, 66000, 91000];

/** Table, board, charts, overlays, calendar, agenda, live bar and settings layout (GLASS_SPEC 6). Themed by the panel around it. */
export function GlassKitPatterns({ rtl = false }: { rtl?: boolean }) {
  const t = useTranslations("design.patterns");
  const tStage = useTranslations("stages");
  const tKanban = useTranslations("design.kanban");
  const tTable = useTranslations("design.table");
  const format = useFormatter();
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const rows: Deal[] = rtl ? dealsAr : dealsEn;

  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const shown = rows.filter((d) => (status === "all" || (status === "won" ? d.stage === "closed_won" : d.stage !== "closed_won")) && `${d.name} ${d.account}`.toLowerCase().includes(search.toLowerCase()));
  const columns: Column<Deal>[] = [
    { key: "deal", header: tTable("deal"), cell: (d) => <PersonCell name={d.name} sub={d.account} /> },
    { key: "stage", header: tTable("stage"), cell: (d) => <StatusPill tone={STAGE_TONE[d.stage]}>{tStage(d.stage)}</StatusPill> },
    { key: "closing", header: tTable("closing"), cell: (d) => format.dateTime(new Date(d.closing), { dateStyle: "medium" }) },
    { key: "amount", header: tTable("amount"), numeric: true, cell: (d) => <Money value={d.amount} currency={d.currency} /> },
  ];

  const board: KanbanColumn[] = BOARD.map((s) => {
    const cards = rows.filter((d) => d.stage === s);
    return {
      id: s,
      title: tStage(s),
      tone: STAGE_TONE[s],
      outcome: s === "closed_won" ? "won" : s === "closed_lost" ? "lost" : undefined,
      count: cards.length,
      totalOmr: cards[0]?.amountOmr ?? "0.000",
      cards: cards.map((d) => ({ id: d.id, title: d.name, subtitle: d.account, amount: d.amount, currency: d.currency })),
    };
  });

  const trend: Datum[] = MONTHS.map((m, i) => ({ key: m, name: m, value: AMOUNTS[i]!, display: format.number(AMOUNTS[i]!) }));
  const deals12: Datum[] = MONTHS.map((m, i) => ({ key: m, name: m, value: 8 + ((i * 5) % 9), display: String(8 + ((i * 5) % 9)) }));
  const stacked = ["Q1", "Q2", "Q3", "Q4"].map((q, i) => ({ key: q, name: q, values: { new: 30 + i * 6, active: 22 + ((i * 7) % 11), risk: 6 + ((i * 3) % 7) }, display: String(i) }));
  const donut = (["qualification", "needs_analysis", "proposal", "negotiation"] as const).map((s, i) => ({
    key: s,
    slot: i + 1,
    name: tStage(s),
    value: [18200, 22400, 27300, 16900][i]!,
    display: format.number([18200, 22400, 27300, 16900][i]!),
  }));

  const events = [
    { id: "e1", date: "2026-10-05", time: "09:30", title: t("calendar.call"), tone: "sky" as const, people: ["Amal Haddad"] },
    { id: "e2", date: "2026-10-12", time: "10:00", title: t("calendar.demo"), tone: "lime" as const, people: ["Omar Said", "Priya Nair"] },
    { id: "e3", date: "2026-10-12", time: "13:00", title: t("calendar.review"), tone: "coral" as const },
    { id: "e4", date: "2026-10-12", time: "15:30", title: t("calendar.sync"), tone: "ink" as const },
    { id: "e5", date: "2026-10-19", title: t("calendar.visit"), tone: "lime" as const, done: true },
    { id: "e6", date: TODAY, time: "11:00", title: t("calendar.quote"), tone: "sky" as const, people: ["Lina Mansour", "Yusuf Karim"] },
  ];

  const [started] = useState(() => Date.now() - 83_000);
  const [tab, setTab] = useState("profile");
  const [name, setName] = useState(t("settings.nameValue"));

  return (
    <OverlayRoot value={root}>
      <div ref={setRoot} data-kit-patterns className="flex flex-col gap-6">
        <p className="text-sm text-muted-foreground">{t("note")}</p>

        <GlassCard title={t("table.title")}>
          <DataTable
            caption={t("table.title")}
            columns={columns}
            rows={shown}
            rowKey={(d) => d.id}
            emptyText={tTable("emptyText")}
            errorText={tTable("errorText")}
            rowMenu={{
              label: t("table.menu"),
              items: () => (
                <>
                  <DropdownMenuItem>
                    <PencilIcon aria-hidden />
                    {t("table.edit")}
                  </DropdownMenuItem>
                  <DropdownMenuItem>{t("table.duplicate")}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive">{t("table.delete")}</DropdownMenuItem>
                </>
              ),
            }}
            toolbar={
              <DataTableToolbar
                statusLabel={t("table.statusLabel")}
                statuses={[
                  { value: "all", label: t("table.all") },
                  { value: "open", label: t("table.open") },
                  { value: "won", label: t("table.won") },
                ]}
                status={status}
                onStatusChange={setStatus}
                count={t("table.count", { count: shown.length, total: format.number(shown.reduce((n, d) => n + Number(d.amountOmr), 0), { style: "currency", currency: "OMR", numberingSystem: "latn" }) })}
                searchLabel={t("table.search")}
                search={search}
                onSearch={setSearch}
              />
            }
          />
        </GlassCard>

        <Kanban
          label={tKanban("label")}
          columns={board}
          moveLabel={tKanban("move")}
          onMove={(id, to) => {
            const title = rows.find((d) => d.id === id)?.name ?? id;
            notify(tKanban("moved", { deal: title, stage: tStage(to as Stage) }), { onUndo: () => notify(t("overlays.toastUndone"), { kind: "info" }) });
          }}
        />

        <div className="grid gap-4 xl:grid-cols-2">
          <AreaTrend title={t("charts.revenue")} data={trend} seriesLabel={t("charts.revenueSeries")} target={{ value: 60000, label: t("charts.target") }} />
          <Bars title={t("charts.bars")} data={deals12} seriesLabel={t("charts.barsSeries")} highlight="Jun" />
          <StackedBars
            title={t("charts.stacked")}
            series={[
              { key: "new", name: t("charts.seriesNew"), tone: "sky" },
              { key: "active", name: t("charts.seriesActive"), tone: "lime" },
              { key: "risk", name: t("charts.seriesRisk"), tone: "coral" },
            ]}
            data={stacked}
          />
          <Donut title={t("charts.donut")} data={donut} centerValue={format.number(84800, { notation: "compact", maximumFractionDigits: 1 })} centerCaption={t("charts.donutCaption")} />
        </div>

        <GlassCard title={t("overlays.title")}>
          <div className="flex flex-wrap items-center gap-3">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary">{t("overlays.dialog")}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("overlays.dialogTitle")}</DialogTitle>
                  <DialogDescription>{t("overlays.dialogText")}</DialogDescription>
                </DialogHeader>
                <Field label={t("overlays.reason")}>{(p) => <Textarea rows={3} {...p} />}</Field>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="ghost">{t("overlays.cancel")}</Button>
                  </DialogClose>
                  <Button>{t("overlays.save")}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="secondary">{t("overlays.drawer")}</Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>{t("overlays.drawerTitle")}</SheetTitle>
                  <SheetDescription>{t("overlays.drawerText")}</SheetDescription>
                </SheetHeader>
                <div className="flex flex-col gap-5 overflow-y-auto px-4 pb-4">
                  <section>
                    <h4 className="mb-1 text-[11px] tracking-[0.08em] text-faint uppercase">{t("overlays.summary")}</h4>
                    <Money value="10000.000" currency="OMR" />
                  </section>
                  <section>
                    <h4 className="mb-1 text-[11px] tracking-[0.08em] text-faint uppercase">{t("overlays.activity")}</h4>
                    <p className="text-sm">{t("overlays.activityText")}</p>
                  </section>
                </div>
              </SheetContent>
            </Sheet>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary">{t("overlays.menu")}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>{t("overlays.menuHeader")}</DropdownMenuLabel>
                <DropdownMenuItem>
                  <PencilIcon aria-hidden />
                  {t("table.edit")}
                  <DropdownMenuShortcut>{t("overlays.kbdEdit")}</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem>{t("table.duplicate")}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">{t("table.delete")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="secondary">{t("overlays.popover")}</Button>
              </PopoverTrigger>
              <PopoverContent className="p-3 text-sm">{t("overlays.popoverText")}</PopoverContent>
            </Popover>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost">{t("overlays.tooltip")}</Button>
              </TooltipTrigger>
              <TooltipContent>{t("overlays.tooltipText")}</TooltipContent>
            </Tooltip>

            <Button variant="secondary" onClick={() => notify(t("overlays.toastText"), { onUndo: () => notify(t("overlays.toastUndone"), { kind: "info" }) })}>
              {t("overlays.toast")}
            </Button>
          </div>
        </GlassCard>

        <div className="grid items-start gap-4 xl:grid-cols-[1fr_22rem]">
          <Calendar events={events} today={TODAY} />
          <AgendaPanel
            title={t("agenda.title")}
            caption={t("agenda.caption")}
            overdue={[{ id: "o1", title: t("agenda.late"), time: "09:00", type: t("agenda.typeTask"), typeTone: "coral", sub: t("agenda.lateSub"), person: "Omar Said" }]}
            tasks={[
              { id: "a1", title: t("agenda.call"), time: "10:30", type: t("agenda.typeCall"), typeTone: "sky", sub: t("agenda.callSub"), person: "Amal Haddad" },
              { id: "a2", title: t("agenda.email"), time: "13:00", type: t("agenda.typeEmail"), typeTone: "lime", person: "Priya Nair" },
              { id: "a3", title: t("agenda.task"), time: "16:00", type: t("agenda.typeTask"), typeTone: "ink", done: true },
            ]}
            onToggle={() => {}}
          />
        </div>

        <div className="flex justify-center">
          <LiveBar name="Amal Haddad" startedAt={started} onEnd={() => {}} onNotes={() => {}} />
        </div>

        <SettingsLayout
          profile={
            <ProfileCard
              name={t("settings.nameValue")}
              role={t("settings.role")}
              email={t("settings.email")}
              online
              highlight={{ title: t("settings.complete"), caption: t("settings.completeText"), value: 80, valueLabel: "80%", progressLabel: t("settings.complete") }}
              stats={[
                { label: t("settings.statDeals"), value: "42" },
                { label: t("settings.statWon"), value: "18" },
                { label: t("settings.statRate"), value: "64%" },
              ]}
              next={{ eyebrow: t("settings.nextEyebrow"), title: t("settings.nextTitle"), href: "#" }}
            />
          }
          tabsLabel={t("settings.tabsLabel")}
          tabs={[
            { value: "profile", label: t("settings.tabProfile"), icon: <UserIcon aria-hidden className="size-4" /> },
            { value: "notify", label: t("settings.tabNotify"), icon: <BellIcon aria-hidden className="size-4" /> },
            { value: "security", label: t("settings.tabSecurity"), icon: <ShieldIcon aria-hidden className="size-4" /> },
          ]}
          tab={tab}
          onTabChange={setTab}
          dirty={name !== t("settings.nameValue")}
          onDiscard={() => setName(t("settings.nameValue"))}
          onSave={() => notify(t("overlays.toastText"))}
          discardLabel={t("settings.discard")}
          saveLabel={t("settings.save")}
        >
          {tab === "profile" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("settings.name")}>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
              <Field label={t("settings.phone")}>{(p) => <Input {...p} defaultValue={t("settings.phoneValue")} dir="ltr" />}</Field>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <MailIcon aria-hidden className="size-4" />
              {tab === "notify" ? t("settings.notifyText") : t("settings.securityText")}
            </p>
          )}
        </SettingsLayout>
      </div>
    </OverlayRoot>
  );
}
