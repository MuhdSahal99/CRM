export type NavItem = { href: string; labelKey: string };

// Pages that exist, by module api_name. Each module's slice adds its list page here, so the nav only links to
// routes that are really there (DESIGN_SYSTEM § Patterns).
const MODULE_PAGES: Partial<Record<string, string>> = {};

/** Nav for the caller: home, then the org's modules (from metadata, in their order) that have a page. */
export function navItems(modules: { api_name: string; label_key: string }[]): NavItem[] {
  return [
    { href: "/app", labelKey: "shell.home" },
    ...modules.flatMap((m) => (MODULE_PAGES[m.api_name] ? [{ href: MODULE_PAGES[m.api_name]!, labelKey: m.label_key }] : [])),
  ];
}
