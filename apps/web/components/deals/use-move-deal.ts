"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { callApi } from "@/lib/api-client";

export type StageRef = { id: string; record_category: string };

/**
 * Moves a deal to a stage with PUT /Deals/{id} at the version the page loaded. Closed Lost first asks for a reason
 * (`askReason` is set while the dialog is open; `cancel` leaves the deal where it was). The server recomputes everything,
 * so after a move the page just refreshes.
 */
export function useMoveDeal(stages: StageRef[]) {
  const t = useTranslations("deals");
  const router = useRouter();
  const [askReason, setAskReason] = useState<{ id: string; version: number; stageId: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function put(id: string, version: number, stageId: string, reason?: string) {
    setPending(true);
    setError(null);
    const { status, json } = await callApi("PUT", `/Deals/${id}`, { data: [{ version, Stage: { id: stageId }, ...(reason ? { Reason_For_Loss: reason } : {}) }] });
    setPending(false);
    if (status === 200) {
      setAskReason(null);
      router.refresh();
    } else setError(status === 409 ? t("conflict") : (json?.message ?? t("moveFailed")));
  }

  return {
    pending,
    error,
    askReason,
    move: (id: string, version: number, stageId: string) => {
      const stage = stages.find((s) => s.id === stageId);
      if (stage?.record_category === "closed_lost") setAskReason({ id, version, stageId });
      else void put(id, version, stageId);
    },
    confirm: (reason: string) => askReason && put(askReason.id, askReason.version, askReason.stageId, reason),
    cancel: () => {
      setAskReason(null);
      setError(null);
    },
  };
}
