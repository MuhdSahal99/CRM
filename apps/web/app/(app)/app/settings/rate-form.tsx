"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { callApi, fieldErrors } from "@/lib/api-client";

/** Adds one dated VAT rate or exchange rate (append-only: a change is a new row). */
export function RateForm({ kind, options }: { kind: "vat" | "fx"; options: string[] }) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [choice, setChoice] = useState(options[0]!);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID()); // one per attempt: a double submit adds one row
  const pick = kind === "vat" ? "category" : "currency";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setErrors({});
    setFailed(false);
    const { status, json } = await callApi(
      "POST",
      kind === "vat" ? "/settings/vat_rates" : "/settings/exchange_rates",
      { data: [{ [pick]: choice, rate: String(data.get("rate")).trim(), effective_from: String(data.get("effective_from")) }] },
      { "idempotency-key": key },
    );
    setPending(false);
    if (status === 201) {
      form.reset();
      setKey(crypto.randomUUID());
      router.refresh();
    } else if (status === 422) {
      setErrors(fieldErrors(json.details?.errors ?? [{ api_name: json.details?.api_name, message: json.message }]));
    } else {
      setFailed(true);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end" aria-busy={pending}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rate-choice">{t(`${kind}.${pick}`)}</Label>
        <Select value={choice} onValueChange={setChoice}>
          <SelectTrigger id="rate-choice" className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o} value={o}>
                {kind === "vat" ? t(`vat.categories.${o}`) : o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rate-value">{t(kind === "vat" ? "vat.rate" : "fx.rate")}</Label>
        <Input id="rate-value" name="rate" required inputMode="decimal" dir="ltr" className="text-end tabular-nums" aria-invalid={errors.rate ? true : undefined} />
        {errors.rate && <p className="text-sm text-destructive">{errors.rate}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rate-from">{t("effectiveFrom")}</Label>
        <Input id="rate-from" name="effective_from" type="date" required aria-invalid={errors.effective_from ? true : undefined} />
        {errors.effective_from && <p className="text-sm text-destructive">{errors.effective_from}</p>}
      </div>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" aria-hidden />}
        {t("addRate")}
      </Button>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("failed")}
        </p>
      )}
    </form>
  );
}
