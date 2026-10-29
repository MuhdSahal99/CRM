import { IMPORT_MODULES, IMPORT_MODULE_NAMES, listFields, withTenant } from "@crm/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
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
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="max-w-prose text-muted-foreground">{t("lead")}</p>
      <ImportWizard modules={modules} />
    </div>
  );
}
