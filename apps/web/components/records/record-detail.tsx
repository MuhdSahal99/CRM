import { useTranslations } from "next-intl";
import { GlassCard } from "@/components/ui/glass-card";
import type { RecordData, SectionMeta } from "@/lib/records";
import { cn } from "@/lib/utils";
import { FieldValue } from "./field-value";

/** A record's fields, laid out like its form: one glass card per layout section (DESIGN_SYSTEM § Forms grid). */
export function RecordDetail({ sections, record }: { sections: SectionMeta[]; record: RecordData }) {
  const t = useTranslations();
  return (
    <>
      {sections.map((s) => (
        <GlassCard key={s.label_key} title={t(s.label_key)} aria-label={t(s.label_key)}>
          <dl className={cn("grid gap-x-6 gap-y-4", s.columns === 2 && "sm:grid-cols-2 2xl:grid-cols-3")}>
            {s.fields.map((f) => (
              <div key={f.api_name} className={cn("flex min-w-0 flex-col gap-0.5", f.data_type === "textarea" && "sm:col-span-full")}>
                <dt className="text-xs text-muted-foreground">{t(f.label_key)}</dt>
                <dd className="text-sm break-words">
                  <FieldValue field={f} value={record[f.api_name]} />
                </dd>
              </div>
            ))}
          </dl>
        </GlassCard>
      ))}
    </>
  );
}
