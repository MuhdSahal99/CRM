"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callApi, fieldErrors } from "@/lib/api-client";

// [api_name, input type, max length]. Blank optional fields are sent as null; blank required ones are left out.
const FIELDS = [
  ["legal_name", "text", 200], ["vat_number", "text", 20], ["address_line1", "text", 250], ["address_line2", "text", 250],
  ["city", "text", 30], ["postal_code", "text", 30], ["country", "text", 2], ["share_link_ttl_days", "number", 2],
  ["smtp_host", "text", 255], ["smtp_port", "number", 5], ["smtp_username", "text", 255], ["smtp_from_email", "email", 255], ["smtp_from_name", "text", 120],
] as const;
const REQUIRED = new Set(["legal_name", "country", "share_link_ttl_days"]);
const NUMBERS = new Set(["share_link_ttl_days", "smtp_port"]);

export type OrgSettings = Record<(typeof FIELDS)[number][0], string | number | null> & { version: number; smtp_secret_configured: boolean };

export function OrgForm({ settings }: { settings: OrgSettings }) {
  const t = useTranslations("settings.org");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "saved" | "conflict" | "failed">("idle");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const data: Record<string, unknown> = { version: settings.version };
    for (const [api] of FIELDS) {
      const raw = String(form.get(api) ?? "").trim();
      if (raw === "") data[api] = REQUIRED.has(api) ? undefined : null;
      else data[api] = NUMBERS.has(api) ? Number(raw) : api === "country" ? raw.toUpperCase() : raw;
    }
    setPending(true);
    setErrors({});
    setStatus("idle");
    const { status: code, json } = await callApi("PUT", "/settings/org", { data: [data] });
    setPending(false);
    if (code === 200) {
      setStatus("saved");
      router.refresh();
    } else if (code === 422) {
      setErrors(fieldErrors(json.details?.errors ?? [{ api_name: json.details?.api_name, message: json.message }]));
    } else {
      setStatus(code === 409 ? "conflict" : "failed");
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" aria-busy={pending} key={settings.version}>
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map(([api, type, max]) => (
          <div key={api} className="flex flex-col gap-1.5">
            <Label htmlFor={`org-${api}`}>{t(`fields.${api}`)}</Label>
            <Input
              id={`org-${api}`}
              name={api}
              type={type}
              maxLength={type === "number" ? undefined : max}
              defaultValue={settings[api] ?? ""}
              inputMode={type === "number" ? "numeric" : undefined}
              dir={type === "email" ? "ltr" : undefined}
              aria-invalid={errors[api] ? true : undefined}
              aria-describedby={errors[api] ? `org-${api}-error` : undefined}
            />
            {errors[api] && (
              <p id={`org-${api}-error`} className="text-sm text-destructive">
                {errors[api]}
              </p>
            )}
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{t(settings.smtp_secret_configured ? "secretSet" : "secretNotSet")}</p>
      {status !== "idle" && (
        <p role={status === "saved" ? "status" : "alert"} className={status === "saved" ? "text-sm" : "text-sm text-destructive"}>
          {t(status)}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" aria-hidden />}
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
