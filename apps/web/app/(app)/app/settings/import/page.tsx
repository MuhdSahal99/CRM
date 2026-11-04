import { IMPORT_MODULES, IMPORT_MODULE_NAMES, listFields, withTenant } from "@crm/core";
import type { Metadata } from "next";
import { FileSpreadsheetIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MotionScope } from "@/components/patterns/motion-scope";
import { PageHeader } from "@/components/patterns/page-header";
import { StatChip } from "@/components/ui/status";
import { requireContext } from "@/lib/session";
import { ImportWizard, type ModuleSetup } from "./import-wizard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("import");
  return { title: t("metaTitle") };
}

// T11.09 (US-17, Admin): upload a Zoho CSV, map its columns, read the dry-run report, confirm, download the failed rows.
export default async function ImportPage() {
  const ctx = await requireContext();
  if (ctx.role !== "admin") notFound(); // 404, never 403 (ADR-0005)
  const t = await getTranslations("import");
  // The columns each module's file may be mapped onto: the writable fields of its layout (the server still checks every mapping).
  const modules = await withTenant(ctx, async (tx) =>
    Promise.all(
      IMPORT_MODULE_NAMES.map(async (name): Promise<ModuleSetup> => {
        const fields = (await listFields(tx, name)) as { api_name: string; label_key: string; read_only: boolean }[];
        return { name, defaults: IMPORT_MODULES[name].defaults, fields: fields.filter((f) => !f.read_only).map((f) => ({ api_name: f.api_name, label_key: f.label_key })) };
      }),
    ),
  );
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={[t("title1"), t("title2")]}
        stats={<StatChip icon={<FileSpreadsheetIcon />} value={<span data-count="number" data-to={modules.length}>{modules.length}</span>} label={t("statModules")} />}
      />
      <p className="-mt-3 max-w-prose text-sm text-muted-foreground">{t("lead")}</p>
      <MotionScope className="grid grid-cols-1 gap-(--gap)">
        <ImportWizard modules={modules} />
      </MotionScope>
    </div>
  );
}
