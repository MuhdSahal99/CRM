import { useTranslations } from "next-intl";
import type { RecordData, SectionMeta } from "@/lib/records";
import { cn } from "@/lib/utils";
import { FieldValue } from "./field-value";

/** A record's fields, laid out like its form: one section per layout section (DESIGN_SYSTEM § Forms grid). */
export function RecordDetail({ sections, record }: { sections: SectionMeta[]; record: RecordData }) {
  const t = useTranslations();
  return (
    <div className="flex flex-col gap-8">
      {sections.map((s) => (
        <section key={s.label_key} aria-label={t(s.label_key)} className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">{t(s.label_key)}</h2>
          <dl className={cn("grid gap-x-6 gap-y-3", s.columns === 2 && "sm:grid-cols-2 lg:grid-cols-3")}>
            {s.fields.map((f) => (
              <div key={f.api_name} className={cn("flex min-w-0 flex-col gap-0.5", f.data_type === "textarea" && "sm:col-span-full")}>
                <dt className="text-sm text-muted-foreground">{t(f.label_key)}</dt>
                <dd className="break-words">
                  <FieldValue field={f} value={record[f.api_name]} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
