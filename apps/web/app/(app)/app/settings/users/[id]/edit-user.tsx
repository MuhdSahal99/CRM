"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { callApi, fieldErrors } from "@/lib/api-client";
import { ManagerField, type Person, RoleField } from "../user-fields";

type Props = { user: { id: string; name: string; role: string; managerId: string | null; status: string }; managers: Person[]; recipients: Person[]; isSelf: boolean };

/** US-03: change role and manager; deactivate after a confirmation, optionally transferring their open records first (T5.10). */
export function EditUser({ user, managers, recipients, isSelf }: Props) {
  const t = useTranslations("users");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [role, setRole] = useState(user.role);
  const [managerId, setManagerId] = useState(user.managerId);
  const [pending, setPending] = useState<"save" | "deactivate" | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [transferTo, setTransferTo] = useState("");

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending("save");
    setErrors({});
    setFailed(false);
    const { status, json } = await callApi("PUT", `/users/${user.id}`, { data: [{ role, manager_id: managerId }] });
    setPending(null);
    if (status === 200) {
      toast.success(t("saved"));
      router.refresh();
    } else if (status === 422) {
      setErrors(fieldErrors(json.details.errors ?? [{ api_name: json.details.api_name, message: json.message }]));
    } else {
      setFailed(true);
    }
  }

  async function onDeactivate() {
    setPending("deactivate");
    if (transferTo) {
      const moved = await callApi("POST", `/users/${user.id}/actions/transfer`, { to_user_id: transferTo }, { "idempotency-key": crypto.randomUUID() });
      if (moved.status !== 200) {
        setPending(null);
        setConfirming(false);
        return setFailed(true); // not deactivated: the records and the account stay as they were
      }
    }
    const { status } = await callApi("POST", `/users/${user.id}/actions/deactivate`);
    setPending(null);
    setConfirming(false);
    if (status === 200) {
      toast.success(t("deactivated", { name: user.name }));
      router.refresh();
    } else {
      setFailed(true);
    }
  }

  const active = user.status === "active";
  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={onSave} className="flex max-w-md flex-col gap-4" aria-busy={pending === "save"}>
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            {t("failed")}
          </p>
        )}
        {/* The API refuses a change to your own role, so the last admin cannot lock the org out. */}
        {!isSelf && <RoleField value={role} onChange={setRole} />}
        <ManagerField value={managerId} onChange={setManagerId} people={managers} error={errors.manager_id} />
        <div>
          <Button type="submit" disabled={pending !== null || !active}>
            {pending === "save" && <Loader2Icon className="animate-spin" aria-hidden />}
            {pending === "save" ? t("saving") : tCommon("save")}
          </Button>
        </div>
      </form>

      {active && !isSelf && (
        <section aria-labelledby="deactivate-title" className="flex max-w-md flex-col items-start gap-3 rounded-lg border border-destructive/40 p-4">
          <h2 id="deactivate-title" className="font-medium">
            {t("deactivateTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("deactivateHelp")}</p>
          <Dialog open={confirming} onOpenChange={setConfirming}>
            <DialogTrigger asChild>
              <Button variant="destructive">{t("deactivate")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("confirmTitle", { name: user.name })}</DialogTitle>
                <DialogDescription>{t("confirmDescription")}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="transfer-to">{t("transferTo")}</Label>
                <select id="transfer-to" className="h-9 rounded-md border bg-background px-2 text-sm" value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                  <option value="">{t("transferNone")}</option>
                  {recipients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-muted-foreground">{t("transferHelp")}</p>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">{tCommon("cancel")}</Button>
                </DialogClose>
                <Button variant="destructive" onClick={onDeactivate} disabled={pending !== null}>
                  {pending === "deactivate" && <Loader2Icon className="animate-spin" aria-hidden />}
                  {t("deactivate")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </section>
      )}
    </div>
  );
}
