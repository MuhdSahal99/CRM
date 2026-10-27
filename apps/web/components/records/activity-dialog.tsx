"use client";

import { Loader2Icon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { callApi, fieldErrors } from "@/lib/api-client";

type ActivityModule = "Tasks" | "Calls" | "Meetings";
type Spec = { api: string; kind: "text" | "date" | "datetime" | "minutes" | "pick"; required?: true; list?: string; options?: string[] };

// The few fields worth typing when logging from a record; everything else is edited on the activity itself.
const SPECS: Record<ActivityModule, Spec[]> = {
  Tasks: [
    { api: "Subject", kind: "text", required: true },
    { api: "Due_Date", kind: "date" },
    { api: "Priority", kind: "pick", list: "Task_Priority", options: ["Highest", "High", "Normal", "Low", "Lowest"] },
  ],
  Calls: [
    { api: "Subject", kind: "text", required: true },
    { api: "Call_Type", kind: "pick", list: "Call_Type", options: ["Inbound", "Outbound", "Missed"], required: true },
    { api: "Call_Start_Time", kind: "datetime", required: true },
    { api: "Call_Duration_Seconds", kind: "minutes", required: true },
    { api: "Call_Result", kind: "text" },
  ],
  Meetings: [
    { api: "Subject", kind: "text", required: true },
    { api: "Start_DateTime", kind: "datetime", required: true },
    { api: "End_DateTime", kind: "datetime", required: true },
    { api: "Venue", kind: "text" },
  ],
};
const TYPES: ActivityModule[] = ["Calls", "Tasks", "Meetings"];
// The link back to the record the dialog is on: a Contact is the Who, an Account the What (SCHEMA § activities).
const LINK: Record<string, string> = { Contacts: "Who_Id", Accounts: "What_Id" };
const slug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "_");
const localNow = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const asInstant = (v: string) => (Number.isNaN(new Date(v).getTime()) ? v : new Date(v).toISOString());

const initial = (type: ActivityModule): Record<string, string> =>
  Object.fromEntries(SPECS[type].map((s) => [s.api, s.api === "Call_Type" ? "Outbound" : s.kind === "datetime" && s.api !== "End_DateTime" ? localNow() : ""]));

/** US-15: log a Task, Call or Meeting on the record being viewed (an Account or a Contact); the timeline refreshes after. */
export function ActivityDialog({ module, id }: { module: "Accounts" | "Contacts"; id: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ActivityModule>("Calls");
  const [values, setValues] = useState(() => initial("Calls"));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID()); // one per logging intent: a double submit cannot log twice

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setType("Calls");
      setValues(initial("Calls"));
      setErrors({});
      setFailed(false);
      setKey(crypto.randomUUID());
    }
  }
  function pickType(next: ActivityModule) {
    setType(next);
    setValues(initial(next));
    setErrors({});
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    setFailed(false);
    const record: Record<string, unknown> = { [LINK[module]!]: { id, module } };
    for (const s of SPECS[type]) {
      const v = values[s.api]!;
      if (v === "") continue;
      record[s.api] = s.kind === "datetime" ? asInstant(v) : s.kind === "minutes" ? (Number.isFinite(Number(v)) ? Math.round(Number(v) * 60) : v) : v;
    }
    const { status, json } = await callApi("POST", `/${type}`, { data: [record] }, { "idempotency-key": key });
    setPending(false);
    if (status === 201) {
      setOpen(false);
      router.refresh();
    } else if (status === 422) {
      setErrors(fieldErrors(json.details?.errors ?? [{ api_name: json.details?.api_name, message: json.message }]));
    } else {
      setFailed(true);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PlusIcon aria-hidden />
          {t("activities.log")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("activities.logTitle")}</DialogTitle>
          <DialogDescription>{t("activities.logDescription")}</DialogDescription>
        </DialogHeader>
        <form id="activity-form" onSubmit={onSubmit} className="flex flex-col gap-4" aria-busy={pending}>
          {failed && (
            <p role="alert" className="text-sm text-destructive">
              {t("activities.failed")}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="activity-type">{t("activities.type")}</Label>
            <Select value={type} onValueChange={(v) => pickType(v as ActivityModule)}>
              <SelectTrigger id="activity-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(`records.singular.${m}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {SPECS[type].map((s) => {
            const fieldId = `activity-${s.api}`;
            const error = errors[s.api];
            const a11y = { id: fieldId, "aria-invalid": error ? true : undefined, "aria-describedby": error ? `${fieldId}-error` : undefined };
            const set = (v: string) => setValues((prev) => ({ ...prev, [s.api]: v }));
            return (
              <div key={s.api} className="flex flex-col gap-1.5">
                <Label htmlFor={fieldId}>
                  {s.kind === "minutes" ? t("activities.duration") : t(`fields.${type}.${s.api}`)}
                  {s.required && (
                    <>
                      <span aria-hidden>*</span>
                      <span className="sr-only">{t("records.required")}</span>
                    </>
                  )}
                </Label>
                {s.kind === "pick" ? (
                  <Select value={values[s.api] || "none"} onValueChange={(v) => set(v === "none" ? "" : v)}>
                    <SelectTrigger {...a11y} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {!s.required && <SelectItem value="none">{t("records.none")}</SelectItem>}
                      {s.options!.map((o) => (
                        <SelectItem key={o} value={o}>
                          {t(`picklists.${s.list}.${slug(o)}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    {...a11y}
                    type={s.kind === "date" ? "date" : s.kind === "datetime" ? "datetime-local" : s.kind === "minutes" ? "number" : "text"}
                    min={s.kind === "minutes" ? 0 : undefined}
                    step={s.kind === "minutes" ? "any" : undefined}
                    inputMode={s.kind === "minutes" ? "decimal" : undefined}
                    required={s.required}
                    maxLength={s.api === "Subject" ? 255 : undefined}
                    value={values[s.api]}
                    onChange={(e) => set(e.target.value)}
                  />
                )}
                {error && (
                  <p id={`${fieldId}-error`} className="text-sm text-destructive">
                    {error}
                  </p>
                )}
              </div>
            );
          })}
        </form>
        <DialogFooter>
          <Button type="submit" form="activity-form" disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" aria-hidden />}
            {t("activities.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
