"use client";

import { useState } from "react";
import { LockIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Money } from "@/components/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STOPS = ["lead", "deal", "quote", "invoice"] as const;

/** How it works: one range input drives the sentence and the matching piece of the product. */
export function Cycle() {
  const t = useTranslations("landing.cycle");
  const [i, setI] = useState(2);
  const stop = STOPS[i];

  return (
    <div className="overflow-hidden rounded-lg">
      <div className="grid lg:grid-cols-2">
        <div className="order-2 flex flex-col gap-6 bg-primary p-6 text-primary-foreground sm:p-10 lg:order-1 lg:min-h-[34rem] lg:p-12">
          <h2 className="max-w-[16ch] text-[clamp(2.125rem,4.4vw,4rem)] leading-[1.02] font-semibold tracking-tight">{t("title")}</h2>
          <p key={stop} aria-live="polite" className="landing-fade max-w-[34ch] text-lg leading-snug">
            {t(`${stop}.text`)}
          </p>
        </div>
        <div className="order-1 flex min-h-[20rem] items-center justify-center bg-muted p-4 sm:p-10 lg:order-2">
          <div key={stop} className="landing-fade w-full max-w-[27.5rem]">
            <Fragment stop={stop} />
          </div>
        </div>
      </div>
      <div className="bg-card px-6 pt-6 pb-5 sm:px-10">
        <input
          type="range"
          min={0}
          max={STOPS.length - 1}
          step={1}
          value={i}
          onChange={(e) => setI(Number(e.target.value))}
          aria-label={t("label")}
          aria-valuetext={t(`${stop}.name`)}
          className="landing-range w-full"
          style={{ "--fill": `${(i / (STOPS.length - 1)) * 100}%` } as React.CSSProperties}
        />
        <ol className="mt-3 grid grid-cols-4">
          {STOPS.map((s, j) => (
            <li key={s} className={cn("text-center first:text-start last:text-end", j === i ? "font-semibold text-foreground" : "text-muted-foreground")}>
              <button type="button" tabIndex={-1} onClick={() => setI(j)} className="landing-press">
                {t(`${s}.name`)}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Fragment({ stop }: { stop: (typeof STOPS)[number] }) {
  const t = useTranslations("landing.cycle.f");
  const tStage = useTranslations("stages");
  const format = useFormatter();
  const row = "flex items-baseline justify-between gap-4 py-1.5";
  return (
    <article data-ui className="rounded-md bg-card p-5 text-card-foreground">
      {stop === "lead" && (
        <>
          <p className="text-xs text-muted-foreground">{t("lead")}</p>
          <h3 className="mt-1 text-lg font-semibold">{SAMPLE.contact}</h3>
          <p className="text-muted-foreground">{SAMPLE.account}</p>
          <p className={cn(row, "mt-3")}>
            <span className="text-muted-foreground">{t("source")}</span>
            {t("exhibition")}
          </p>
          <Button asChild className="mt-4 w-full"><span>{t("convert")}</span></Button>
        </>
      )}
      {stop === "deal" && (
        <>
          <p className="text-xs text-muted-foreground">{t("deal")}</p>
          <h3 className="mt-1 text-lg font-semibold">{SAMPLE.deal}</h3>
          <p className="text-muted-foreground">{SAMPLE.account}</p>
          <div className="mt-3">
            <p className={row}>
              <span className="text-muted-foreground">{t("stage")}</span>
              <Badge variant="outline" className="border-info/40 text-info">{tStage("proposal")}</Badge>
            </p>
            <p className={row}>
              <span className="text-muted-foreground">{t("probability")}</span>
              <span className="tabular-nums">75%</span>
            </p>
            <p className={row}>
              <span className="text-muted-foreground">{t("expected")}</span>
              <Money value="7500.000" currency="OMR" />
            </p>
          </div>
        </>
      )}
      {stop === "quote" && (
        <>
          <p className="text-xs text-muted-foreground">{t("quote")}</p>
          <h3 className="mt-1 text-lg font-semibold">{SAMPLE.quote}</h3>
          <p className="text-muted-foreground">{SAMPLE.deal}</p>
          <div className="mt-3">
            <p className={row}>
              <span className="text-muted-foreground">{t("lines")}</span>
              <span className="tabular-nums">3</span>
            </p>
            <p className={cn(row, "font-semibold")}>
              <span>{t("grand")}</span>
              <Money value="358.000" currency="OMR" />
            </p>
          </div>
          <Button asChild variant="outline" className="mt-4 w-full"><span>{t("toSo")}</span></Button>
        </>
      )}
      {stop === "invoice" && (
        <>
          <p className="flex items-center justify-between text-xs text-muted-foreground">
            {t("invoice")}
            <span className="inline-flex items-center gap-1 text-success">
              <LockIcon className="size-3.5" aria-hidden />
              {t("locked")}
            </span>
          </p>
          <h3 className="mt-1 text-lg font-semibold">{SAMPLE.invoice}</h3>
          <p className="text-muted-foreground">
            {t("issued")} {format.dateTime(SAMPLE.issued, DATE)}
          </p>
          <div className="mt-3">
            <p className={row}>
              <span className="text-muted-foreground">{t("vat")}</span>
              <Money value="13.500" currency="OMR" />
            </p>
            <p className={cn(row, "font-semibold")}>
              <span>{t("grand")}</span>
              <Money value="358.000" currency="OMR" />
            </p>
          </div>
        </>
      )}
    </article>
  );
}

// Sample records shown on the public page (record data, not UI text).
const SAMPLE = {
  contact: "Salim Al Harthy",
  account: "Sohar Logistics SAOC",
  deal: "Muscat Port fit-out",
  quote: "QT-000412",
  invoice: "INV-000184",
  issued: new Date("2026-10-27T12:00:00+04:00"),
};
const DATE = { dateStyle: "medium" } as const;
