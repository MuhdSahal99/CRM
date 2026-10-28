"use client";

import { AlertTriangleIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInEmail } from "@/lib/auth-client";
import { acceptInvite } from "./actions";

type Failure = "invalid" | "gone" | "taken" | "unavailable" | "limited";

/** Sets the invited person's name and password, then signs them in and opens the app. */
export function AcceptForm({ token, email, name }: { token: string; email: string; name: string }) {
  const t = useTranslations("accept");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Failure | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    setPending(true);
    setError(null);
    const created = await acceptInvite(token, { name: String(form.get("name")), password }).catch(() => ({ ok: false, reason: "unavailable" }) as const);
    if (!created.ok) {
      setError(created.reason);
      setPending(false);
      return;
    }
    const signedIn = await signInEmail({ email: created.email, password, rememberMe: true });
    if (signedIn.ok) {
      router.push("/app");
      router.refresh();
      return;
    }
    setError("unavailable");
    setPending(false);
  }

  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-5" aria-busy={pending}>
      {error && (
        <p id="accept-error" role="alert" className="flex items-start gap-2 rounded-md bg-muted p-3 text-destructive">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t(`errors.${error}`)}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" type="email" value={email} readOnly dir="ltr" className="h-11" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">{t("name")}</Label>
        <Input id="name" name="name" defaultValue={name} autoComplete="name" required maxLength={100} className="h-11" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t("password")}</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} aria-describedby="password-hint" className="h-11" />
        <p id="password-hint" className="text-sm text-muted-foreground">{t("passwordHint")}</p>
      </div>
      <Button type="submit" size="lg" disabled={pending} className="h-11">
        {pending && <Loader2Icon className="animate-spin" aria-hidden />}
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
