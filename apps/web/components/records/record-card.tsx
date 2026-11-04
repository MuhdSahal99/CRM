import { MailIcon, PhoneIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Tile, Well } from "@/components/ui/glass-card";
import { iconButtonVariants } from "@/components/ui/icon-button";
import { recordTitle } from "@/lib/record-view";
import type { FieldMeta, ModuleMeta, RecordData } from "@/lib/records";
import { FieldValue } from "./field-value";

const textOf = (v: unknown) => (v && typeof v === "object" ? String((v as { name?: unknown }).name ?? "") : v == null ? "" : String(v));

/** Grid-view entity card (GLASS_SPEC § Profile card): avatar and name, a well with two fields, round mail / call links. */
export function RecordCard({ module, meta, row, columns }: { module: string; meta: ModuleMeta; row: RecordData; columns: FieldMeta[] }) {
  const t = useTranslations();
  const title = recordTitle(meta, row) || t("records.noValue");
  const sub = textOf(row[columns.find((c) => c.data_type === "lookup")?.api_name ?? ""]);
  const email = columns.find((c) => c.data_type === "email");
  const phone = columns.find((c) => c.data_type === "phone");
  const stats = columns.filter((c) => c.data_type !== "lookup").slice(0, 2);
  return (
    <Tile interactive data-slot="tile" className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar name={title} size="lg" />
        <div className="min-w-0">
          <Link href={`/app/${module}/${row.id}`} className="block truncate text-base font-semibold outline-none after:absolute after:inset-0 hover:underline focus-visible:underline">
            {title}
          </Link>
          {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
        </div>
      </div>
      {stats.length > 0 && (
        <Well className="grid grid-cols-2 gap-3">
          {stats.map((f) => (
            <div key={f.api_name} className="min-w-0">
              <p className="truncate text-[11px] text-muted-foreground">{t(f.label_key)}</p>
              <p className="truncate text-sm font-semibold">
                <FieldValue field={f} value={row[f.api_name]} />
              </p>
            </div>
          ))}
        </Well>
      )}
      <div className="relative z-10 mt-auto flex justify-end gap-2">
        {typeof row[email?.api_name ?? ""] === "string" && (
          <a href={`mailto:${String(row[email!.api_name])}`} aria-label={t("records.emailTo", { name: title })} className={iconButtonVariants({ variant: "outline" })}>
            <MailIcon />
          </a>
        )}
        {typeof row[phone?.api_name ?? ""] === "string" && (
          <a href={`tel:${String(row[phone!.api_name])}`} aria-label={t("records.callTo", { name: title })} className={iconButtonVariants({ variant: "outline" })}>
            <PhoneIcon />
          </a>
        )}
      </div>
    </Tile>
  );
}
