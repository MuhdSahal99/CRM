"use client";

import { Loader2Icon, MessageCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { callApi } from "@/lib/api-client";

export type WhatsAppContact = { id: string; name: string; mobile: string | null };

/**
 * T9.08 (US-14): creates a 7-day link to the document's PDF and opens https://wa.me/<number>?text=<message with the link>. That logs "WhatsApp link
 * shared" on the record: it records that the link was shared, not that the message arrived. A contact with no mobile number cannot be chosen to send.
 */
export function WhatsAppButton({ module, id, contacts, title }: { module: string; id: string; contacts: WhatsAppContact[]; title: string }) {
  const t = useTranslations("whatsapp");
  const router = useRouter();
  const [contactId, setContactId] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const contact = contacts.find((c) => c.id === contactId);
  const noMobile = contact !== undefined && !contact.mobile;

  async function send() {
    if (!contact) return;
    // Opened inside the click so a phone browser does not block it; pointed at wa.me once the link exists.
    const tab = window.open("about:blank", "_blank");
    setPending(true);
    setMessage(null);
    const { status, json } = await callApi("POST", `/${module}/${id}/share_links`, { to_contact_id: contact.id, message: t("text", { name: contact.name.split(" ")[0] || contact.name, title }) }, { "idempotency-key": crypto.randomUUID() });
    setPending(false);
    if (status === 201 && tab) {
      tab.location.href = json.data[0].whatsapp_url;
      router.refresh();
    } else {
      tab?.close();
      setMessage(status === 202 ? t("preparing") : (json?.message ?? t("failed")));
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="wa-contact" className="sr-only">
          {t("contact")}
        </Label>
        <Select value={contactId} onValueChange={setContactId}>
          <SelectTrigger id="wa-contact" className="w-56">
            <SelectValue placeholder={t("choose")} />
          </SelectTrigger>
          <SelectContent>
            {contacts.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" onClick={send} disabled={!contact || noMobile || pending}>
          {pending ? <Loader2Icon className="animate-spin" aria-hidden /> : <MessageCircleIcon aria-hidden />}
          {t("send")}
        </Button>
      </div>
      {noMobile && <p className="text-sm text-muted-foreground">{t("noMobile")}</p>}
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
