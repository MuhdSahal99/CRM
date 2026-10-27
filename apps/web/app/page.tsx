import "./_landing/landing.css";
import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { LockIcon, MailIcon, MessageCircleIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Money } from "@/components/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Cycle } from "./_landing/cycle";
import { Documents } from "./_landing/documents";
import { ProductPreview } from "./_landing/product-preview";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

const MAIL = "mailto:hello@saqient.com?subject=Saqient%20CRM%20for%20our%20sales%20team";
const NAV = ["documents", "oman", "cycle", "questions"] as const;
const FEATURES = ["money", "vat", "deals", "phone"] as const;
const FACTS = ["currency", "vat", "send"] as const;
const LINES = ["l1", "l2", "l3", "l4"] as const;
const FAQ_KEY = "faq.items";
const LOGIN = "/login";
// PRD US-10 worked example, as the server would return it.
const VAT_SUMMARY = [
  ["standard", "270.000", "13.500"],
  ["zero_rated", "50.000", "0.000"],
  ["exempt", "24.690", null],
] as const;

/** Entrance stagger for the parts of a section (landing.css `.landing-rise`, scroll-driven, CSS only). */
const rise = (d: number) => ({ "--d": d }) as CSSProperties;
// Sample records shown on the public page (record data, not UI text).
const SAMPLE = { deal: "Muscat Port fit-out", account: "Al Bustan Trading LLC", contact: "Salim Al Harthy", quote: "QT-000412", email: "hello@saqient.com" };

export default async function LandingPage() {
  const t = await getTranslations("landing");
  const tBrand = await getTranslations("brand");

  return (
    <>
      <header className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {tBrand("name")}
        </Link>
        <nav aria-label={t("nav.label")} className="hidden items-center gap-6 md:flex">
          {NAV.map((id) => (
            <a key={id} href={`#${id}`} className="landing-press text-muted-foreground hover:text-foreground">
              {t(`nav.${id}`)}
            </a>
          ))}
        </nav>
        <Button asChild>
          <Link href="/login">{t("nav.signIn")}</Link>
        </Button>
      </header>

      <main>
        {/* Hero: the pitch on one side, the product itself (drawn with the design system) on the other. */}
        <section className="grid gap-3 px-4 sm:px-6 lg:min-h-[calc(100svh-4rem)] lg:grid-cols-2 lg:pb-6">
          <div className="flex min-w-0 flex-col justify-between gap-12 rounded-lg bg-card p-6 sm:p-10 lg:p-12">
            <div>
              <h1 className="text-[clamp(2.125rem,4.4vw,4rem)] leading-[1.02] font-semibold tracking-tight text-balance">
                {t("hero.title")}
              </h1>
              <p className="mt-8 max-w-[44ch] text-lg leading-relaxed">{t("hero.lead")}</p>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                <Button asChild size="lg" className="px-5">
                  <Link href="/login">{t("hero.primary")}</Link>
                </Button>
                <a href="#documents" className="landing-press font-medium text-primary underline-offset-4 hover:underline">
                  {t("hero.secondary")}
                </a>
              </div>
            </div>
            <dl className="grid gap-4 sm:grid-cols-3">
              {FACTS.map((k) => (
                <div key={k}>
                  <dt className="text-muted-foreground">{t(`hero.facts.${k}Term`)}</dt>
                  <dd className="mt-1 text-base font-medium">{t(`hero.facts.${k}`)}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="flex min-w-0 flex-col justify-center rounded-lg bg-muted p-3 sm:p-8 lg:p-10">
            <ProductPreview />
          </div>
        </section>

        <section id="documents" className="scroll-mt-4 px-4 py-24 sm:px-6 lg:py-32">
          <Documents />
        </section>

        <section id="oman" className="scroll-mt-0 bg-primary px-4 py-24 text-primary-foreground sm:px-6 lg:py-32">
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
            <h2 className="self-start text-[clamp(2.125rem,4.4vw,4rem)] leading-[1.02] font-semibold tracking-tight text-balance lg:sticky lg:top-8 lg:col-span-5">
              {t("oman.title")}
            </h2>
            <div className="flex min-w-0 flex-col gap-18 lg:col-span-6 lg:col-start-7 lg:gap-24">
              {FEATURES.map((f, i) => (
                <article key={f}>
                  <h3 style={rise(0)} className="landing-rise text-[1.75rem] font-semibold tracking-tight">
                    {t(`oman.${f}.title`)}
                  </h3>
                  <div className="mt-6 grid gap-6 sm:grid-cols-[14rem_1fr] sm:gap-8">
                    <div style={rise(10)} className={cn("landing-rise", i % 2 === 1 && "sm:order-2")}>
                      <FeatureFragment kind={f} />
                    </div>
                    <ul style={rise(20)} className="landing-rise flex flex-col gap-3.5 text-lg leading-snug">
                      {LINES.map((l) => (
                        <li key={l}>{t(`oman.${f}.${l}`)}</li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="cycle" className="scroll-mt-4 px-4 py-24 sm:px-6 lg:py-32">
          <Cycle />
        </section>

        <section id="questions" className="scroll-mt-4 px-4 pb-24 sm:px-6 lg:pb-32">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-3">
              <h2 style={rise(0)} className="landing-rise text-[1.75rem] font-semibold tracking-tight">
                {t("faq.title")}
              </h2>
              <p className="mt-6 max-w-[34ch] text-lg leading-snug">{t("cta.text")}</p>
              <div className="mt-6 flex items-center gap-6">
                <Button asChild size="lg" className="px-5">
                  <a href={MAIL}>{t("cta.button")}</a>
                </Button>
                <Link href={LOGIN} className="landing-press font-medium text-primary underline-offset-4 hover:underline">
                  {t("cta.signIn")}
                </Link>
              </div>
            </div>
            <div className="min-w-0 gap-14 md:columns-2 lg:col-span-8 lg:col-start-5">
              {(t.raw(FAQ_KEY) as { q: string; a: string }[]).map((item) => (
                <p key={item.q} className="mb-5 break-inside-avoid text-base leading-[1.55]">
                  <span className="font-medium">{item.q}</span> {item.a}
                </p>
              ))}
            </div>
          </div>
        </section>

      </main>

      <footer className="bg-muted">
        <div className="grid gap-16 px-4 py-16 sm:px-10 lg:grid-cols-2 lg:p-16 lg:pt-20">
          <nav aria-label={t("footer.menuLabel")} className="flex flex-col gap-16">
            <p className="font-semibold">{t("footer.title")}</p>
            <ul className="flex flex-col gap-5 lg:gap-7">
              {[...NAV.map((id) => [`#${id}`, t(`nav.${id}`)] as const), [LOGIN, t("nav.signIn")] as const].map(([href, label]) => (
                <li key={href}>
                  <a href={href} className="inline-block text-[1.75rem] leading-tight font-semibold tracking-tight transition-transform hover:translate-x-3 rtl:hover:-translate-x-3">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex flex-col gap-6 self-end text-sm">
            <div>
              <h2 className="font-semibold">{t("footer.contactTitle")}</h2>
              <p className="mt-1">
                <a href={MAIL} className="underline underline-offset-4">{SAMPLE.email}</a>
              </p>
              <p>{t("footer.place")}</p>
            </div>
            <p className="text-muted-foreground">{t("footer.legal")}</p>
          </div>
        </div>
      </footer>
    </>
  );
}

async function FeatureFragment({ kind }: { kind: (typeof FEATURES)[number] }) {
  const t = await getTranslations("landing.oman");
  const tSheet = await getTranslations("landing.sheet");
  const tStage = await getTranslations("stages");
  const row = "flex items-baseline justify-between gap-3";

  if (kind === "money")
    return (
      <Frag label={t("money.label")}>
        <p className="text-2xl font-semibold"><Money value="358.000" currency="OMR" /></p>
        <p className="text-lg"><Money value="38500.00" currency="AED" /></p>
        <p className="text-lg"><Money value="1250000.00" currency="INR" /></p>
        <p className="mt-auto text-muted-foreground tabular-nums">{t("money.rate", { rate: "AED 0.10500000" })}</p>
      </Frag>
    );
  if (kind === "vat")
    return (
      <Frag label={t("vat.label")}>
        {VAT_SUMMARY.map(([cat, base, vat]) => (
          <div key={cat}>
            <p className="font-medium">{tSheet(`cat.${cat}`)}</p>
            <p className={cn(row, "text-muted-foreground")}>
              <Money value={base} currency="OMR" />
              {vat && <Money value={vat} currency="OMR" />}
            </p>
          </div>
        ))}
        <p className={cn(row, "mt-auto font-semibold")}>
          {tSheet("vatTotal")}
          <Money value="13.500" currency="OMR" />
        </p>
      </Frag>
    );
  if (kind === "deals")
    return (
      <Frag label={t("deals.label")}>
        <Badge variant="outline" className="border-info/40 text-info">{tStage("proposal")}</Badge>
        <p className="text-base font-semibold">{SAMPLE.deal}</p>
        <p className="text-muted-foreground">{SAMPLE.account}</p>
        <p className="text-lg"><Money value="10000.000" currency="OMR" /></p>
        <p className="mt-auto text-muted-foreground">{t("deals.probability", { p: 75 })}</p>
        <p className={row}>
          {t("deals.expected")}
          <Money value="7500.000" currency="OMR" />
        </p>
      </Frag>
    );
  return (
    <Frag label={t("phone.label")}>
      <p className="font-semibold">{SAMPLE.quote}</p>
      <p className="text-muted-foreground">{SAMPLE.contact}</p>
      <span className="mt-auto inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 font-medium text-primary-foreground">
        <MessageCircleIcon className="size-4" aria-hidden />
        {t("phone.button")}
      </span>
      <span className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-muted px-3 font-medium">
        <MailIcon className="size-4" aria-hidden />
        {t("phone.email")}
      </span>
      <p className="inline-flex items-center gap-1.5 text-muted-foreground">
        <LockIcon className="size-3.5" aria-hidden />
        {t("phone.expires")}
      </p>
    </Frag>
  );
}

function Frag({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure data-ui aria-label={label} className="flex flex-col gap-3 rounded-md bg-card p-4 text-sm text-card-foreground sm:min-h-[17rem]">
      {children}
    </figure>
  );
}
