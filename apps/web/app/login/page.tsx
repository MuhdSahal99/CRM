import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import corniche from "@/public/landing/muttrah-corniche.jpg";
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
      <div className="relative hidden p-3 ps-0 lg:block">
        <div className="relative h-full overflow-hidden rounded-lg">
          <Image src={corniche} alt={t("photoAlt")} fill priority sizes="50vw" className="object-cover" />
        </div>
      </div>
    </div>
  );
}
