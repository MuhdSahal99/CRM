"use client";

import { InboxIcon, MoreHorizontalIcon, PlusIcon, TrendingUpIcon, TargetIcon, UsersIcon, MailIcon, ExpandIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Money } from "@/components/money";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { ChipDivider, ChipGroup, FilterChip } from "@/components/ui/filter-chip";
import { GlassCard, HeroNumber, Tile, Well } from "@/components/ui/glass-card";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProgressBar, ProgressRing, ProportionBar } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SearchInput } from "@/components/ui/search-input";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DeltaBadge, StatChip, StatusPill } from "@/components/ui/status";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const NAMES = ["Amal Haddad", "Omar Said", "Priya Nair", "Yusuf Karim", "Lina Mansour"];

/** Every glass primitive in one place (docs/GLASS_SPEC.md section 6). Rendered once per theme and once in RTL. */
export function GlassKit() {
  const t = useTranslations("design.kit");
  const [range, setRange] = useState("6m");
  const [view, setView] = useState("grid");
  const [chip, setChip] = useState("mine");
  const [on, setOn] = useState(true);
  const [plan, setPlan] = useState("a");
  const uid = useId();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard
          title={t("card.title")}
          subtitle={t("card.subtitle")}
          tools={
            <>
              <Segmented
                label={t("range.label")}
                value={range}
                onValueChange={setRange}
                options={[
                  { value: "3m", label: t("range.3m") },
                  { value: "6m", label: t("range.6m") },
                  { value: "12m", label: t("range.12m") },
                ]}
              />
              <IconButton size="sm" label={t("actions.expand")}>
                <ExpandIcon />
              </IconButton>
              <IconButton size="sm" label={t("actions.more")}>
                <MoreHorizontalIcon />
              </IconButton>
            </>
          }
        >
          <HeroNumber value="1,421,350" caption={t.rich("card.caption", { b: (c) => <b>{c}</b> })} />
          <div className="flex flex-wrap items-center gap-6">
            <StatChip icon={<TrendingUpIcon />} value="42" label={t("stat.won")} delta={<DeltaBadge tone="positive">{t("stat.up")}</DeltaBadge>} />
            <StatChip icon={<TargetIcon />} value="64%" label={t("stat.rate")} delta={<DeltaBadge tone="negative">{t("stat.down")}</DeltaBadge>} />
            <StatChip icon={<UsersIcon />} value="18" label={t("stat.open")} delta={<DeltaBadge tone="neutral">{t("stat.flat")}</DeltaBadge>} />
          </div>
        </GlassCard>

        <GlassCard title={t("tile.section")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Tile interactive>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t("tile.date")}</span>
                <IconButton size="sm" variant="fill" label={t("actions.more")}>
                  <MoreHorizontalIcon />
                </IconButton>
              </div>
              <p className="mt-2 text-[17px] font-medium">{t("tile.title")}</p>
              <p className="text-[13px] text-muted-foreground">{t("tile.subtitle")}</p>
              <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-xl font-semibold"><Money value="12400.000" currency="OMR" /></p>
                  <p className="text-xs text-muted-foreground">{t("tile.stage")}</p>
                </div>
                <AvatarStack names={NAMES} />
              </div>
            </Tile>
            <Tile tint="lime">
              <p className="text-[13px] text-muted-foreground">{t("tile.well")}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Well>
                  <p className="text-[11px] text-muted-foreground">{t("tile.pipeline")}</p>
                  <p className="text-sm font-semibold"><Money value="8200.000" currency="OMR" /></p>
                </Well>
                <Well>
                  <p className="text-[11px] text-muted-foreground">{t("tile.contact")}</p>
                  <p className="text-sm font-semibold">{t("tile.contactValue")}</p>
                </Well>
              </div>
              <ProgressBar className="mt-3" value={72} tone="lime" label={t("progress.bar")} valueLabel="72%" />
            </Tile>
          </div>
        </GlassCard>
      </div>

      <GlassCard title={t("buttons.title")}>
        <div className="flex flex-wrap items-center gap-3">
          <Button>
            <PlusIcon aria-hidden />
            {t("buttons.primary")}
          </Button>
          <Button variant="secondary">{t("buttons.secondary")}</Button>
          <Button variant="ghost">{t("buttons.ghost")}</Button>
          <Button variant="danger">{t("buttons.danger")}</Button>
          <Button disabled>{t("buttons.disabled")}</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <IconButton size="sm" label={t("actions.add")}>
            <PlusIcon />
          </IconButton>
          <IconButton size="md" label={t("actions.add")} magnetic>
            <PlusIcon />
          </IconButton>
          <IconButton size="lg" variant="fill" label={t("actions.mail")} magnetic>
            <MailIcon />
          </IconButton>
          <Segmented
            label={t("view.label")}
            value={view}
            onValueChange={setView}
            options={[
              { value: "grid", label: t("view.grid") },
              { value: "table", label: t("view.table") },
            ]}
          />
        </div>
      </GlassCard>

      <GlassCard title={t("chips.title")}>
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput label={t("search")} placeholder={t("search")} />
        </div>
        <ChipGroup label={t("chips.label")}>
          <FilterChip selected={chip === "mine"} onClick={() => setChip("mine")}>
            {t("chips.mine")}
          </FilterChip>
          <FilterChip selected={chip === "team"} onClick={() => setChip("team")}>
            {t("chips.team")}
          </FilterChip>
          <ChipDivider />
          <FilterChip selected={chip === "amal"} avatar={NAMES[0]} onClick={() => setChip("amal")}>
            {NAMES[0]}
          </FilterChip>
        </ChipGroup>
      </GlassCard>

      <GlassCard title={t("forms.title")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("forms.name")} hint={t("forms.hint")}>
            {(p) => <Input {...p} defaultValue={t("forms.nameValue")} />}
          </Field>
          <Field label={t("forms.email")} error={t("forms.error")}>
            {(p) => <Input {...p} type="email" defaultValue="amal@" />}
          </Field>
          <Field label={t("forms.stage")}>
            {(p) => (
              <Select defaultValue="proposal">
                <SelectTrigger {...p} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="proposal">{t("forms.proposal")}</SelectItem>
                  <SelectItem value="won">{t("forms.won")}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label={t("forms.notes")}>{(p) => <Textarea {...p} />}</Field>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <Checkbox id={`${uid}-cb`} defaultChecked />
            <Label htmlFor={`${uid}-cb`}>{t("forms.agree")}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id={`${uid}-sw`} checked={on} onCheckedChange={setOn} />
            <Label htmlFor={`${uid}-sw`}>{t("forms.notify")}</Label>
          </div>
          <RadioGroup value={plan} onValueChange={setPlan} aria-label={t("forms.plan")} className="flex w-auto gap-4">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="a" id={`${uid}-ra`} />
              <Label htmlFor={`${uid}-ra`}>{t("forms.planA")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="b" id={`${uid}-rb`} />
              <Label htmlFor={`${uid}-rb`}>{t("forms.planB")}</Label>
            </div>
          </RadioGroup>
        </div>
      </GlassCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard title={t("status.title")}>
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill tone="sky">{t("status.new")}</StatusPill>
            <StatusPill tone="lime">{t("status.won")}</StatusPill>
            <StatusPill tone="coral">{t("status.overdue")}</StatusPill>
            <StatusPill tone="ink">{t("status.closed")}</StatusPill>
            <Badge variant="secondary">12</Badge>
            <Badge variant="alert">3</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {NAMES.slice(0, 4).map((n, i) => (
              <Avatar key={n} name={n} size={(["xs", "sm", "md", "lg"] as const)[i]} />
            ))}
            <Avatar name={NAMES[4]!} size="xl" />
          </div>
          <div className="flex flex-wrap items-center gap-8">
            <ProgressRing value={68} label={t("progress.ring")} caption={t("progress.caption")} />
            <ProgressRing value={35} tone="coral" size={80} stroke={8} label={t("progress.ring")} />
          </div>
        </GlassCard>

        <GlassCard title={t("mix.title")}>
          <ProportionBar
            label={t("mix.title")}
            headers={{ name: t("mix.name"), count: t("mix.count"), value: t("mix.value"), share: t("mix.share") }}
            segments={[
              { key: "new", name: t("status.new"), count: 8, tone: "sky", value: <Money value="9000.000" currency="OMR" /> },
              { key: "won", name: t("status.won"), count: 5, tone: "lime", value: <Money value="21500.000" currency="OMR" /> },
              { key: "overdue", name: t("status.overdue"), count: 2, tone: "coral", value: <Money value="3100.000" currency="OMR" /> },
              { key: "closed", name: t("status.closed"), count: 3, tone: "ink", value: <Money value="4800.000" currency="OMR" /> },
            ]}
          />
        </GlassCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard title={t("empty.section")}>
          <EmptyState icon={<InboxIcon />} title={t("empty.title")} text={t("empty.text")} action={<Button size="sm">{t("empty.action")}</Button>} />
        </GlassCard>
        <GlassCard title={t("loading.title")}>
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-24 w-full rounded-tile" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
