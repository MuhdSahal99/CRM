"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export type Reason = { value: string; label_key: string };

/** US-07: moving a deal to a Closed Lost stage asks why. Cancel leaves the deal where it was (the caller changes nothing). */
export function LostReasonDialog({ open, reasons, pending, onCancel, onConfirm }: { open: boolean; reasons: Reason[]; pending?: boolean; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const t = useTranslations();
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deals.lostTitle")}</DialogTitle>
          <DialogDescription>{t("deals.lostDescription")}</DialogDescription>
        </DialogHeader>
        <form
          id="lost-reason-form"
          className="flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm(reason);
          }}
        >
          <Label htmlFor="lost-reason">{t("deals.reason")}</Label>
          <select id="lost-reason" required className="h-9 rounded-md border bg-background px-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="" disabled>
              {t("deals.chooseReason")}
            </option>
            {reasons.map((r) => (
              <option key={r.value} value={r.value}>
                {t(r.label_key)}
              </option>
            ))}
          </select>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("deals.cancel")}
          </Button>
          <Button type="submit" form="lost-reason-form" disabled={pending || !reason}>
            {t("deals.markLost")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
