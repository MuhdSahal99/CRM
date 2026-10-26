"use client";

import { useSyncExternalStore } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

const OPTIONS = [
  { value: "light", Icon: SunIcon },
  { value: "dark", Icon: MoonIcon },
  { value: "system", Icon: MonitorIcon },
] as const;

const noop = () => () => {};

export function ThemeToggle() {
  const t = useTranslations("theme");
  const { theme, setTheme } = useTheme();
  // Theme is unknown on the server; only mark the pressed button after hydration.
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  return (
    <div role="group" aria-label={t("label")} className="inline-flex rounded-md border border-input p-0.5">
      {OPTIONS.map(({ value, Icon }) => (
        <Button
          key={value}
          variant={mounted && theme === value ? "secondary" : "ghost"}
          size="icon-sm"
          aria-pressed={mounted && theme === value}
          aria-label={t(value)}
          onClick={() => setTheme(value)}
        >
          <Icon aria-hidden />
        </Button>
      ))}
    </div>
  );
}
