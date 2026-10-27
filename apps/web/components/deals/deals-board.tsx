"use client";

import { useTranslations } from "next-intl";
import { Kanban, type KanbanColumn } from "@/components/patterns/kanban";
import { LostReasonDialog, type Reason } from "./lost-reason-dialog";
import { type StageRef, useMoveDeal } from "./use-move-deal";

type Props = { columns: KanbanColumn[]; stages: StageRef[]; versions: Record<string, number>; reasons: Reason[] };

/** US-07: the pipeline board. Counts and Σ OMR are the server's; a move saves, then the page refreshes. */
export function DealsBoard({ columns, stages, versions, reasons }: Props) {
  const t = useTranslations("deals");
  const m = useMoveDeal(stages);
  return (
    <div className="flex flex-col gap-3">
      {m.error && !m.askReason && (
        <p role="alert" className="text-sm text-destructive">
          {m.error}
        </p>
      )}
      <Kanban label={t("board")} columns={columns} moveLabel={t("moveToStage")} onMove={(cardId, stageId) => m.move(cardId, versions[cardId]!, stageId)} />
      <LostReasonDialog open={Boolean(m.askReason)} reasons={reasons} pending={m.pending} onCancel={m.cancel} onConfirm={m.confirm} />
    </div>
  );
}
