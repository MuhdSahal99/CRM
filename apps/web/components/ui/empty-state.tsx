import { cn } from "cn";
import type * as React from "react";

export function EmptyState({ icon, title, text, action, className }: { icon: React.ReactNode; title: React.ReactNode; text?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div data-slot="empty-state" className={cn("flex flex-col items-center gap-2 px-4 py-8 text-center", className)}>
      <span aria-hidden className="glass mb-1 grid size-12 place-items-center rounded-full [&_svg]:size-5 [&_svg]:stroke-[1.6]">
        {icon}
      </span>
      <p className="text-[15px] font-semibold">{title}</p>
      {text && <p className="max-w-xs text-[13px] text-muted-foreground">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
