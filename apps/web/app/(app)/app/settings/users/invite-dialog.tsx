"use client";

import { Loader2Icon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callApi, fieldErrors } from "@/lib/api-client";
import { ManagerField, type Person, RoleField } from "./user-fields";

const TEXT_FIELDS = ["name", "email"] as const;

/** US-03: invite one person with a role and manager. Shows the accept link until email delivery exists (T9.04). */
export function InviteDialog({ managers }: { managers: Person[] }) {
  const t = useTranslations("users");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("rep");
  const [managerId, setManagerId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const [acceptUrl, setAcceptUrl] = useState<string | null>(null);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setErrors({});
      setFailed(false);
      setAcceptUrl(null);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setErrors({});
    setFailed(false);
    const person = { name: String(form.get("name")), email: String(form.get("email")), role, manager_id: managerId };
    const { status, json } = await callApi("POST", "/users", { data: [person] });
    setPending(false);
    const outcome = json?.data?.[0];
    if (status === 201 && outcome?.status === "success") {
      setAcceptUrl(outcome.details.accept_url);
      router.refresh();
    } else if (status === 422) {
      setErrors(fieldErrors(json.details.errors));
    } else if (outcome?.status === "error") {
      setErrors(fieldErrors([{ api_name: outcome.details?.api_name, message: outcome.message }]));
    } else {
      setFailed(true);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon aria-hidden />
          {t("invite")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("inviteTitle")}</DialogTitle>
          <DialogDescription>{acceptUrl ? t("invitedDescription") : t("inviteDescription")}</DialogDescription>
        </DialogHeader>
        {acceptUrl ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accept-url">{t("acceptLink")}</Label>
            <Input id="accept-url" readOnly value={acceptUrl} dir="ltr" onFocus={(e) => e.currentTarget.select()} />
          </div>
        ) : (
          <form id="invite-form" onSubmit={onSubmit} className="flex flex-col gap-4" aria-busy={pending}>
            {failed && (
              <p role="alert" className="text-sm text-destructive">
                {t("failed")}
              </p>
            )}
            {TEXT_FIELDS.map((field) => (
              <div key={field} className="flex flex-col gap-1.5">
                <Label htmlFor={field}>{t(field)}</Label>
                <Input
                  id={field}
                  name={field}
                  type={field === "email" ? "email" : "text"}
                  autoComplete="off"
                  required
                  aria-invalid={errors[field] ? true : undefined}
                  aria-describedby={errors[field] ? `${field}-error` : undefined}
                />
                {errors[field] && (
                  <p id={`${field}-error`} className="text-sm text-destructive">
                    {errors[field]}
                  </p>
                )}
              </div>
            ))}
            <RoleField value={role} onChange={setRole} />
            <ManagerField value={managerId} onChange={setManagerId} people={managers} error={errors.manager_id} />
          </form>
        )}
        <DialogFooter>
          {acceptUrl ? (
            <Button onClick={() => setOpen(false)}>{tCommon("close")}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" form="invite-form" disabled={pending}>
                {pending && <Loader2Icon className="animate-spin" aria-hidden />}
                {pending ? t("inviting") : t("sendInvite")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
