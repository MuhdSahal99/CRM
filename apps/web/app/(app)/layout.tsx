import { listModules, withTenant } from "@crm/core";
import { navItems } from "@/components/shell/nav-items";
import { MobileNav, Sidebar } from "@/components/shell/sidebar";
import { requireContext } from "@/lib/session";

// Every CRM page lives in this group: no session, no shell (T1.22). Nav comes from the org's modules (T1.23).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const items = navItems(await withTenant(ctx, listModules));
  return (
    <div data-app-shell className="flex min-h-svh">
      <Sidebar items={items} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background px-4 sm:px-6">
          <MobileNav items={items} />
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
