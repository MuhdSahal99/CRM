"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Segmented } from "@/components/ui/segmented";

const noop = () => () => {};

/** Settings → Appearance (GLASS_SPEC 8): dark, light or follow the system. The choice is next-themes' own ("app:theme"). */
export function AppearanceCard() {
  const t = useTranslations("settings.appearance");
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(noop, () => true, () => false); // the stored theme is unknown on the server
  return (
    <GlassCard title={t("title")} subtitle={t("text")}>
      <Segmented
        label={t("label")}
        value={mounted ? (theme ?? "system") : "dark"}
        onValueChange={setTheme}
        options={[
          { value: "dark", label: t("dark"), icon: <MoonIcon /> },
          { value: "light", label: t("light"), icon: <SunIcon /> },
          { value: "system", label: t("system"), icon: <MonitorIcon /> },
        ]}
      />
    </GlassCard>
  );
}
