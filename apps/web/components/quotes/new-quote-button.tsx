"use client";

import { FilePlus2Icon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { callApi } from "@/lib/api-client";

/** T7.09 (US-10): starts a draft quote from a deal (same account, deal currency) and opens the line editor. */
export function NewQuoteButton({ dealId, dealName, accountId }: { dealId: string; dealName: string; accountId: string }) {
  const t = useTranslations("deals");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [key] = useState(() => crypto.randomUUID());

  async function create() {
    setPending(true);
    setFailed(false);
    const { status, json } = await callApi("POST", "/Quotes", { data: [{ Subject: dealName, Account_Name: { id: accountId }, Deal_Name: { id: dealId } }] }, { "idempotency-key": key });
    if (status === 201) router.push(`/app/Quotes/${json.data[0].details.id}/edit`);
    else {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button type="button" variant="outline" onClick={create} disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" aria-hidden /> : <FilePlus2Icon aria-hidden />}
        {t("newQuote")}
      </Button>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("newQuoteFailed")}
        </p>
      )}
    </div>
  );
}
