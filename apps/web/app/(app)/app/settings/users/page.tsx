import { listUsers, withTenant } from "@crm/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { type Column, DataTable } from "@/components/patterns/data-table";
import { Badge } from "@/components/ui/badge";
import { requireContext } from "@/lib/session";
import { InviteDialog } from "./invite-dialog";

export type UserRow = { id: string; name: string; email: string; role: string; status: string; manager: { id: string; name: string } | null };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("users");
  return { title: t("metaTitle") };
}

// US-03 (Admin): who is in the org, with role, manager and status; invite from here.
export default async function UsersPage() {
  const ctx = await requireContext();
  if (ctx.role !== "admin") notFound(); // 404, never 403, for what a role may not see (ADR-0005)
  const t = await getTranslations("users");
  // shortcut: one page of 200 users; add pagination when an org outgrows it (MVP orgs have under 50 users).
  const { data } = await withTenant(ctx, (tx) => listUsers(tx, { page: 1, per_page: 200 }));
  const users = data as UserRow[];
  const managers = users.filter((u) => u.status === "active" && u.role !== "rep").map((u) => ({ id: u.id, name: u.name }));

  const columns: Column<UserRow>[] = [
    { key: "name", header: t("name"), cell: (u) => u.name },
    { key: "email", header: t("email"), cell: (u) => <bdi>{u.email}</bdi> },
    { key: "role", header: t("role"), cell: (u) => t(`roles.${u.role}`) },
    { key: "manager", header: t("manager"), cell: (u) => u.manager?.name ?? t("noManager") },
    { key: "status", header: t("status"), cell: (u) => <Badge variant={u.status === "active" ? "secondary" : "outline"}>{t(`statuses.${u.status}`)}</Badge> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <InviteDialog managers={managers} />
      </div>
      <DataTable caption={t("caption")} columns={columns} rows={users} rowKey={(u) => u.id} emptyText={t("empty")} errorText={t("failed")} />
    </div>
  );
}
