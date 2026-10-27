"use client";

import { CheckIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { callApi } from "@/lib/api-client";

/** US-15: marks a task Completed at the version the page loaded; it then leaves My Activities on refresh. */
export function CompleteButton({ id, version, subject }: { id: string; version: number; subject: string }) {
  const t = useTranslations("activities");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function complete() {
    setPending(true);
    setFailed(false);
    const { status } = await callApi("PUT", `/Tasks/${id}`, { data: [{ Status: "Completed", version }] });
    setPending(false);
    if (status === 200) router.refresh();
    else setFailed(true);
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={complete} aria-label={t("completeTask", { subject })}>
        {pending ? <Loader2Icon className="animate-spin" aria-hidden /> : <CheckIcon aria-hidden />}
        {t("complete")}
      </Button>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("failed")}
        </p>
      )}
    </div>
  );
}
