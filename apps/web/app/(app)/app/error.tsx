"use client";

import { AlertCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassCard } from "@/components/ui/glass-card";

/** Any /app page that throws: an error state inside the shell, with a retry. */
export default function AppError({ retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("screens");
  return (
    <div role="alert" className="mx-auto w-full max-w-xl pt-10">
      <GlassCard title={t("error.title")}>
        <EmptyState icon={<AlertCircleIcon />} title={t("error.text")} action={<Button onClick={() => retry()}>{t("error.retry")}</Button>} />
      </GlassCard>
    </div>
  );
}
