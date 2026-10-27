"use client";

import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { callApi } from "@/lib/api-client";

type Match = { id: string; name: string };
type Options = { Accounts: Match[]; Contacts: Match[]; preferred: { Accounts: Match | null; Contacts: Match | null } };
const NEW = "new";
const ACCOUNTS = "Accounts";
const CONTACTS = "Contacts";

/** US-05: convert a lead into an Account and a Contact, offering to attach to the matches the server found. */
export function ConvertDialog({ id, company, name }: { id: string; company: string; name: string }) {
  const t = useTranslations("convert");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Options | null>(null);
  const [choice, setChoice] = useState({ Accounts: NEW, Contacts: NEW });
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
    const found = json.data[0] as Options;
    setOptions(found);
    setChoice({ Accounts: found.preferred.Accounts?.id ?? NEW, Contacts: found.preferred.Contacts?.id ?? NEW });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const pick = (v: string) => (v === NEW ? null : { id: v });
    const { status, json } = await callApi("POST", `/Leads/${id}/actions/convert`, { data: [{ Accounts: pick(choice.Accounts), Contacts: pick(choice.Contacts) }] }, { "idempotency-key": key });
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
