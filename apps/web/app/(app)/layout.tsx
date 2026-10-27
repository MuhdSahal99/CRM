import { getMe, listModules, withTenant } from "@crm/core";
import { navItems } from "@/components/shell/nav-items";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { requireContext } from "@/lib/session";

// Every CRM page lives in this group: no session, no shell (T1.22). Nav comes from the org's modules (T1.23).
// The top bar is sticky, so globals.css reserves scroll-padding under it (WCAG 2.4.11).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const { modules, me } = await withTenant(ctx, async (tx) => ({ modules: await listModules(tx), me: await getMe(tx, ctx.userId) }));
  const items = navItems(modules);
  return (
    <div data-app-shell className="flex min-h-svh">
      <Sidebar items={items} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar items={items} orgName={me.org_name} user={{ name: me.name, email: me.email }} />
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
