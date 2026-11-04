"use client";

import { useGSAP } from "@gsap/react";
import { CircleCheckIcon, InfoIcon, OctagonXIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { toast as sonner } from "sonner";
import { toastIn } from "@/lib/motion";

type Kind = "success" | "info" | "error";
const ICON = { success: CircleCheckIcon, info: InfoIcon, error: OctagonXIcon };

function ToastPill({ kind, message, onUndo, dismiss }: { kind: Kind; message: string; onUndo?: () => void; dismiss: () => void }) {
  const t = useTranslations("common");
  const ref = React.useRef<HTMLDivElement>(null);
  useGSAP(() => void (ref.current && toastIn(ref.current)), { dependencies: [] });
  const Icon = ICON[kind];
  return (
    <div ref={ref} data-slot="toast" className="float-glass flex min-h-11 items-center gap-2.5 rounded-full ps-4 pe-2 text-sm text-popover-foreground">
      <Icon aria-hidden className={kind === "error" ? "size-4 text-bad" : kind === "success" ? "size-4 text-good" : "size-4 text-sky"} />
      <span>{message}</span>
      {onUndo && (
        <button
          type="button"
          className="h-8 rounded-full px-3 text-sm font-semibold hover:bg-glass-2"
          onClick={() => {
            onUndo();
            dismiss();
          }}
        >
          {t("undo")}
        </button>
      )}
    </div>
  );
}

/** Glass toast pill, bottom-centre, 4s (Toaster sets the region's aria-live="polite"). `onUndo` adds an Undo text button. */
export function notify(message: string, opts: { kind?: Kind; onUndo?: () => void } = {}) {
  const { kind = "success", onUndo } = opts;
  return sonner.custom((id) => <ToastPill kind={kind} message={message} onUndo={onUndo} dismiss={() => sonner.dismiss(id)} />, { duration: 4000 });
}
