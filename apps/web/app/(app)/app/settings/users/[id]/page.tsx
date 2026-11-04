import { getUser, listUsers, NotFound, withTenant } from "@crm/core";
import { CircleDotIcon, ShieldIcon, UserRoundIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { BackLink } from "@/components/patterns/back-link";
import { MotionScope } from "@/components/patterns/motion-scope";
import { PageHeader } from "@/components/patterns/page-header";
import { StatChip } from "@/components/ui/status";
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

  const stats = (
    <>
      <StatChip icon={<ShieldIcon />} value={<span className="text-base">{t(`roles.${user.role}`)}</span>} label={t("role")} />
      <StatChip icon={<CircleDotIcon />} value={<span className="text-base">{t(`statuses.${user.status}`)}</span>} label={t("status")} />
      <StatChip icon={<UserRoundIcon />} value={<span className="text-base">{user.manager?.name ?? t("noManager")}</span>} label={t("manager")} />
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/app/settings/users">{t("backToUsers")}</BackLink>
      <PageHeader title={[t("member"), user.name]} stats={stats} />
      <p className="-mt-3 text-sm text-muted-foreground">
        <bdi>{user.email}</bdi>
      </p>
      <MotionScope className="grid grid-cols-1 gap-(--gap)">
        <EditUser
          user={{ id: user.id, name: user.name, role: user.role, managerId: user.manager?.id ?? null, status: user.status }}
          managers={managers} recipients={people.filter((p) => p.id !== user.id).map((p) => ({ id: p.id, name: p.name }))}
          isSelf={user.id === ctx.userId}
        />
      </MotionScope>
    </div>
  );
}
