import type { Role } from "@crm/core";

export type NavItem = {
  href: string;
  labelKey: string;
  group: "home" | "module" | "activities" | "settings";
  module?: string; // api_name, for module items: the Create menu and the palette's record search use it
};

// Pages that exist, by module api_name. Each module's slice adds its list page here, so the nav only links to
// routes that are really there (DESIGN_SYSTEM § Patterns).
const MODULE_PAGES: Partial<Record<string, string>> = { Accounts: "/app/Accounts", Contacts: "/app/Contacts", Deals: "/app/Deals", Products: "/app/Products" };

/** Nav for the caller: home, the org's modules (from metadata, in their order) that have a page, then admin settings. */
export function navItems(modules: { api_name: string; label_key: string }[], role: Role): NavItem[] {
  return [
    { href: "/app", labelKey: "shell.home", group: "home" },
    ...modules.flatMap((m) => (MODULE_PAGES[m.api_name] ? [{ href: MODULE_PAGES[m.api_name]!, labelKey: m.label_key, group: "module" as const, module: m.api_name }] : [])),
    { href: "/app/activities", labelKey: "shell.activities", group: "activities" }, // My Activities: Tasks, Calls and Meetings are reached from it and from records
    ...(role === "admin"
      ? ([
          { href: "/app/settings/users", labelKey: "shell.users", group: "settings" as const },
          { href: "/app/settings/org", labelKey: "shell.orgSettings", group: "settings" as const },
          { href: "/app/settings/vat", labelKey: "shell.vatRates", group: "settings" as const },
          { href: "/app/settings/exchange-rates", labelKey: "shell.exchangeRates", group: "settings" as const },
          { href: "/app/settings/import", labelKey: "shell.import", group: "settings" as const },
        ] satisfies NavItem[])
      : []),
  ];
}
