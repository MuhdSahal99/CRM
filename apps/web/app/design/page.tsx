import type { ReactNode } from "react";
import type { Metadata } from "next";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BanIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileTextIcon,
  InfoIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
} from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Money } from "@/components/money";
import { Donut, Gauge, PipelineFunnel } from "@/components/patterns/charts";
import { DataTable, type Column } from "@/components/patterns/data-table";
import type { KanbanColumn } from "@/components/patterns/kanban";
import { LineItemGrid } from "@/components/patterns/line-item-grid";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DirectionProvider } from "@/components/ui/direction";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { KanbanDemo, ToastButton } from "./demos";
import {
  arabicSample,
  borderPairs,
  colorPairs,
  type Deal,
  deals,
  dealsAr,
  quoteLines,
  quoteLinesAr,
  quoteTotals,
  quoteTotalsAr,
  type Stage,
  typeScale,
} from "./sample-data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("design");
  return { title: t("metaTitle") };
}

const SECTIONS = ["colors", "type", "space", "buttons", "forms", "badges", "money", "table", "kanban", "lineItems", "charts", "overlays", "rtl"] as const;
const VARIANTS = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const;
const STAGES: Stage[] = ["qualification", "needs_analysis", "proposal", "negotiation", "closed_won", "closed_lost"];
const KANBAN_STAGES: Stage[] = ["qualification", "needs_analysis", "proposal", "negotiation"];
const RADII = ["rounded-sm", "rounded-md", "rounded-lg", "rounded-xl"] as const;
const SHADOWS = ["shadow-xs", "shadow-md", "shadow-lg"] as const;
const VAT_CATEGORIES = ["standard", "zero_rated", "exempt"] as const;
const BADGE_VARIANTS = ["default", "secondary", "outline", "destructive"] as const;
const CURRENCIES = ["OMR", "AED", "INR"] as const;
const TABLE_STATES = ["ready", "loading", "empty", "error"] as const;
const CHART_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8];
const ORDINAL_SLOTS = [1, 2, 3, 4, 5];
// Showcase only: hover can't be forced from CSS, so mirror each variant's hover class here.
const HOVER: Record<(typeof VARIANTS)[number], string> = {
  default: "bg-primary/80",
  secondary: "bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]",
  outline: "bg-muted",
  ghost: "bg-muted",
  destructive: "bg-destructive/20",
  link: "underline",
};
// Type specimen glyphs, not UI copy.
const SPECIMEN = "Aa";
const FOCUS = { outline: "2px solid var(--ring)", outlineOffset: 2 };

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-4 border-t py-8">
      <h2 id={`${id}-h`} className="mb-4 text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1">
      {children}
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export default async function DesignPage() {
  const t = await getTranslations("design");
  const tStage = await getTranslations("stages");
  const tLine = await getTranslations("lineItems");
  const tCommon = await getTranslations("common");
  const format = await getFormatter();

  const stageBadge = (s: Stage) => (
    <Badge
      variant="outline"
      className={cn(s === "closed_won" && "border-success/40 text-success", s === "closed_lost" && "border-destructive/40 text-destructive")}
    >
      {tStage(s)}
    </Badge>
  );

  const columns: Column<Deal>[] = [
    { key: "deal", header: t("table.deal"), cell: (d) => d.name },
    { key: "account", header: t("table.account"), cell: (d) => d.account },
    { key: "stage", header: t("table.stage"), cell: (d) => stageBadge(d.stage) },
    { key: "closing", header: t("table.closing"), cell: (d) => format.dateTime(new Date(d.closing), { dateStyle: "medium" }) },
    { key: "amount", header: t("table.amount"), numeric: true, cell: (d) => <Money value={d.amount} currency={d.currency} /> },
  ];

  // Σ OMR per column comes from the server (sample: one deal per stage, so it is that deal's amount_omr).
  const kanbanColumns = (rows: Deal[]): KanbanColumn[] =>
    KANBAN_STAGES.map((s) => {
      const cards = rows.filter((d) => d.stage === s);
      return {
        id: s,
        title: tStage(s),
        count: cards.length,
        totalOmr: cards[0]?.amountOmr ?? "0.000",
        cards: cards.map((d) => ({ id: d.id, title: d.name, subtitle: d.account, amount: d.amount, currency: d.currency })),
      };
    });

  const funnel = [
    { key: "leads", value: 240 },
    { key: "qualified", value: 120 },
    { key: "proposals", value: 64 },
    { key: "negotiation", value: 31 },
    { key: "won", value: 18 },
  ].map((d) => {
    const name = t(`charts.${d.key}`);
    return { ...d, name, display: format.number(d.value), label: t("charts.funnelLabel", { stage: name, count: format.number(d.value) }) };
  });
  const donut = (["qualification", "needs_analysis", "proposal", "negotiation", "closed_won"] as const).map((s, i) => {
    const value = [18200, 22400, 27300, 16900, 7600][i];
    return { key: s, slot: i + 1, name: tStage(s), value, display: <Money value={`${value}.000`} currency="OMR" /> };
  });
  const gauge = [
    { key: "achieved", name: t("charts.achieved"), value: 36000, display: <Money value="36000.000" currency="OMR" /> },
    { key: "target", name: t("charts.target"), value: 50000, display: <Money value="50000.000" currency="OMR" /> },
  ];

  const moneyCases = [
    ["omr", "358.19", "OMR"],
    ["aed", "38500", "AED"],
    ["inr", "1250000", "INR"],
    ["negative", "-0.190", "OMR"],
    ["zero", "0", "OMR"],
    ["large", "123456789.5", "OMR"],
  ] as const;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-4 py-6">
        <div className="max-w-prose">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("intro")}</p>
        </div>
        <ThemeToggle />
      </header>

      <nav aria-label={t("toc")} className="pb-6">
        <ul className="flex flex-wrap gap-x-4 gap-y-2">
          {SECTIONS.map((s) => (
            <li key={s}>
              <a href={`#${s}`} className="text-primary underline-offset-4 hover:underline">
                {t(`sections.${s}`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main>
        <Section id="colors" title={t("sections.colors")}>
          <p className="mb-4 max-w-prose text-muted-foreground">{t("colors.note")}</p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {colorPairs.map(([name, bg, fg, light, dark]) => (
              <li key={name} className="flex items-center gap-3 rounded-lg border bg-card p-2">
                <span
                  aria-hidden
                  className="grid size-12 shrink-0 place-items-center rounded-md border text-lg font-semibold"
                  style={{ background: `var(${bg})`, color: `var(${fg})` }}
                >
                  {SPECIMEN}
                </span>
                <span className="min-w-0">
                  <code className="block truncate text-xs">{name}</code>
                  <span className="text-xs text-muted-foreground tabular-nums">{t("colors.contrast", { light, dark })}</span>
                </span>
              </li>
            ))}
            {borderPairs.map(([name, v, light, dark]) => (
              <li key={name} className="flex items-center gap-3 rounded-lg border bg-card p-2">
                <span aria-hidden className="size-12 shrink-0 rounded-md bg-card" style={{ border: `2px solid var(${v})` }} />
                <span className="min-w-0">
                  <code className="block truncate text-xs">{name}</code>
                  <span className="text-xs text-muted-foreground tabular-nums">{t("colors.contrast", { light, dark })}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6 mb-2 text-muted-foreground">{t("colors.chartNote")}</p>
          <div className="flex flex-wrap gap-4">
            <ol className="flex flex-wrap gap-1">
              {CHART_SLOTS.map((n) => (
                <li key={n} className="flex flex-col items-center gap-1 text-xs">
                  <span aria-hidden className="size-8 rounded-sm" style={{ background: `var(--chart-${n})` }} />
                  <code>{`chart-${n}`}</code>
                </li>
              ))}
            </ol>
            <ol className="flex flex-wrap gap-1">
              {ORDINAL_SLOTS.map((n) => (
                <li key={n} className="flex flex-col items-center gap-1 text-xs">
                  <span aria-hidden className="size-8 rounded-sm" style={{ background: `var(--ordinal-${n})` }} />
                  <code>{`ordinal-${n}`}</code>
                </li>
              ))}
            </ol>
          </div>
        </Section>

        <Section id="type" title={t("sections.type")}>
          <ul className="flex flex-col gap-3">
            {typeScale.map(([cls, spec]) => (
              <li key={cls} className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <code className="w-40 shrink-0 text-xs text-muted-foreground">{`${cls} · ${spec}`}</code>
                <span className={cn(cls, "tabular-nums")}>{t("type.sample")}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-muted-foreground">{t("type.arabicNote")}</p>
          <p lang="ar" dir="rtl" className="mt-1 text-lg">
            {arabicSample}
          </p>
        </Section>

        <Section id="space" title={t("sections.space")}>
          <div className="flex flex-wrap items-end gap-3">
            {[1, 2, 3, 4, 6, 8, 12, 16].map((n) => (
              <div key={n} className="flex flex-col items-center gap-1 text-xs">
                <span aria-hidden className="bg-primary" style={{ inlineSize: `${n * 4}px`, blockSize: `${n * 4}px` }} />
                <code>{n * 4}</code>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-4">
            {RADII.map((r) => (
              <Labelled key={r} label={`${t("space.radius")}: ${r}`}>
                <span aria-hidden className={cn("block size-16 border-2 border-input bg-card", r)} />
              </Labelled>
            ))}
            {SHADOWS.map((s) => (
              <Labelled key={s} label={`${t("space.shadow")}: ${s}`}>
                <span aria-hidden className={cn("block size-16 rounded-lg bg-card", s)} />
              </Labelled>
            ))}
          </div>
        </Section>

        <Section id="buttons" title={t("sections.buttons")}>
          <div className="flex flex-col gap-4">
            {VARIANTS.map((v) => (
              <div key={v} className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <code className="w-28 shrink-0 pt-2 text-xs text-muted-foreground">{v}</code>
                <div className="flex flex-wrap gap-3">
                  <Labelled label={t("states.rest")}>
                    <Button variant={v}>{t("buttons.save")}</Button>
                  </Labelled>
                  <Labelled label={t("states.hover")}>
                    <Button variant={v} className={HOVER[v]} tabIndex={-1}>
                      {t("buttons.save")}
                    </Button>
                  </Labelled>
                  <Labelled label={t("states.focus")}>
                    <Button variant={v} style={FOCUS} tabIndex={-1}>
                      {t("buttons.save")}
                    </Button>
                  </Labelled>
                  <Labelled label={t("states.disabled")}>
                    <Button variant={v} disabled>
                      {t("buttons.save")}
                    </Button>
                  </Labelled>
                  <Labelled label={t("states.loading")}>
                    <Button variant={v} disabled aria-busy>
                      <Loader2Icon aria-hidden className="animate-spin" />
                      {t("buttons.saving")}
                    </Button>
                  </Labelled>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button size="sm">{t("buttons.save")}</Button>
              <Button>{t("buttons.save")}</Button>
              <Button size="lg">{t("buttons.save")}</Button>
              <Button variant="outline">
                <ChevronLeftIcon aria-hidden className="rtl:rotate-180" />
                {t("buttons.back")}
              </Button>
              <Button>
                {t("buttons.next")}
                <ArrowRightIcon aria-hidden className="rtl:rotate-180" />
              </Button>
              <Button variant="outline" size="icon" aria-label={t("buttons.icon")}>
                <PlusIcon aria-hidden />
              </Button>
              <Button variant="destructive">{t("buttons.delete")}</Button>
            </div>
          </div>
        </Section>

        <Section id="forms" title={t("sections.forms")}>
          <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-rest">{t("forms.dealName")}</Label>
              <Input id="f-rest" placeholder={t("forms.dealNamePlaceholder")} />
              <span className="text-xs text-muted-foreground">{t("states.rest")}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-filled">{t("forms.dealName")}</Label>
              <Input id="f-filled" defaultValue={t("forms.dealNameValue")} />
              <span className="text-xs text-muted-foreground">{t("states.filled")}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-focus">{t("forms.dealName")}</Label>
              <Input id="f-focus" defaultValue={t("forms.dealNameValue")} style={FOCUS} tabIndex={-1} />
              <span className="text-xs text-muted-foreground">{t("states.focus")}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-error">
                {t("forms.lastName")}
                <span className="text-destructive">
                  <span aria-hidden>*</span>
                  <span className="sr-only">{t("forms.required")}</span>
                </span>
              </Label>
              <Input id="f-error" aria-invalid aria-describedby="f-error-msg" required />
              <span id="f-error-msg" className="flex items-center gap-1 text-xs text-destructive">
                <AlertTriangleIcon aria-hidden className="size-3.5" />
                {t("forms.lastNameError")}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-disabled">{t("forms.dealName")}</Label>
              <Input id="f-disabled" defaultValue={t("forms.dealNameValue")} disabled />
              <span className="text-xs text-muted-foreground">{t("states.disabled")}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-ro">{t("forms.vatNumber")}</Label>
              <Input id="f-ro" defaultValue="OM1100012345" readOnly className="bg-muted" />
              <span className="text-xs text-muted-foreground">{t("states.readOnly")}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-mobile">{t("forms.mobile")}</Label>
              <Input id="f-mobile" type="tel" inputMode="tel" dir="ltr" defaultValue="+968 9123 4567" aria-describedby="f-mobile-help" />
              <span id="f-mobile-help" className="text-xs text-muted-foreground">
                {t("forms.mobileHelp")}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-stage">{t("forms.stage")}</Label>
              <Select defaultValue="proposal">
                <SelectTrigger id="f-stage" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {tStage(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-currency">{t("forms.currency")}</Label>
              <Select defaultValue="OMR" disabled>
                <SelectTrigger id="f-currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">{t("states.disabled")}</span>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="f-notes">{t("forms.notes")}</Label>
              <Textarea id="f-notes" rows={3} />
            </div>
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-2 text-sm font-medium">{t("forms.emailOptOut")}</legend>
              <div className="flex items-center gap-2">
                <Checkbox id="c1" />
                <Label htmlFor="c1">{t("states.rest")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="c2" defaultChecked />
                <Label htmlFor="c2">{t("forms.createDeal")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="c3" disabled />
                <Label htmlFor="c3">{t("states.disabled")}</Label>
              </div>
            </fieldset>
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-2 text-sm font-medium">{t("forms.createDeal")}</legend>
              <div className="flex items-center gap-2">
                <Switch id="s1" />
                <Label htmlFor="s1">{t("states.rest")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="s2" defaultChecked />
                <Label htmlFor="s2">{t("states.filled")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="s3" disabled />
                <Label htmlFor="s3">{t("states.disabled")}</Label>
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t("forms.vatCategory")}</legend>
              <RadioGroup defaultValue="standard">
                {VAT_CATEGORIES.map((c) => (
                  <div key={c} className="flex items-center gap-2">
                    <RadioGroupItem id={`r-${c}`} value={c} />
                    <Label htmlFor={`r-${c}`}>{tLine(`vatCategory.${c}`, { rate: "5" })}</Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>
          </div>
        </Section>

        <Section id="badges" title={t("sections.badges")}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {BADGE_VARIANTS.map((v) => (
                <Badge key={v} variant={v}>
                  {t(`badges.${v}`)}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                <FileTextIcon aria-hidden />
                {t("badges.draft")}
              </Badge>
              <Badge variant="outline" className="border-info/40 text-info">
                <InfoIcon aria-hidden />
                {t("badges.issued")}
              </Badge>
              <Badge variant="outline" className="border-success/40 text-success">
                <CheckCircle2Icon aria-hidden />
                {t("badges.paid")}
              </Badge>
              <Badge variant="outline" className="border-warning/40 text-warning">
                <AlertTriangleIcon aria-hidden />
                {t("badges.overdue")}
              </Badge>
              <Badge variant="outline" className="border-destructive/40 text-destructive">
                <BanIcon aria-hidden />
                {t("badges.cancelled")}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">{STAGES.map((s) => <span key={s}>{stageBadge(s)}</span>)}</div>
          </div>
        </Section>

        <Section id="money" title={t("sections.money")}>
          <p className="mb-4 max-w-prose text-muted-foreground">{t("money.rule")}</p>
          <table className="w-full max-w-md">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th scope="col" className="py-2 text-start font-medium">{t("money.case")}</th>
                <th scope="col" className="py-2 text-end font-medium">{t("money.output")}</th>
              </tr>
            </thead>
            <tbody>
              {moneyCases.map(([key, value, cur]) => (
                <tr key={key} className="border-b">
                  <td className="py-2">{t(`money.${key}`)}</td>
                  <td className="py-2 text-end">
                    <Money value={value} currency={cur} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section id="table" title={t("sections.table")}>
          <Tabs defaultValue="ready">
            <TabsList>
              {TABLE_STATES.map((s) => (
                <TabsTrigger key={s} value={s}>
                  {t(`table.${s}`)}
                </TabsTrigger>
              ))}
            </TabsList>
            {TABLE_STATES.map((s) => (
              <TabsContent key={s} value={s} className="pt-3">
                <DataTable
                  caption={t("table.caption")}
                  columns={columns}
                  rows={s === "empty" ? [] : deals}
                  rowKey={(d) => d.id}
                  status={s === "loading" || s === "error" ? s : "ready"}
                  emptyText={t("table.emptyText")}
                  errorText={t("table.errorText")}
                  errorAction={<Button variant="outline">{tCommon("retry")}</Button>}
                />
              </TabsContent>
            ))}
          </Tabs>
        </Section>

        <Section id="kanban" title={t("sections.kanban")}>
          <p className="mb-4 max-w-prose text-muted-foreground">{t("kanban.note")}</p>
          <KanbanDemo columns={kanbanColumns(deals)} />
        </Section>

        <Section id="lineItems" title={t("sections.lineItems")}>
          <p className="mb-4 max-w-prose text-muted-foreground">{t("lineItems.note")}</p>
          <LineItemGrid lines={quoteLines} totals={quoteTotals} currency="OMR" />
        </Section>

        <Section id="charts" title={t("sections.charts")}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <PipelineFunnel title={t("charts.funnel")} data={funnel} />
            <Donut
              title={t("charts.donut")}
              data={donut}
              centerLabel={t("charts.donutCenter", { amount: format.number(92400, { notation: "compact", maximumFractionDigits: 1 }) })}
            />
            <Gauge title={t("charts.gauge")} percent={72} valueLabel={t("charts.gaugeValue", { percent: 72 })} data={gauge} />
          </div>
        </Section>

        <Section id="overlays" title={t("sections.overlays")}>
          <div className="flex flex-wrap items-center gap-3">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">{t("overlays.openDialog")}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("overlays.dialogTitle")}</DialogTitle>
                  <DialogDescription>{t("overlays.dialogDescription")}</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="d-reason">{t("overlays.reason")}</Label>
                  <Textarea id="d-reason" rows={3} />
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">{tCommon("cancel")}</Button>
                  </DialogClose>
                  <Button>{tCommon("save")}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  {t("overlays.menu")}
                  <MoreHorizontalIcon aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>
                  <PencilIcon aria-hidden />
                  {t("overlays.edit")}
                </DropdownMenuItem>
                <DropdownMenuItem>{t("overlays.duplicate")}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">{t("overlays.delete")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost">
                  <InfoIcon aria-hidden />
                  {t("overlays.tooltipTrigger")}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("overlays.tooltip")}</TooltipContent>
            </Tooltip>

            <ToastButton />
          </div>
          <div className="mt-6 flex max-w-sm flex-col gap-2" aria-busy="true">
            <span className="text-xs text-muted-foreground">{t("overlays.skeleton")}</span>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-9 w-full" />
          </div>
        </Section>

        <Section id="rtl" title={t("sections.rtl")}>
          <p className="mb-4 max-w-prose text-muted-foreground">{t("rtl.note")}</p>
          <DirectionProvider dir="rtl">
            <div dir="rtl" className="flex flex-col gap-6 rounded-lg border border-dashed p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline">
                  <ChevronLeftIcon aria-hidden className="rtl:rotate-180" />
                  {t("buttons.back")}
                </Button>
                <Button>
                  {t("buttons.next")}
                  <ChevronRightIcon aria-hidden className="rtl:rotate-180" />
                </Button>
                <div className="flex min-w-48 flex-1 flex-col gap-1.5">
                  <Label htmlFor="rtl-name">{t("forms.dealName")}</Label>
                  <Input id="rtl-name" lang="ar" defaultValue={dealsAr[0].name} />
                </div>
              </div>
              <DataTable
                caption={t("table.caption")}
                columns={columns}
                rows={dealsAr}
                rowKey={(d) => d.id}
                emptyText={t("table.emptyText")}
                errorText={t("table.errorText")}
              />
              <KanbanDemo columns={kanbanColumns(dealsAr)} />
              <LineItemGrid
                lines={quoteLinesAr.map((l) => (l.quantity === "0" ? { ...l, quantityError: t("lineItems.qtyError") } : l))}
                totals={quoteTotalsAr}
                currency="OMR"
              />
            </div>
          </DirectionProvider>
        </Section>
      </main>
    </div>
  );
}
