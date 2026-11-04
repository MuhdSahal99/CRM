import { getMe, listModules, nameFieldsOf, withTenant } from "@crm/core";
import { getTranslations } from "next-intl/server";
import { navItems } from "@/components/shell/nav-items";
import { TopBar } from "@/components/shell/top-bar";
import { requireContext } from "@/lib/session";

// Every CRM page lives in this group: no session, no shell (T1.22). Nav comes from the org's modules (T1.23).
// The top bar is sticky, so globals.css reserves scroll-padding under it (WCAG 2.4.11).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const { modules, me } = await withTenant(ctx, async (tx) => ({ modules: await listModules(tx), me: await getMe(tx, ctx.userId) }));
  const items = navItems(modules, ctx.role);
  const searchModules = items.flatMap((i) => (i.module ? [{ module: i.module, nameFields: nameFieldsOf(i.module) }] : []));
  const t = await getTranslations("shell");
  return (
    <div data-app-shell className="flex min-h-svh flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:inset-s-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-pill focus:px-4 focus:py-2 focus:text-on-pill"
      >
        {t("skip")}
      </a>
      <TopBar items={items} user={{ name: me.name, email: me.email }} searchModules={searchModules} />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-(--app-max) px-(--gutter) pt-4 pb-28 outline-none md:ps-[calc(var(--dock-w)+2.5rem)] md:pb-10">
        {children}
      </main>
    </div>
  );
}
