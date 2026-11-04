"use client";

import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tile } from "@/components/ui/glass-card";
import { ProgressBar } from "@/components/ui/progress";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";

type ProfileProps = {
  name: string;
  role: string;
  email: string;
  /** Online dot on the avatar. */
  online?: boolean;
  /** Lime-tinted highlight card with a progress bar. */
  highlight: { title: string; caption: string; value: number; valueLabel: string; progressLabel: string };
  /** Exactly three mini stats, shown with dividers. */
  stats: { label: string; value: ReactNode }[];
  /** "Next item" link tile with a coloured start bar. */
  next?: { eyebrow: string; title: string; href: string; barClass?: string };
};

/** Left card of the settings layout (GLASS_SPEC § Settings layout). */
export function ProfileCard({ name, role, email, online, highlight, stats, next }: ProfileProps) {
  return (
    <section aria-label={name} className="glass flex flex-col gap-5 rounded-card p-(--pad)">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="relative">
          <Avatar name={name} size="xl" />
          {online && <span aria-hidden className="absolute end-1.5 bottom-1.5 size-4 rounded-full border-2 border-solid bg-lime" />}
        </span>
        <h2 className="text-lg font-semibold">{name}</h2>
        <p className="text-xs text-muted-foreground">{role}</p>
        <span className="max-w-full truncate rounded-full bg-glass-2 px-3 py-1 text-xs">{email}</span>
      </div>

      <Tile tint="lime" className="flex flex-col gap-2">
        <p className="text-sm font-medium">{highlight.title}</p>
        <p className="text-xs text-muted-foreground">{highlight.caption}</p>
        <ProgressBar value={highlight.value} label={highlight.progressLabel} valueLabel={highlight.valueLabel} />
      </Tile>

      <dl className="grid grid-cols-3 divide-x divide-line text-center">
        {stats.map((s) => (
          <div key={s.label} className="px-2">
            <dd className="text-base font-semibold tabular-nums">{s.value}</dd>
            <dt className="text-[11px] text-muted-foreground">{s.label}</dt>
          </div>
        ))}
      </dl>

      {next && (
        <a href={next.href} className={cn("block rounded-tile border border-line border-s-4 bg-glass-tile p-3 transition-colors hover:bg-glass-2", next.barClass ?? "border-s-coral")}>
          <span className="block text-[11px] tracking-[0.08em] text-faint uppercase">{next.eyebrow}</span>
          <span className="block text-sm font-medium">{next.title}</span>
        </a>
      )}
    </section>
  );
}

type LayoutProps = {
  profile: ReactNode;
  tabsLabel: string;
  tabs: SegmentedOption[];
  tab: string;
  onTabChange: (tab: string) => void;
  /** Discard and Save stay disabled until something changes. */
  dirty: boolean;
  onDiscard: () => void;
  onSave: () => void;
  discardLabel: string;
  saveLabel: string;
  children: ReactNode;
};

/** Profile card on the start side; on the end side an icon tab bar, the form, and a Discard / Save footer. */
export function SettingsLayout({ profile, tabsLabel, tabs, tab, onTabChange, dirty, onDiscard, onSave, discardLabel, saveLabel, children }: LayoutProps) {
  return (
    <div className="grid items-start gap-(--gap) lg:grid-cols-[22rem_1fr]">
      {profile}
      <section className="glass flex flex-col gap-5 rounded-card p-(--pad)">
        <div className="max-w-full self-start overflow-x-auto">
          <Segmented label={tabsLabel} options={tabs} value={tab} onValueChange={onTabChange} />
        </div>
        <div className="flex flex-col gap-4">{children}</div>
        <footer className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" disabled={!dirty} onClick={onDiscard}>
            {discardLabel}
          </Button>
          <Button disabled={!dirty} onClick={onSave}>
            {saveLabel}
          </Button>
        </footer>
      </section>
    </div>
  );
}
