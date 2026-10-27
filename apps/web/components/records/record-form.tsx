"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { callApi, fieldErrors } from "@/lib/api-client";
import type { FieldMeta, Lookup, RecordData, SectionMeta } from "@/lib/records";
import { cn } from "@/lib/utils";

type Value = string | boolean;
type Props = {
  module: string;
  sections: SectionMeta[];
  /** Lookup field api_name → the records it may point at. */
  options: Record<string, Lookup[]>;
  record?: RecordData;
  defaults?: Record<string, string>;
};

const NONE = "none"; // Radix Select has no empty value
const NUMERIC = ["integer", "decimal", "currency", "percent"];
const isLookup = (f: FieldMeta) => f.data_type === "lookup" || f.data_type === "user_lookup";
const editable = (f: FieldMeta) => !f.read_only && f.access === "read_write" && f.data_type !== "autonumber";

/** A stored value as the form holds it: ids for lookups, booleans for checkboxes, strings for the rest. */
function initial(f: FieldMeta, v: unknown): Value {
  if (f.data_type === "boolean") return v === true;
  if (isLookup(f)) return (v as Lookup | null)?.id ?? "";
  return v == null ? "" : String(v);
}

/** The form value as the API takes it (ADR-0015 field shapes); "" is "no value". */
function toApi(f: FieldMeta, v: Value): unknown {
  if (f.data_type === "boolean") return v;
  if (v === "") return null;
  if (isLookup(f)) return { id: v };
  if (f.data_type === "integer" && /^-?\d+$/.test(v as string)) return Number(v);
  return v; // the server validates and answers 422 per field
}

/** T2.12: create or edit a record, rendered from its layout (DESIGN_SYSTEM § Forms). Errors come from the server's 422. */
export function RecordForm({ module, sections, options, record, defaults = {} }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const fields = sections.flatMap((s) => s.fields).filter(editable);
  const start = Object.fromEntries(fields.map((f) => [f.api_name, record ? initial(f, record[f.api_name]) : (defaults[f.api_name] ?? initial(f, null))]));
  const [values, setValues] = useState<Record<string, Value>>(start);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID()); // one per create intent: a double submit cannot create twice
  const set = (api: string) => (v: Value) => setValues((prev) => ({ ...prev, [api]: v }));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    setFailure(null);
    // Create sends what is filled in; edit sends what changed, at the version it was loaded at.
    const changed = fields.filter((f) => (record ? values[f.api_name] !== start[f.api_name] : values[f.api_name] !== "" && values[f.api_name] !== false));
    const data = Object.fromEntries(changed.map((f) => [f.api_name, toApi(f, values[f.api_name]!)]));
    const { status, json } = record
      ? await callApi("PUT", `/${module}/${record.id}`, { data: [{ ...data, version: record.version }] })
      : await callApi("POST", `/${module}`, { data: [data] }, { "idempotency-key": idempotencyKey });
    setPending(false);
    if (status === 200 || status === 201) {
      router.push(`/app/${module}/${record?.id ?? json.data[0].details.id}`);
      router.refresh();
    } else if (status === 422) {
      setErrors(fieldErrors(json.details?.errors ?? [{ api_name: json.details?.api_name, message: json.message }]));
      if (!json.details?.api_name && !json.details?.errors) setFailure(json.message);
    } else {
      setFailure(status === 409 ? t("records.conflict") : t("records.failed"));
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8" aria-busy={pending}>
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      )}
      {sections.map((s) => (
        <fieldset key={s.label_key} className="flex flex-col gap-4">
          <legend className="mb-2 text-lg font-medium">{t(s.label_key)}</legend>
          <div className={cn("grid gap-4", s.columns === 2 && "sm:grid-cols-2 lg:grid-cols-3")}>
            {s.fields.filter(editable).map((f) => (
              <Field key={f.api_name} field={f} value={values[f.api_name]!} onChange={set(f.api_name)} options={options[f.api_name] ?? []} error={errors[f.api_name]} />
            ))}
          </div>
        </fieldset>
      ))}
      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" aria-hidden />}
          {pending ? t("records.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}

type FieldProps = { field: FieldMeta; value: Value; onChange: (v: Value) => void; options: Lookup[]; error?: string };

function Field({ field: f, value, onChange, options, error }: FieldProps) {
  const t = useTranslations();
  const id = `field-${f.api_name}`;
  const a11y = { id, "aria-invalid": error ? true : undefined, "aria-describedby": error ? `${id}-error` : undefined };
  const label = (
    <Label htmlFor={id}>
      {t(f.label_key)}
      {f.required && (
        <>
          <span aria-hidden>*</span>
          <span className="sr-only">{t("records.required")}</span>
        </>
      )}
    </Label>
  );
  const text = (props: React.ComponentProps<typeof Input>) => (
    <Input {...a11y} {...props} required={f.required} maxLength={f.max_length ?? undefined} value={value as string} onChange={(e) => onChange(e.target.value)} />
  );
  const select = (items: { value: string; label: string }[]) => (
    <Select value={(value as string) || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger {...a11y} aria-required={f.required || undefined} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{t("records.none")}</SelectItem>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  let control: React.ReactNode;
  if (f.data_type === "boolean") {
    return (
      <div className="flex items-center gap-2 self-end">
        <Checkbox {...a11y} checked={value as boolean} onCheckedChange={(c) => onChange(c === true)} />
        {label}
      </div>
    );
  } else if (f.data_type === "textarea") {
    control = <Textarea {...a11y} required={f.required} maxLength={f.max_length ?? undefined} value={value as string} onChange={(e) => onChange(e.target.value)} />;
  } else if (f.data_type === "picklist") {
    control = select(f.picklist_values.map((p) => ({ value: p.value, label: t(p.label_key) })));
  } else if (isLookup(f)) {
    control = select(options.map((o) => ({ value: o.id, label: o.name ?? o.id })));
  } else if (f.data_type === "phone") {
    control = text({ type: "tel", inputMode: "tel", dir: "ltr", autoComplete: "tel" });
  } else if (NUMERIC.includes(f.data_type)) {
    control = text({ inputMode: "decimal", className: "text-end tabular-nums" });
  } else {
    control = text({ type: f.data_type === "email" ? "email" : f.data_type === "url" ? "url" : f.data_type === "date" ? "date" : "text" });
  }
  return (
    <div className={cn("flex flex-col gap-1.5", f.data_type === "textarea" && "sm:col-span-full")}>
      {label}
      {control}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
