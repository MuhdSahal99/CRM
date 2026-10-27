import { getUser, listUsers, NotFound, withTenant } from "@crm/core";
import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { requireContext } from "@/lib/session";
import type { UserRow } from "../page";
import { EditUser } from "./edit-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("users");
  return { title: t("metaTitle") };
}

// US-03 (Admin): one member's role, manager and deactivation.
export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const { id } = await params;
  if (ctx.role !== "admin" || !z.uuid().safeParse(id).success) notFound();
  const t = await getTranslations("users");

  const found = await withTenant(ctx, async (tx) => {
    try {
      const [user] = (await getUser(tx, id)) as UserRow[];
      const { data } = await listUsers(tx, { status: "active", page: 1, per_page: 200 });
      return { user: user!, people: data as UserRow[] };
    } catch (error) {
      if (error instanceof NotFound) return null; // missing or another org's: the same 404
      throw error;
    }
  });
  if (!found) notFound();
  const { user, people } = found;
  const managers = people.filter((p) => p.id !== user.id && p.role !== "rep").map((p) => ({ id: p.id, name: p.name }));

  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/settings/users" className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:underline">
        <ChevronLeftIcon className="size-4 rtl:rotate-180" aria-hidden />
        {t("backToUsers")}
      </Link>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{user.name}</h1>
          <Badge variant={user.status === "active" ? "secondary" : "outline"}>{t(`statuses.${user.status}`)}</Badge>
        </div>
        <p className="text-muted-foreground">
          <bdi>{user.email}</bdi>
        </p>
      </div>
      <EditUser
        user={{ id: user.id, name: user.name, role: user.role, managerId: user.manager?.id ?? null, status: user.status }}
        managers={managers}
        isSelf={user.id === ctx.userId}
      />
    </div>
  );
}
