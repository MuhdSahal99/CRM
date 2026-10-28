import { getOrgSettings, withTenant } from "@crm/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireContext } from "@/lib/session";
import { OrgForm, type OrgSettings } from "./org-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("org.metaTitle") };
}

// T6.07 (Admin): the seller details printed on invoices (US-11) and the sender settings (US-12).
export default async function OrgSettingsPage() {
  const ctx = await requireContext();
  if (ctx.role !== "admin") notFound(); // 404, never 403 (ADR-0005)
  const t = await getTranslations("settings");
  const [settings] = (await withTenant(ctx, getOrgSettings)) as OrgSettings[];
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("org.title")}</h1>
      <OrgForm settings={settings!} />
    </div>
  );
}
