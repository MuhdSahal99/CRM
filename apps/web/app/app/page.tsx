import { resolveContext } from "@crm/core";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return { title: t("metaTitle") };
}

// Landing page after sign-in; the app shell and modules arrive in later slices.
export default async function AppHome() {
  // The proxy only saw a cookie; the session itself is checked here, on every request.
  if (!(await resolveContext(await headers()))) redirect("/login");
  const t = await getTranslations("app");
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-2 px-4 py-16 sm:px-6">
      <h1 className="text-[2rem] leading-tight font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-base text-muted-foreground">{t("lead")}</p>
    </main>
  );
}
