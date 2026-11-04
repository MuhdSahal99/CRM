"use client";

import { cn } from "cn";
import * as React from "react";
import { Label } from "./label";

export type FieldControlProps = { id: string; "aria-describedby"?: string; "aria-invalid"?: true };

/** Label (12px muted) above a control, hint (11px faint) and error (coral) below. The control gets id/aria via render prop. */
export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: (props: FieldControlProps) => React.ReactNode;
}) {
  const id = React.useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = (error ? errorId : hint ? hintId : undefined) as string | undefined;
  return (
    <div data-slot="field" className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && !error && (
        <p id={hintId} className="text-[11px] text-faint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
