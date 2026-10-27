"use client";

import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type Person = { id: string; name: string };
const ROLES = ["rep", "manager", "admin"] as const;
const NONE = "none"; // Radix Select has no empty value

/** Role as 3 visible choices (DESIGN_SYSTEM § Forms: RadioGroup for 2–4). */
export function RoleField({ value, onChange }: { value: string; onChange: (role: string) => void }) {
  const t = useTranslations("users");
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">{t("role")}</legend>
      <RadioGroup value={value} onValueChange={onChange} className="flex flex-wrap gap-4">
        {ROLES.map((role) => (
          <div key={role} className="flex items-center gap-2">
            <RadioGroupItem id={`role-${role}`} value={role} />
            <Label htmlFor={`role-${role}`} className="font-normal">
              {t(`roles.${role}`)}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </fieldset>
  );
}

type ManagerProps = { value: string | null; onChange: (id: string | null) => void; people: Person[]; error?: string };

/** Reporting manager, or none. A server error shows under the field (aria-describedby). */
export function ManagerField({ value, onChange, people, error }: ManagerProps) {
  const t = useTranslations("users");
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="manager">{t("manager")}</Label>
      <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
        <SelectTrigger id="manager" className="w-full" aria-invalid={error ? true : undefined} aria-describedby={error ? "manager-error" : undefined}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t("noManager")}</SelectItem>
          {people.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p id="manager-error" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
