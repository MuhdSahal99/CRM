"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const PAGES = [
  { href: "/app/settings/users", labelKey: "shell.users" },
  { href: "/app/settings/org", labelKey: "shell.orgSettings" },
  { href: "/app/settings/vat", labelKey: "shell.vatRates" },
  { href: "/app/settings/exchange-rates", labelKey: "shell.exchangeRates" },
  { href: "/app/settings/import", labelKey: "shell.import" },
];

/** Segmented sub-nav shared by the settings pages. */
export function SettingsNav() {
  const t = useTranslations();
  const pathname = usePathname();
  return (
    <nav aria-label={t("shell.settings")} className="mb-6 max-w-full overflow-x-auto [scrollbar-width:none]">
      <ul className="glass flex w-max gap-1 rounded-full p-1">
        {PAGES.map((p) => {
          const current = pathname === p.href || pathname.startsWith(`${p.href}/`);
          return (
            <li key={p.href}>
              <Link
                href={p.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                  current && "bg-pill text-on-pill hover:text-on-pill",
                )}
              >
                {t(p.labelKey)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
