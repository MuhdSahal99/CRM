import { requireContext } from "@/lib/session";

// Every CRM page lives in this group: no session, no shell (T1.22).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireContext();
  return (
    <div data-app-shell className="min-h-svh">
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
