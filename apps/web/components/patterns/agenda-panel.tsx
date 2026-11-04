"use client";

import { AlertCircleIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { GlassCard, Tile } from "@/components/ui/glass-card";
import { IconButton } from "@/components/ui/icon-button";
import { TONE_BG, type Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

export type AgendaTask = {
  id: string;
  title: string;
  /** Already formatted, e.g. "10:30". */
  time: string;
  type: string;
  typeTone: Tone;
  sub?: string;
  person?: string;
  done?: boolean;
};

function Row({ task, onToggle }: { task: AgendaTask; onToggle?: (id: string, done: boolean) => void }) {
  const t = useTranslations("agenda");
  return (
    <li>
      <Tile className="flex items-start gap-3 p-3">
        <Checkbox
          checked={Boolean(task.done)}
          disabled={!onToggle}
          onCheckedChange={(v) => onToggle?.(task.id, v === true)}
          aria-label={t("complete", { title: task.title })}
          className="mt-0.5 size-5 rounded-full"
        />
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-sm font-medium", task.done && "line-through opacity-70")}>{task.title}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="tabular-nums">{task.time}</span>
            <span aria-hidden className={cn("size-1.5 rounded-full", TONE_BG[task.typeTone])} />
            {task.type}
          </p>
          {task.sub && <p className="truncate text-xs text-muted-foreground">{task.sub}</p>}
        </div>
        {task.person && <Avatar name={task.person} size="sm" />}
      </Tile>
    </li>
  );
}

/** Side agenda (GLASS_SPEC § Side agenda panel): today's tasks, with an Overdue section under a coral divider. */
export function AgendaPanel({
  title,
  caption,
  tasks,
  overdue = [],
  onToggle,
  onAdd,
  addLabel,
}: {
  title: string;
  /** e.g. "Saturday, Oct 31 · 0/3 done" */
  caption: string;
  tasks: AgendaTask[];
  overdue?: AgendaTask[];
  onToggle?: (id: string, done: boolean) => void;
  /** Without a handler the + button is not shown. */
  onAdd?: () => void;
  addLabel?: string;
}) {
  const t = useTranslations("agenda");
  return (
    <GlassCard
      title={title}
      subtitle={caption}
      tools={
        onAdd && (
          <IconButton label={addLabel ?? t("add")} onClick={onAdd}>
            <PlusIcon />
          </IconButton>
        )
      }
    >
      {overdue.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 border-b border-line pb-2 text-sm font-medium">
            <AlertCircleIcon aria-hidden className="size-4 stroke-[1.6] text-coral" />
            {t("overdue")}
            <span className="ms-auto grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1.5 text-[11px] font-semibold text-on-accent tabular-nums">{overdue.length}</span>
          </div>
          <ul className="flex flex-col gap-2">
            {overdue.map((task) => (
              <Row key={task.id} task={task} onToggle={onToggle} />
            ))}
          </ul>
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {tasks.map((task) => (
          <Row key={task.id} task={task} onToggle={onToggle} />
        ))}
      </ul>
    </GlassCard>
  );
}
