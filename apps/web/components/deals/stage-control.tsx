"use client";

import { useTranslations } from "next-intl";
import { GlassCard } from "@/components/ui/glass-card";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { LostReasonDialog, type Reason } from "./lost-reason-dialog";
import { useMoveDeal } from "./use-move-deal";

type Stage = { id: string; name_key: string; record_category: string };

/** US-07: change a deal's stage on its detail page. The server sets probability and forecast category and logs the change. */
export function StageControl({ id, version, stageId, stages, reasons }: { id: string; version: number; stageId: string; stages: Stage[]; reasons: Reason[] }) {
  const t = useTranslations();
  const m = useMoveDeal(stages);
  return (
    <GlassCard title={t("deals.stage")} className="gap-3">
      <div className="flex flex-col gap-1.5">
      <Label htmlFor="deal-stage">{t("deals.changeStage")}</Label>
      <NativeSelect id="deal-stage" className="md:w-72" value={stageId} disabled={m.pending} onChange={(e) => m.move(id, version, e.target.value)}>
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {t(s.name_key)}
          </option>
        ))}
      </NativeSelect>
      {m.error && !m.askReason && (
        <p role="alert" className="text-sm text-destructive">
          {m.error}
        </p>
      )}
      <LostReasonDialog open={Boolean(m.askReason)} reasons={reasons} pending={m.pending} onCancel={m.cancel} onConfirm={m.confirm} />
      </div>
    </GlassCard>
  );
}
