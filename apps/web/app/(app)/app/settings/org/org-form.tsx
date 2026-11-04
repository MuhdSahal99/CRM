"use client";

import { Building2Icon, MailIcon, Share2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { ProfileCard, SettingsLayout } from "@/components/patterns/settings-layout";
import { formatPercent } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callApi, fieldErrors } from "@/lib/api-client";

// [api_name, input type, max length]. Blank optional fields are sent as null; blank required ones are left out.
const FIELDS = [
  ["legal_name", "text", 200], ["vat_number", "text", 20], ["address_line1", "text", 250], ["address_line2", "text", 250],
  ["city", "text", 30], ["postal_code", "text", 30], ["country", "text", 2], ["share_link_ttl_days", "number", 2],
  ["smtp_host", "text", 255], ["smtp_port", "number", 5], ["smtp_username", "text", 255], ["smtp_from_email", "email", 255], ["smtp_from_name", "text", 120],
] as const;
const TABS = {
  seller: ["legal_name", "vat_number", "address_line1", "address_line2", "city", "postal_code", "country"],
  sharing: ["share_link_ttl_days"],
  email: ["smtp_host", "smtp_port", "smtp_username", "smtp_from_email", "smtp_from_name"],
} as const;
const REQUIRED = new Set(["legal_name", "country", "share_link_ttl_days"]);
const NUMBERS = new Set(["share_link_ttl_days", "smtp_port"]);

export type OrgSettings = Record<(typeof FIELDS)[number][0], string | number | null> & { version: number; smtp_secret_configured: boolean };

export function OrgForm({ settings }: { settings: OrgSettings }) {
  const t = useTranslations("settings.org");
  const locale = useLocale();
  const form = useRef<HTMLFormElement>(null);
  const [tab, setTab] = useState<keyof typeof TABS>("seller");
  const [dirty, setDirty] = useState(false);
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
      setDirty(false);
      router.refresh();
    } else if (code === 422) {
      setErrors(fieldErrors(json.details?.errors ?? [{ api_name: json.details?.api_name, message: json.message }]));
    } else {
      setStatus(code === 409 ? "conflict" : "failed");
    }
  }

  const filled = FIELDS.filter(([api]) => settings[api] !== null && settings[api] !== "").length;
  const pct = (filled / FIELDS.length) * 100;
  const profile = (
    <ProfileCard
      name={String(settings.legal_name ?? "")}
      role={t("profile.role")}
      email={String(settings.smtp_from_email ?? t("profile.noEmail"))}
      highlight={{ title: t("profile.completeness"), caption: t("profile.filled", { filled, total: FIELDS.length }), value: pct, valueLabel: formatPercent(pct, locale), progressLabel: t("profile.completeness") }}
      stats={[
        { label: t("profile.linkDays"), value: String(settings.share_link_ttl_days ?? "—") },
        { label: t("profile.country"), value: String(settings.country ?? "—") },
        { label: t("profile.smtp"), value: t(settings.smtp_secret_configured ? "profile.on" : "profile.off") },
      ]}
      next={{ eyebrow: t("profile.next"), title: t("profile.nextTitle"), href: "/app/settings/vat", barClass: "border-s-lime" }}
    />
  );

  return (
    <SettingsLayout
      profile={profile}
      tabsLabel={t("tabs")}
      tabs={[
        { value: "seller", label: t("tab.seller"), icon: <Building2Icon /> },
        { value: "sharing", label: t("tab.sharing"), icon: <Share2Icon /> },
        { value: "email", label: t("tab.email"), icon: <MailIcon /> },
      ]}
      tab={tab}
      onTabChange={(v) => setTab(v as keyof typeof TABS)}
      dirty={dirty && !pending}
      onDiscard={() => {
        form.current?.reset();
        setErrors({});
        setDirty(false);
      }}
      onSave={() => form.current?.requestSubmit()}
      discardLabel={t("discard")}
      saveLabel={t("save")}
    >
      <form ref={form} onSubmit={onSubmit} onChange={() => setDirty(true)} className="flex flex-col gap-6" aria-busy={pending} key={settings.version}>
        {(Object.keys(TABS) as (keyof typeof TABS)[]).map((group) => (
          <div key={group} hidden={tab !== group} className="grid gap-4 sm:grid-cols-2">
            {FIELDS.filter(([api]) => (TABS[group] as readonly string[]).includes(api)).map(([api, type, max]) => (
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
        ))}
        {tab === "email" && <p className="text-sm text-muted-foreground">{t(settings.smtp_secret_configured ? "secretSet" : "secretNotSet")}</p>}
        {status !== "idle" && (
          <p role={status === "saved" ? "status" : "alert"} className={status === "saved" ? "text-sm" : "text-sm text-destructive"}>
            {t(status)}
          </p>
        )}
      </form>
    </SettingsLayout>
  );
}
