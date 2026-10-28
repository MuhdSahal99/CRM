"use client";

import { BanIcon, BadgeCheckIcon, CheckCheckIcon, FileDownIcon, FileTextIcon, Loader2Icon, ReceiptTextIcon, TruckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { callApi } from "@/lib/api-client";

type Module = "Quotes" | "Sales_Orders" | "Invoices";
type Created = { data: { details: { id: string } }[] };
type Props = { module: Module; id: string; status: string; isAdmin: boolean; hasNumber?: boolean };

/** T8.13 (US-11, US-12): the actions a quote, sales order or invoice offers in its current state. Every state change is the server's. */
export function DocumentActions({ module, id, status, isAdmin }: Props) {
  const t = useTranslations("documents");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);

  /** POSTs an action. One idempotency key per click keeps a double click from issuing twice. */
  async function run(name: string, path: string, body: unknown, after?: (json: Created) => void) {
    setBusy(name);
    setMessage(null);
    const { status: code, json } = await callApi("POST", path, body, { "idempotency-key": crypto.randomUUID() });
    setBusy(null);
    if (code >= 200 && code < 300) {
      setOpen(false);
      if (after) after(json);
      else router.refresh();
    } else setMessage(json?.message ?? t("failed"));
  }
  const go = (module: Module) => (json: Created) => router.push(`/app/${module}/${json.data[0].details.id}`);

  async function download() {
    setBusy("pdf");
    setMessage(null);
    const res = await fetch(`/api/v1/${module}/${id}/pdf`);
    setBusy(null);
    if (res.status === 200) window.open(URL.createObjectURL(await res.blob()), "_blank");
    else setMessage(res.status === 202 ? t("pdfPreparing") : t("failed"));
  }

  const btn = (name: string, label: string, icon: React.ReactNode, onClick: () => void, variant: "default" | "outline" = "outline") => (
    <Button key={name} type="button" variant={variant} onClick={onClick} disabled={busy !== null}>
      {busy === name ? <Loader2Icon className="animate-spin" aria-hidden /> : icon}
      {label}
    </Button>
  );
  const transition = (to: string) => run(to, `/Sales_Orders/${id}/actions/transition`, { to });

  const actions: React.ReactNode[] = [];
  if (module === "Quotes") actions.push(btn("convert", t("convertQuote"), <FileTextIcon aria-hidden />, () => run("convert", `/Quotes/${id}/actions/convert`, { to: "Sales_Orders" }, go("Sales_Orders"))));
  if (module === "Sales_Orders") {
    if (status === "created") actions.push(btn("approved", t("approve"), <BadgeCheckIcon aria-hidden />, () => transition("approved")));
    if (status === "approved") actions.push(btn("delivered", t("deliver"), <TruckIcon aria-hidden />, () => transition("delivered")));
    if (status === "created" || status === "approved") actions.push(btn("cancelled", t("cancelOrder"), <BanIcon aria-hidden />, () => transition("cancelled")));
    if (status !== "cancelled") actions.push(btn("invoice", t("createInvoice"), <ReceiptTextIcon aria-hidden />, () => run("invoice", `/Sales_Orders/${id}/actions/convert`, {}, go("Invoices")), "default"));
  }
  if (module === "Invoices") {
    if (status === "draft") actions.push(btn("issue", t("issue"), <BadgeCheckIcon aria-hidden />, () => run("issue", `/Invoices/${id}/actions/issue`, {}), "default"));
    if (status === "issued") actions.push(btn("paid", t("markPaid"), <CheckCheckIcon aria-hidden />, () => run("paid", `/Invoices/${id}/actions/mark_paid`, {})));
    if (status !== "draft") actions.push(btn("pdf", t("downloadPdf"), <FileDownIcon aria-hidden />, download));
  }
  const canCancel = module === "Invoices" && (status === "issued" || (status === "paid" && isAdmin));

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap gap-2">
        {actions}
        {canCancel && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" disabled={busy !== null}>
                <BanIcon aria-hidden />
                {t("cancelInvoice")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("cancelInvoice")}</DialogTitle>
                <DialogDescription>{t("cancelHint")}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor="cancel-reason">{t("reason")}</Label>
                <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
              </div>
              <DialogFooter>
                <Button type="button" variant="destructive" disabled={busy !== null || reason.trim().length < 3} onClick={() => run("cancel", `/Invoices/${id}/actions/cancel`, { reason })}>
                  {busy === "cancel" && <Loader2Icon className="animate-spin" aria-hidden />}
                  {t("confirmCancel")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
