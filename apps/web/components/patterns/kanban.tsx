"use client";

import { MoreHorizontalIcon } from "lucide-react";
import { Money } from "@/components/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Currency } from "@/lib/format";

export type KanbanCard = { id: string; title: string; subtitle: string; amount: string; currency: Currency };
export type KanbanColumn = { id: string; title: string; count: number; totalOmr: string; cards: KanbanCard[] };

type Props = {
  label: string;
  columns: KanbanColumn[];
  /** "Move to stage" menu: the keyboard/touch alternative to dragging (WCAG 2.5.7). */
  moveLabel: string;
  onMove: (cardId: string, columnId: string) => void;
};

/** Pipeline board (DESIGN_SYSTEM.md § Kanban). Count and Σ OMR come from the server, never summed here. */
export function Kanban({ label, columns, moveLabel, onMove }: Props) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2"
    >
      {columns.map((col) => (
        <section key={col.id} aria-label={col.title} className="flex w-[85%] shrink-0 snap-start flex-col gap-2 rounded-lg bg-muted p-2 sm:w-72">
          <header className="flex flex-col gap-0.5 px-1">
            <h3 className="flex items-center justify-between gap-2 font-medium">
              {col.title}
              <Badge variant="secondary" className="bg-card tabular-nums">
                {col.count}
              </Badge>
            </h3>
            <p className="text-xs text-muted-foreground">
              <Money value={col.totalOmr} currency="OMR" />
            </p>
          </header>
          <ul className="flex flex-col gap-2">
            {col.cards.map((card) => (
              <li key={card.id} className="rounded-md border bg-card p-3 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{card.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{card.subtitle}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`${moveLabel}: ${card.title}`}>
                        <MoreHorizontalIcon aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>{moveLabel}</DropdownMenuLabel>
                      <DropdownMenuRadioGroup value={col.id} onValueChange={(to) => onMove(card.id, to)}>
                        {columns.map((c) => (
                          <DropdownMenuRadioItem key={c.id} value={c.id}>
                            {c.title}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <p className="mt-2 text-end">
                  <Money value={card.amount} currency={card.currency} />
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
