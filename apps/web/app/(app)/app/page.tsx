import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { HomeBody } from "@/components/home/home-body";
import { HomeSkeleton } from "@/components/home/home-skeleton";
import { requireContext } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return { title: t("metaTitle") };
}

// Home: pipeline, my day and recent records, all from existing reads under the caller's visibility (RLS).
export default async function AppHome() {
  await requireContext(); // layouts are not re-run on client navigation, so every page checks too
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeBody />
    </Suspense>
  );
}
