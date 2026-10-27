"use client";

import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { callApi } from "@/lib/api-client";

type Match = { id: string; name: string };
type Options = { Accounts: Match[]; Contacts: Match[]; preferred: { Accounts: Match | null; Contacts: Match | null } };
type Pipeline = { id: string; stages: { id: string; api_value: string; name_key: string; record_category: string }[] };
const NEW = "new";
const inThirtyDays = () => new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
const ACCOUNTS = "Accounts";
const CONTACTS = "Contacts";

/** US-05: convert a lead into an Account and a Contact, offering to attach to the matches the server found. */
export function ConvertDialog({ id, company, name }: { id: string; company: string; name: string }) {
  const t = useTranslations("convert");
  const tAll = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Options | null>(null);
  const [choice, setChoice] = useState({ Accounts: NEW, Contacts: NEW });
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [deal, setDeal] = useState({ on: false, name: company, closing: inThirtyDays(), stage: "", amount: "" });
  const [error, setError] = useState<"failed" | "gone" | null>(null);
  const [pending, setPending] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID()); // one per convert intent: a double submit cannot convert twice

  async function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setOptions(null);
    setError(null);
    setKey(crypto.randomUUID());
    const { status, json } = await callApi("GET", `/Leads/${id}/__conversion_options`);
    if (status !== 200) return setError(status === 409 ? "gone" : "failed");
    const piped = await callApi("GET", "/settings/pipeline");
    if (piped.status === 200) {
      const p = piped.json.data.find((x: { is_default: boolean }) => x.is_default) as Pipeline | undefined;
      setPipeline(p ?? null);
      setDeal((d) => ({ ...d, on: false, name: company, stage: p?.stages.find((st) => st.record_category === "open")?.api_value ?? "" }));
    }
    const found = json.data[0] as Options;
    setOptions(found);
    setChoice({ Accounts: found.preferred.Accounts?.id ?? NEW, Contacts: found.preferred.Contacts?.id ?? NEW });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const pick = (v: string) => (v === NEW ? null : { id: v });
    const { status, json } = await callApi("POST", `/Leads/${id}/actions/convert`, { data: [{
      Accounts: pick(choice.Accounts), Contacts: pick(choice.Contacts),
      ...(deal.on && pipeline ? { Deals: { Deal_Name: deal.name, Closing_Date: deal.closing, Pipeline: { id: pipeline.id }, Stage: deal.stage, ...(deal.amount ? { Amount: deal.amount } : {}) } } : {}),
    }] }, { "idempotency-key": key });
    if (status === 200) return router.push(`/app/Contacts/${json.data[0].Contacts}`);
    setPending(false);
    setError(status === 409 ? "gone" : "failed");
  }

  const group = (kind: "Accounts" | "Contacts", newLabel: string) => {
    const matches = options![kind];
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t(kind === "Accounts" ? "account" : "contact")}</legend>
        <RadioGroup value={choice[kind]} onValueChange={(v) => setChoice((c) => ({ ...c, [kind]: v }))} aria-label={t(kind === "Accounts" ? "account" : "contact")}>
          {[{ id: NEW, label: newLabel }, ...matches.map((m) => ({ id: m.id, label: t(kind === "Accounts" ? "attachAccount" : "attachContact", { name: m.name }) }))].map((o) => (
            <div key={o.id} className="flex items-center gap-2">
              <RadioGroupItem value={o.id} id={`convert-${kind}-${o.id}`} />
              <Label htmlFor={`convert-${kind}-${o.id}`} className="font-normal">
                {o.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </fieldset>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <RefreshCwIcon aria-hidden />
          {t("open")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form id="convert-form" onSubmit={onSubmit} className="flex flex-col gap-5" aria-busy={pending || (!options && !error)}>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {t(error)}
            </p>
          )}
          {!options && !error && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
          {options && (
            <>
              {group(ACCOUNTS, t("newAccount", { name: company }))}
              {group(CONTACTS, t("newContact", { name }))}
              {pipeline && (
                <fieldset className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Checkbox id="convert-deal" checked={deal.on} onCheckedChange={(v) => setDeal((d) => ({ ...d, on: v === true }))} />
                    <Label htmlFor="convert-deal">{t("createDeal")}</Label>
                  </div>
                  {deal.on && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <Label htmlFor="convert-deal-name">{t("dealName")}</Label>
                        <Input id="convert-deal-name" required maxLength={120} value={deal.name} onChange={(e) => setDeal((d) => ({ ...d, name: e.target.value }))} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="convert-deal-closing">{t("closingDate")}</Label>
                        <Input id="convert-deal-closing" type="date" required value={deal.closing} onChange={(e) => setDeal((d) => ({ ...d, closing: e.target.value }))} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="convert-deal-stage">{t("stage")}</Label>
                        <select id="convert-deal-stage" className="h-9 rounded-md border bg-background px-2 text-sm" value={deal.stage} onChange={(e) => setDeal((d) => ({ ...d, stage: e.target.value }))}>
                          {pipeline.stages.filter((st) => st.record_category === "open").map((st) => (
                            <option key={st.id} value={st.api_value}>
                              {tAll(st.name_key)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="convert-deal-amount">{t("amount")}</Label>
                        <Input id="convert-deal-amount" inputMode="decimal" pattern="\d{1,15}(\.\d{1,3})?" value={deal.amount} onChange={(e) => setDeal((d) => ({ ...d, amount: e.target.value }))} />
                      </div>
                    </div>
                  )}
                </fieldset>
              )}
            </>
          )}
        </form>
        <DialogFooter>
          <Button type="submit" form="convert-form" disabled={pending || !options}>
            {pending && <Loader2Icon className="animate-spin" aria-hidden />}
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
