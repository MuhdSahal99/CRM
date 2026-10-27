import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireContext } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return { title: t("metaTitle") };
}

// Home after sign-in; modules arrive with their slices.
export default async function AppHome() {
  await requireContext(); // layouts are not re-run on client navigation, so every page checks too
  const t = await getTranslations("app");
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-[2rem] leading-tight font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-base text-muted-foreground">{t("lead")}</p>
    </div>
  );
}
