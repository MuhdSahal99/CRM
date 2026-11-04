"use client";

import {
  type Announcements,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CircleCheckIcon, CircleXIcon, GripVerticalIcon, MoreHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { Money } from "@/components/money";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { TONE_BG, TONE_TINT, type Tone } from "@/components/ui/tone";
import type { Currency } from "@/lib/format";
import { flipFrom, snapshotRects } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type KanbanCard = { id: string; title: string; subtitle: string; amount: string | null; currency: Currency; href?: string };
export type KanbanColumn = {
  id: string;
  title: string;
  count: number;
  totalOmr: string | null;
  cards: KanbanCard[];
  /** Semantic colour of the stage dot and card tint (default sky). */
  tone?: Tone;
  /** Terminal stages sit in the outcome rail as dashed drop zones instead of full columns. */
  outcome?: "won" | "lost";
};

type Props = {
  label: string;
  columns: KanbanColumn[];
  /** "Move to stage" menu: the keyboard/touch alternative to dragging (WCAG 2.5.7). */
  moveLabel: string;
  onMove: (cardId: string, columnId: string) => void;
};

type CardProps = { card: KanbanCard; column: KanbanColumn; columns: KanbanColumn[]; moveLabel: string; onMove: Props["onMove"]; compact?: boolean };

function CardBody({ card, compact }: { card: KanbanCard; compact?: boolean }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-[15px] font-medium">{card.href ? <Link href={card.href} className="hover:underline">{card.title}</Link> : card.title}</p>
      <p className="truncate text-xs text-muted-foreground">{card.subtitle}</p>
      {!compact && card.amount !== null && (
        <p className="mt-3 text-end text-lg font-semibold tabular-nums">
          <Money value={card.amount} currency={card.currency} />
        </p>
      )}
    </div>
  );
}

function DealCard({ card, column, columns, moveLabel, onMove, compact }: CardProps) {
  const t = useTranslations("kanban");
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: card.id });
  return (
    <li
      ref={setNodeRef}
      data-card-id={card.id}
      {...listeners}
      className={cn(
        "flex items-start gap-1 rounded-tile border border-line p-3 transition-[border-color,opacity] duration-(--dur) ease-glass hover:border-line-2",
        TONE_TINT[column.tone ?? "sky"],
        isDragging && "opacity-30",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        type="button"
        aria-label={t("drag", { title: card.title })}
        className="-ms-1 grid size-7 shrink-0 cursor-grab place-items-center rounded-full text-muted-foreground hover:bg-glass-2 pointer-coarse:size-11"
      >
        <GripVerticalIcon aria-hidden className="size-4 stroke-[1.6]" />
      </button>
      <CardBody card={card} compact={compact} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton size="sm" label={`${moveLabel}: ${card.title}`}>
            <MoreHorizontalIcon />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{moveLabel}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={column.id} onValueChange={(to) => onMove(card.id, to)}>
            {columns.map((c) => (
              <DropdownMenuRadioItem key={c.id} value={c.id}>
                {c.title}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

const ARROW: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };

/** Arrow keys jump to the nearest stage in that direction (the default getter only nudges by 25px). */
const jumpToStage: KeyboardCoordinateGetter = (event, { context: { active, collisionRect, droppableRects, droppableContainers } }) => {
  const dir = ARROW[event.code];
  if (!dir || !active || !collisionRect) return undefined;
  event.preventDefault();
  const here = { x: collisionRect.left + collisionRect.width / 2, y: collisionRect.top + collisionRect.height / 2 };
  let best: { x: number; y: number; d: number } | undefined;
  for (const c of droppableContainers.getEnabled()) {
    const r = droppableRects.get(c.id);
    if (!r) continue;
    const dx = r.left + r.width / 2 - here.x;
    const dy = r.top + r.height / 2 - here.y;
    if (dx * dir[0] + dy * dir[1] <= 1) continue; // not in that direction
    const d = Math.hypot(dx, dy);
    if (!best || d < best.d) best = { x: r.left + (r.width - collisionRect.width) / 2, y: r.top + 8, d };
  }
  return best && { x: best.x, y: best.y };
};

const COLUMN_W = "w-[85vw] shrink-0 snap-start md:w-72";

function StageColumn({ col, ...rest }: { col: KanbanColumn } & Omit<CardProps, "card" | "column">) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  return (
    <section
      ref={setNodeRef}
      aria-label={col.title}
      className={cn("glass flex flex-col gap-3 rounded-card p-3 transition-[border-color,box-shadow] duration-(--dur) ease-glass", COLUMN_W, isOver && "border-line-2 shadow-pop")}
    >
      <header className="flex items-center gap-2 px-1">
        <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", TONE_BG[col.tone ?? "sky"])} />
        <h3 className="min-w-0 truncate text-sm font-semibold">{col.title}</h3>
        <Badge variant="secondary" className="bg-glass-2 tabular-nums">
          {col.count}
        </Badge>
        {col.totalOmr !== null && (
          <p className="ms-auto text-xs text-muted-foreground">
            <Money value={col.totalOmr} currency="OMR" />
          </p>
        )}
      </header>
      <ul className="flex max-h-[calc(100dvh-18rem)] min-h-16 flex-col gap-2.5 overflow-y-auto overscroll-contain">
        {col.cards.map((card) => (
          <DealCard key={card.id} card={card} column={col} {...rest} />
        ))}
      </ul>
    </section>
  );
}

function OutcomeZone({ col, ...rest }: { col: KanbanColumn } & Omit<CardProps, "card" | "column">) {
  const t = useTranslations("kanban");
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  const Icon = col.outcome === "won" ? CircleCheckIcon : CircleXIcon;
  return (
    <section
      ref={setNodeRef}
      aria-label={col.title}
      className={cn("flex flex-col gap-3 rounded-card border-2 border-dashed border-line-2 p-3 transition-[border-color,background-color] duration-(--dur) ease-glass", isOver && "border-text bg-glass-2")}
    >
      <header className="flex flex-col items-center gap-1 px-2 py-3 text-center">
        <span aria-hidden className={cn("grid size-11 place-items-center rounded-full", col.outcome === "won" ? "bg-lime text-on-accent" : "bg-coral text-on-accent")}>
          <Icon className="size-5 stroke-[1.6]" />
        </span>
        <h3 className="text-sm font-semibold">{col.title}</h3>
        <p className="text-xs text-muted-foreground">{t(col.outcome === "won" ? "dropWon" : "dropLost")}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {t("dealCount", { count: col.count })}
          {col.totalOmr !== null && (
            <span className="before:mx-1 before:content-['·']">
              <Money value={col.totalOmr} currency="OMR" />
            </span>
          )}
        </p>
      </header>
      {col.cards.length > 0 && (
        <ul className="flex max-h-60 flex-col gap-2 overflow-y-auto overscroll-contain">
          {col.cards.map((card) => (
            <DealCard key={card.id} card={card} column={col} compact {...rest} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Pipeline board (GLASS_SPEC § Kanban). Count and Σ OMR come from the server, never summed here.
 * Drag and drop is @dnd-kit/core (mouse, touch-hold, keyboard on the grip); the move menu stays as the other route in.
 * A drop only calls `onMove`; the caller saves and refreshes, and siblings then FLIP into their new places.
 */
export function Kanban({ label, columns, moveLabel, onMove }: Props) {
  const t = useTranslations("kanban");
  const [activeId, setActiveId] = useState<string | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const before = useRef<{ rects: Map<string, DOMRect>; moved: string; at: number } | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: jumpToStage }),
  );

  const cards = columns.flatMap((c) => c.cards.map((card) => ({ card, column: c })));
  const cardTitle = (id: unknown) => cards.find((x) => x.card.id === id)?.card.title ?? String(id);
  const colTitle = (id: unknown) => columns.find((c) => c.id === id)?.title ?? String(id);
  const active = cards.find((x) => x.card.id === activeId);

  // New server data arrived after a drop: slide the siblings from where they were (0.35s power3.out).
  useLayoutEffect(() => {
    const snap = before.current;
    before.current = null;
    if (!snap || Date.now() - snap.at > 5000 || !board.current) return;
    flipFrom(board.current.querySelectorAll<HTMLElement>("[data-card-id]"), (el) => el.dataset.cardId!, snap.rects, snap.moved);
  }, [columns]);

  const announcements: Announcements = {
    onDragStart: ({ active }) => t("announce.start", { title: cardTitle(active.id) }),
    onDragOver: ({ active, over }) => (over ? t("announce.over", { title: cardTitle(active.id), stage: colTitle(over.id) }) : undefined),
    onDragEnd: ({ active, over }) => (over ? t("announce.drop", { title: cardTitle(active.id), stage: colTitle(over.id) }) : t("announce.cancel", { title: cardTitle(active.id) })),
    onDragCancel: ({ active }) => t("announce.cancel", { title: cardTitle(active.id) }),
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    const from = columns.find((c) => c.cards.some((card) => card.id === active.id));
    if (!over || !from || over.id === from.id) return;
    const els = board.current?.querySelectorAll<HTMLElement>("[data-card-id]") ?? [];
    before.current = { rects: snapshotRects(els, (el) => el.dataset.cardId!), moved: String(active.id), at: Date.now() };
    onMove(String(active.id), String(over.id));
  };

  const open = columns.filter((c) => !c.outcome);
  const outcomes = columns.filter((c) => c.outcome);
  const shared = { columns, moveLabel, onMove };

  return (
    <DndContext
      id={useId()} // a stable id keeps the generated aria-describedby identical on server and client
      sensors={sensors}
      accessibility={{ announcements, screenReaderInstructions: { draggable: t("instructions") } }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div ref={board} role="region" aria-label={label} tabIndex={0} className="flex snap-x snap-mandatory items-start gap-3 overflow-x-auto overscroll-x-contain pb-2">
        {open.map((col) => (
          <StageColumn key={col.id} col={col} {...shared} />
        ))}
        {outcomes.length > 0 && (
          <div className={cn("flex flex-col gap-3", COLUMN_W)}>
            {outcomes.map((col) => (
              <OutcomeZone key={col.id} col={col} {...shared} />
            ))}
          </div>
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {active && (
          <div className={cn("flex scale-[1.03] rotate-[1.5deg] items-start gap-1 rounded-tile border border-line-2 p-3 pe-12 shadow-pop", TONE_TINT[active.column.tone ?? "sky"])}>
            <GripVerticalIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <CardBody card={active.card} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
