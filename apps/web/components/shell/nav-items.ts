import type { Role } from "@crm/core";

export type NavItem = { href: string; labelKey: string };

// Pages that exist, by module api_name. Each module's slice adds its list page here, so the nav only links to
// routes that are really there (DESIGN_SYSTEM § Patterns).
const MODULE_PAGES: Partial<Record<string, string>> = { Accounts: "/app/Accounts", Contacts: "/app/Contacts", Deals: "/app/Deals" };

/** Nav for the caller: home, the org's modules (from metadata, in their order) that have a page, then admin settings. */
export function navItems(modules: { api_name: string; label_key: string }[], role: Role): NavItem[] {
  return [
    { href: "/app", labelKey: "shell.home" },
    ...modules.flatMap((m) => (MODULE_PAGES[m.api_name] ? [{ href: MODULE_PAGES[m.api_name]!, labelKey: m.label_key }] : [])),
    { href: "/app/activities", labelKey: "shell.activities" }, // My Activities: Tasks, Calls and Meetings are reached from it and from records
    ...(role === "admin" ? [{ href: "/app/settings/users", labelKey: "shell.users" }] : []),
  ];
}
