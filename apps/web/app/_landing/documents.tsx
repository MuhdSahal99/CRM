"use client";

import { useState } from "react";
import { CheckIcon, FileTextIcon, PaperclipIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DocSheet } from "./doc-sheet";

const OUTPUTS = ["quote", "salesOrder", "email", "whatsapp"] as const;
type Output = (typeof OUTPUTS)[number];

/** Showcase "output index": the names are the controls, the stage shows the selected document. */
export function Documents() {
  const t = useTranslations("landing.docs");
  const [active, setActive] = useState<Output>("quote");

  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
      <div className="min-w-0 lg:col-span-5">
        <h2 className="text-[1.75rem] leading-tight font-semibold tracking-tight text-balance">{t("title")}</h2>
        <ul
          aria-label={t("listLabel")}
          className="mt-6 flex flex-wrap gap-x-5 gap-y-1 lg:flex-col lg:gap-1"
        >
          {OUTPUTS.map((o) => (
            <li key={o}>
              <button
                type="button"
                aria-pressed={active === o}
                onClick={() => setActive(o)}
                className={cn(
                  "landing-press whitespace-nowrap text-[1.75rem] font-semibold tracking-tight transition-colors lg:text-[clamp(2.125rem,4.4vw,4rem)] lg:leading-[1.1]",
                  active === o ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(o)}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div
        aria-live="polite"
        className="relative h-[70svh] min-w-0 overflow-hidden rounded-lg bg-muted p-3 sm:p-10 lg:col-span-7 lg:h-[88svh] lg:max-h-[52rem] lg:ps-16 lg:pt-18"
      >
        <div key={active} className="landing-fade">
          {active === "quote" && <DocSheet kind="quote" />}
          {active === "salesOrder" && <DocSheet kind="salesOrder" />}
          {active === "email" && <EmailSheet />}
          {active === "whatsapp" && <WhatsAppSheet />}
        </div>
      </div>
    </div>
  );
}

function EmailSheet() {
  const t = useTranslations("landing.docs");
  return (
    <article data-ui className="w-full rounded-md bg-card p-6 text-card-foreground sm:w-[28rem]">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt className="text-muted-foreground">{t("emailTo")}</dt>
        <dd className="truncate">{SAMPLE_TO}</dd>
        <dt className="text-muted-foreground">{t("emailSubjectLabel")}</dt>
        <dd className="font-medium">{t("emailSubject")}</dd>
      </dl>
      <div className="mt-6 space-y-4 leading-relaxed">
        <p>{t("emailBody")}</p>
        <p className="text-muted-foreground">{t("emailSign")}</p>
      </div>
      <p className="mt-6 inline-flex items-center gap-2 rounded-md bg-muted px-3 py-2">
        <PaperclipIcon className="size-4" aria-hidden />
        <FileTextIcon className="size-4 text-destructive" aria-hidden />
        {t("attachment")}
      </p>
    </article>
  );
}

function WhatsAppSheet() {
  const t = useTranslations("landing.docs");
  const locale = useLocale();
  return (
    <article data-ui className="w-full rounded-md bg-card p-6 text-card-foreground sm:w-[22rem]">
      <p className="text-muted-foreground">
        {t("waTo")} <bdi dir="ltr">{SAMPLE_MOBILE}</bdi>
      </p>
      <p className="mt-4 rounded-lg bg-accent p-4 leading-relaxed text-accent-foreground">
        {t("waBody", { total: formatMoney("358.000", "OMR", locale) })}
      </p>
      <p className="mt-4 text-muted-foreground">{t("waExpiry")}</p>
      <p className="mt-6 inline-flex items-center gap-2 text-success">
        <CheckIcon className="size-4" aria-hidden />
        {t("waLogged")}
      </p>
    </article>
  );
}

// Sample records (record data, not UI text).
const SAMPLE_TO = "Salim Al Harthy <salim@soharlogistics.om>";
const SAMPLE_MOBILE = "+968 9123 4567";
