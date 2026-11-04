"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

const noop = () => () => {};

// Both icons stay mounted; the inactive one is turned 90° and faded out, so the swap is a rotate + crossfade.
const ICON = "col-start-1 row-start-1 transition-[transform,opacity] duration-(--dur-slow) ease-glass";

export function ThemeToggle() {
  const t = useTranslations("theme");
  const { resolvedTheme, setTheme } = useTheme();
  // Theme is unknown on the server; only reflect it after hydration.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-pressed={dark}
      aria-label={t("label")}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      <span className="grid place-items-center" aria-hidden>
        <SunIcon className={`${ICON} ${dark ? "rotate-90 opacity-0" : "rotate-0 opacity-100"}`} />
        <MoonIcon className={`${ICON} ${dark ? "rotate-0 opacity-100" : "-rotate-90 opacity-0"}`} />
      </span>
    </Button>
  );
}
