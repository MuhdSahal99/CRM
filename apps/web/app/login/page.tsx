import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import "../_landing/landing.css";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("login");
  return { title: t("metaTitle") };
}

export default async function LoginPage() {
  const t = await getTranslations("login");
  const tBrand = await getTranslations("brand");

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <main className="flex flex-col px-4 py-6 sm:px-6">
        <Link href="/" aria-label={t("home")} className="self-start text-lg font-semibold tracking-tight">
          {tBrand("name")}
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-16">
          <h1 className="text-[2.5rem] leading-tight font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-2 mb-8 text-base text-muted-foreground">{t("lead")}</p>
          <LoginForm />
        </div>
      </main>
      {/* Brand panel: tokens only (a dot grid over the primary colour), no photograph; desktop only. */}
      <div className="hidden p-3 ps-0 lg:block">
        <div className="login-brand flex h-full flex-col justify-end gap-3 rounded-lg p-12">
          <p className="text-[2.5rem] leading-tight font-semibold tracking-tight">{tBrand("name")}</p>
          <p className="max-w-[36ch] text-lg opacity-80">{t("tagline")}</p>
        </div>
      </div>
    </div>
  );
}
