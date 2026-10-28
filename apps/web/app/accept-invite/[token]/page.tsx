import { getAuthDb, getInvitation } from "@crm/core";
import { headers } from "next/headers";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { badToken, clientIp, gate } from "@/lib/rate-limit";
import { AcceptForm } from "./accept-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("accept");
  return { title: t("metaTitle") };
}

// US-03: public page behind the emailed link. An unknown, used or expired link is a plain 404.
export default async function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = clientIp(await headers());
  if (!(await gate("invite", ip)).allowed) notFound(); // T9.07: over the limit looks like an unknown link
  const invitation = await getInvitation(getAuthDb(), token);
  if (!invitation) {
    await badToken("invite", ip);
    notFound();
  }
  const t = await getTranslations("accept");
  const tBrand = await getTranslations("brand");

  return (
    <main className="flex min-h-svh flex-col px-4 py-6 sm:px-6">
      <Link href="/" className="self-start text-lg font-semibold tracking-tight">
        {tBrand("name")}
      </Link>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-16">
        <h1 className="text-[2rem] leading-tight font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-2 mb-8 text-base text-muted-foreground">{t("lead", { org: invitation.orgName })}</p>
        <AcceptForm token={token} email={invitation.email} name={invitation.name ?? ""} />
      </div>
    </main>
  );
}
