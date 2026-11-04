"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Error-state action: reloads the server data of the current page. */
export function RetryButton({ label }: { label: string }) {
  const router = useRouter();
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
      {label}
    </Button>
  );
}
