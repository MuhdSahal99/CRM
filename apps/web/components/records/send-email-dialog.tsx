"use client";

import { Loader2Icon, MailIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { callApi } from "@/lib/api-client";

export type MailContact = { id: string; name: string; email: string | null };

/** T9.04 (US-13): emails the document's PDF to one of the account's contacts. The send is queued (202); its outcome shows in the Emails list. */
export function SendEmailDialog({ module, id, contacts, defaultSubject }: { module: string; id: string; contacts: MailContact[]; defaultSubject: string }) {
  const t = useTranslations("email");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const withEmail = contacts.filter((c) => c.email);

  async function send() {
    setPending(true);
    setError(null);
    const { status, json } = await callApi("POST", `/${module}/${id}/actions/send_email`, { to_contact_id: contact, subject, message: message || undefined }, { "idempotency-key": key });
    setPending(false);
    if (status === 202) {
      toast.success(t("queued"));
      setOpen(false);
      setMessage("");
      setKey(crypto.randomUUID()); // the next send is a new request
      router.refresh();
    } else setError(json?.errors?.[0]?.message ?? json?.message ?? t("failed"));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <MailIcon aria-hidden />
          {t("send")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("send")}</DialogTitle>
          <DialogDescription>{t("hint")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="mail-to">{t("to")}</Label>
            <Select value={contact} onValueChange={setContact}>
              <SelectTrigger id="mail-to" className="w-full">
                <SelectValue placeholder={withEmail.length ? t("choose") : t("noContacts")} />
              </SelectTrigger>
              <SelectContent>
                {withEmail.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="mail-subject">{t("subject")}</Label>
            <Input id="mail-subject" value={subject} maxLength={255} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="mail-message">{t("message")}</Label>
            <Textarea id="mail-message" value={message} maxLength={5000} onChange={(e) => setMessage(e.target.value)} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" onClick={send} disabled={pending || !contact || !subject.trim()}>
            {pending && <Loader2Icon className="animate-spin" aria-hidden />}
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
