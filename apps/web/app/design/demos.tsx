"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Kanban, type KanbanColumn } from "@/components/patterns/kanban";
import { Button } from "@/components/ui/button";

export function KanbanDemo({ columns }: { columns: KanbanColumn[] }) {
  const t = useTranslations("design.kanban");
  const title = (id: string) => columns.find((c) => c.id === id)?.title ?? id;
  const deal = (id: string) => columns.flatMap((c) => c.cards).find((c) => c.id === id)?.title ?? id;
  // Showcase only: a real board calls the API, then refetches counts and Σ OMR from the server.
  return (
    <Kanban
      label={t("label")}
      columns={columns}
      moveLabel={t("move")}
      onMove={(cardId, to) => toast.success(t("moved", { deal: deal(cardId), stage: title(to) }))}
    />
  );
}

export function ToastButton() {
  const t = useTranslations("design.overlays");
  return (
    <Button variant="outline" onClick={() => toast.success(t("toastText"))}>
      {t("toast")}
    </Button>
  );
}
