import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ModuleMeta, RecordData } from "@/lib/records";
import { RecordList } from "./record-list";

export type RelatedTab = { api_name: string; module: string; label_key: string; meta: ModuleMeta; rows: RecordData[] };

/** US-06: a detail page's related lists, one tab each, with an "Add" that prefills the link back to this record. */
export function RelatedTabs({ module, id, tabs }: { module: string; id: string; tabs: RelatedTab[] }) {
  const t = useTranslations();
  if (tabs.length === 0) return null;
  return (
    <Tabs defaultValue={tabs[0]!.api_name}>
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.api_name} value={tab.api_name}>
            {t(tab.label_key)}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => {
        const backLink = tab.meta.fields.find((f) => f.data_type === "lookup" && f.lookup_module === module);
        const label = t(`modules.${tab.module}`);
        return (
          <TabsContent key={tab.api_name} value={tab.api_name} className="flex flex-col gap-3 pt-2">
            {backLink && (
              <Button asChild variant="outline" className="self-start">
                <Link href={`/app/${tab.module}/new?${backLink.api_name}=${id}`}>
                  <PlusIcon aria-hidden />
                  {t("records.add", { name: t(`records.singular.${tab.module}`).toLowerCase() })}
                </Link>
              </Button>
            )}
            <RecordList module={tab.module} meta={tab.meta} rows={tab.rows} caption={label} emptyText={t("records.empty", { module: label.toLowerCase() })} />
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
