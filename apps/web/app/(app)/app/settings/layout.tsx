import { SettingsNav } from "@/components/shell/settings-nav";
import { requireContext } from "@/lib/session";

// Admin-only pages (each one 404s for other roles); the sub-nav is shown only to admins.
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  return (
    <>
      {ctx.role === "admin" && <SettingsNav />}
      {children}
    </>
  );
}
