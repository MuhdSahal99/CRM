import Link from "next/link";
import { useTranslations } from "next-intl";
import { Money } from "@/components/money";
import type { FieldMeta, Lookup } from "@/lib/records";

/** One stored value, displayed by its field type. Phones, emails and links stay LTR inside RTL text (ADR-0016). */
export function FieldValue({ field, value }: { field: FieldMeta; value: unknown }) {
  const t = useTranslations();
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">{t("records.noValue")}</span>;
  const text = String(value);
  switch (field.data_type) {
    case "lookup": {
      const ref = value as Lookup;
      return field.lookup_module ? <Link href={`/app/${field.lookup_module}/${ref.id}`} className="hover:underline">{ref.name}</Link> : ref.name;
    }
    case "user_lookup":
      return (value as Lookup).name;
    case "picklist": {
      const option = field.picklist_values.find((p) => p.value === value);
      return option ? t(option.label_key) : text; // an inactive value keeps showing as stored
    }
    case "boolean":
      return t(value ? "records.yes" : "records.no");
    case "phone":
      return <a href={`tel:${text}`} dir="ltr" className="hover:underline">{text}</a>;
    case "email":
      return <a href={`mailto:${text}`} className="hover:underline"><bdi>{text}</bdi></a>;
    case "url":
      // Only http(s) is accepted on input; still never render another scheme as a link (imported data).
      return /^https?:\/\//i.test(text) ? <a href={text} target="_blank" rel="noopener noreferrer" className="hover:underline"><bdi>{text}</bdi></a> : <bdi>{text}</bdi>;
    case "currency":
      return <Money value={text} currency="OMR" />;
    default:
      return text;
  }
}
