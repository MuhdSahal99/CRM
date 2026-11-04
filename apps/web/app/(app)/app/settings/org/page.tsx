import { getOrgSettings, withTenant } from "@crm/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireContext } from "@/lib/session";
import { ClockIcon } from "lucide-react";
import { MotionScope } from "@/components/patterns/motion-scope";
import { PageHeader } from "@/components/patterns/page-header";
import { StatChip } from "@/components/ui/status";
import { AppearanceCard } from "./appearance-card";
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
  const stats = (
    <>
      <StatChip icon={<ClockIcon />} value={<span data-count="number" data-to={Number(settings!.share_link_ttl_days ?? 0)}>{String(settings!.share_link_ttl_days ?? 0)}</span>} label={t("org.profile.linkDays")} />
    </>
  );
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={[t("org.title1"), t("org.title2")]} stats={stats} />
      <MotionScope className="grid grid-cols-1 gap-(--gap)">
        <OrgForm settings={settings!} />
        <AppearanceCard />
      </MotionScope>
    </div>
  );
}
